import asyncio
import hashlib
import time
import uuid
from datetime import datetime, timezone
from typing import Any

import numpy as np

from .embeddings import EmbeddingService
from .event_source import EventSource
from .judge import SpecAndFitJudge, stub_spec_for
from .learning import LearningService
from .redis_store import INDEX_NAME, RedisStore, decode, decode_hash, json_dumps, json_loads, tag_escape
from .settings import Settings
from .tracing import agent_span, set_span_output
from .notify import Notifier
from .websocket import FeedHub


DEFAULT_WATCH_ID = "w_ml_hack"
DEFAULT_QUERY = "Alert me when a new in-person ML/AI hackathon opens registration within 100mi of SF"
SEED_FALSE_ALARM = 0.33
WATCH_FIELDS = ("status", "starts_at", "location")


class LookoutEngine:
    def __init__(
        self,
        settings: Settings,
        store: RedisStore,
        feed: FeedHub,
        source: EventSource,
        embeddings: EmbeddingService,
        judge: SpecAndFitJudge,
        learning: LearningService,
        notifier: Notifier | None = None,
    ) -> None:
        self.settings = settings
        self.store = store
        self.redis = store.redis
        self.feed = feed
        self.source = source
        self.embeddings = embeddings
        self.judge = judge
        self.learning = learning
        self.notifier = notifier
        self._poll_lock = asyncio.Lock()

    async def setup(self) -> None:
        self.store.ensure_index()
        if self.settings.seed_default_watch:
            self.seed_default_watch()

    def seed_default_watch(self) -> None:
        key = self.watch_key(DEFAULT_WATCH_ID)
        if self.redis.exists(key):
            return
        spec = stub_spec_for(DEFAULT_QUERY)
        self.redis.hset(
            key,
            mapping={
                "query_text": DEFAULT_QUERY,
                "must_match": json_dumps(spec["must_match"]),
                "reject_cases": json_dumps(spec["reject_cases"]),
                "status": "watching",
            },
        )
        self._append_curve(DEFAULT_WATCH_ID, SEED_FALSE_ALARM)

    async def poll_once(self) -> list[dict[str, Any]]:
        async with self._poll_lock:
            watches = [watch for watch in self.get_watches() if watch["status"] == "watching"]
            if not watches:
                return []
            events = await asyncio.to_thread(self.source.poll)
            results: list[dict[str, Any]] = []
            for event in events:
                for watch in watches:
                    with agent_span(
                        "watch.process_event",
                        span_kind="CHAIN",
                        input_value=str(event.get("title") or event.get("id") or ""),
                        attributes={"lookout.watch_id": str(watch.get("id", ""))},
                    ) as span:
                        result = await self.process_event(watch, event, broadcast=True, notify=True)
                        set_span_output(span, result)
                        results.append(result)
            return results

    async def process_event(
        self,
        watch: dict[str, Any],
        event: dict[str, Any],
        broadcast: bool,
        notify: bool = False,
    ) -> dict[str, Any]:
        watch_id = watch["id"]
        cid = candidate_id(event)
        event_token = str(event.get("id") or cid)
        content_hash = hash_event(event)
        embedding = self.embeddings.embed(f"{event.get('title', '')}. {event.get('description', '')}")
        seen_key = self.seen_key(watch_id)
        key = self.candidate_key(watch_id, cid)

        if self.redis.sismember(seen_key, event_token) or self.redis.sismember(seen_key, content_hash):
            existing = decode_hash(self.redis.hgetall(key))
            if existing and has_watched_change(existing, event):
                learned_score = self._learned_score(watch_id, embedding, watch)
                judgment = await self.judge.judge_candidate(watch, event, learned_score)
                self._store_candidate(
                    watch_id=watch_id,
                    cid=cid,
                    event=event,
                    embedding=embedding,
                    content_hash=content_hash,
                    state="changed",
                    judgment=judgment,
                    duplicate_of=None,
                )
                payload = self._candidate_payload(watch_id, cid)
                if broadcast:
                    await self.feed.broadcast(payload)
                return {"status": "CHANGED", "id": cid, "reason": "watched fields changed"}
            return {"status": "DROP", "id": cid, "reason": "exact seen"}

        duplicate = self.semantic_duplicate(watch_id, embedding)
        if duplicate and duplicate["score"] <= self.settings.semantic_duplicate_distance:
            duplicate_of = duplicate.get("duplicate_of") or duplicate["id"]
            judgment = {
                "judgment": "rejected",
                "reason": f"Semantic duplicate of {duplicate_of} at cosine distance {duplicate['score']:.3f}.",
                "reasoning": "RediSearch HNSW linked this to an already-seen candidate under the same watch namespace.",
                "criteria": [{"ok": True, "text": "Linked via Redis vector KNN"}],
            }
            self._store_candidate(
                watch_id=watch_id,
                cid=cid,
                event=event,
                embedding=embedding,
                content_hash=content_hash,
                state="duplicate",
                judgment=judgment,
                duplicate_of=duplicate_of,
            )
            self.redis.sadd(seen_key, event_token, content_hash)
            self._link_duplicate(duplicate["key"], cid)
            return {
                "status": "DUP",
                "id": cid,
                "reason": judgment["reason"],
                "duplicate_of": duplicate_of,
                "score": duplicate["score"],
            }

        learned_score = self._learned_score(watch_id, embedding, watch)
        judgment = await self.judge.judge_candidate(watch, event, learned_score)
        self._store_candidate(
            watch_id=watch_id,
            cid=cid,
            event=event,
            embedding=embedding,
            content_hash=content_hash,
            state="new",
            judgment=judgment,
            duplicate_of=None,
        )
        self.redis.sadd(seen_key, event_token, content_hash)
        payload = self._candidate_payload(watch_id, cid)
        surfaced = str(judgment.get("judgment")) == "accepted"
        # Only live arrivals (notify=True) ping channels — never historical backfill.
        if notify and surfaced:
            payload["notify"] = True
            if self.notifier is not None:
                try:
                    await asyncio.to_thread(self.notifier.notify_surfaced, watch, payload)
                except Exception as exc:
                    print(f"[notify] dispatch failed: {exc!r}")
        if broadcast:
            await self.feed.broadcast(payload)
        return {"status": "NEW", "id": cid, "reason": judgment["reason"]}

    def semantic_duplicate(self, watch_id: str, embedding: np.ndarray) -> dict[str, Any] | None:
        bvec = np.asarray(embedding, dtype=np.float32).tobytes()
        query = f"(@watch_id:{{{tag_escape(watch_id)}}})=>[KNN 3 @vec $bvec AS score]"
        response = self.redis.execute_command(
            "FT.SEARCH",
            INDEX_NAME,
            query,
            "PARAMS",
            "2",
            "bvec",
            bvec,
            "SORTBY",
            "score",
            "ASC",
            "DIALECT",
            "2",
        )
        if not response or int(response[0]) == 0:
            return None
        best: dict[str, Any] | None = None
        index = 1
        while index < len(response):
            raw_key = decode(response[index])
            fields = parse_search_fields(response[index + 1]) if index + 1 < len(response) else {}
            score = float(fields.get("score") or "inf")
            cid = str(fields.get("id") or raw_key.rsplit(":", 1)[-1])
            item = {
                "key": raw_key,
                "id": cid,
                "score": score,
                "state": fields.get("state"),
                "duplicate_of": fields.get("duplicate_of"),
            }
            if best is None or item["score"] < best["score"]:
                best = item
            index += 2
        return best

    def create_watch(self, query_text: str) -> str:
        watch_id = f"w_{uuid.uuid4().hex[:10]}"
        self.redis.hset(
            self.watch_key(watch_id),
            mapping={
                "query_text": query_text,
                "must_match": json_dumps([]),
                "reject_cases": json_dumps([]),
                "status": "compiling",
            },
        )
        self._append_curve(watch_id, SEED_FALSE_ALARM)
        return watch_id

    async def compile_watch(self, watch_id: str) -> None:
        watch = self.get_watch(watch_id)
        if not watch:
            return
        spec = await self.judge.compile_spec(watch["query_text"])
        self.redis.hset(
            self.watch_key(watch_id),
            mapping={
                "must_match": json_dumps(spec["must_match"]),
                "reject_cases": json_dumps(spec["reject_cases"]),
                "status": "watching",
            },
        )
        await self.feed.broadcast(
            {
                "type": "spec_ready",
                "watch_id": watch_id,
                "must_match": spec["must_match"],
                "reject_cases": spec["reject_cases"],
            }
        )
        # BUG-3 fix: evaluate the known event pool against the brand-new watch so its
        # lane fills immediately instead of waiting for the global cursor to come around.
        await self.backfill_watch(watch_id)

    async def backfill_watch(self, watch_id: str, limit: int = 40) -> None:
        watch = self.get_watch(watch_id)
        if not watch or watch["status"] != "watching":
            return
        snapshot = getattr(self.source, "snapshot", None)
        if not callable(snapshot):
            return
        try:
            events = await asyncio.to_thread(snapshot)
        except Exception as exc:  # never let backfill crash watch creation
            print(f"[backfill] snapshot failed: {exc!r}")
            return
        for event in events[:limit]:
            try:
                await self.process_event(watch, event, broadcast=True)
            except Exception as exc:
                print(f"[backfill] {watch_id} event failed: {exc!r}")

    def update_spec(
        self, watch_id: str, must_match: list[str], reject_cases: list[str]
    ) -> dict[str, Any]:
        if not self.get_watch(watch_id):
            raise KeyError(watch_id)
        self.redis.hset(
            self.watch_key(watch_id),
            mapping={
                "must_match": json_dumps([str(m) for m in must_match]),
                "reject_cases": json_dumps([str(r) for r in reject_cases]),
                "status": "watching",
            },
        )
        return self.get_watch(watch_id)

    def get_watches(self) -> list[dict[str, Any]]:
        watches: list[dict[str, Any]] = []
        for key in self.redis.scan_iter(match="watch:*:spec"):
            watch_id = decode(key).split(":")[1]
            watch = self.get_watch(watch_id)
            if watch:
                watches.append(watch)
        watches.sort(key=lambda item: item["id"])
        return watches

    def get_watch(self, watch_id: str) -> dict[str, Any] | None:
        raw = decode_hash(self.redis.hgetall(self.watch_key(watch_id)))
        if not raw:
            return None
        must_match = json_loads(raw.get("must_match"), [])
        reject_cases = json_loads(raw.get("reject_cases"), [])
        return {
            "id": watch_id,
            "query_text": str(raw.get("query_text") or ""),
            "spec": {"must_match": must_match, "reject_cases": reject_cases},
            "status": str(raw.get("status") or "watching"),
            "threshold": float(raw.get("threshold") or 0.5),
        }

    async def feedback(self, cid: str, label: str, watch_id: str | None = None) -> dict[str, Any]:
        key: str | None = None
        cand: dict[str, Any] | None = None
        # BUG-1 fix: when the caller knows the watch, target that exact candidate so
        # feedback never lands on a same-id copy under a different watch.
        if watch_id:
            candidate_key = self.candidate_key(watch_id, cid)
            found = decode_hash(self.redis.hgetall(candidate_key))
            if found:
                key, cand = candidate_key, found
        if not cand:
            key, cand = self.find_candidate(cid)
        if not key or not cand:
            raise KeyError(cid)
        watch_id = str(cand["watch_id"])
        self.redis.hset(key, mapping={"label": label})
        training = self.learning.train_if_ready(watch_id)
        point = self.recompute_curve(watch_id)
        await self.feed.broadcast({"type": "curve_update", "watch_id": watch_id, **point})
        return {"ok": True, "training": training, "curve": point}

    def find_candidate(self, cid: str) -> tuple[str | None, dict[str, Any] | None]:
        # Prefer the accepted, non-duplicate copy (the one that drives the curve) when the
        # same event id exists under multiple watches; otherwise fall back to the first match.
        fallback: tuple[str | None, dict[str, Any] | None] = (None, None)
        for key in self.redis.scan_iter(match=f"cand:*:{cid}"):
            raw_key = decode(key)
            cand = decode_hash(self.redis.hgetall(key))
            if not cand:
                continue
            if cand.get("judgment") == "accepted" and cand.get("state") != "duplicate":
                return raw_key, cand
            if fallback[0] is None:
                fallback = (raw_key, cand)
        return fallback

    def list_candidates(self, watch_id: str | None = None) -> list[dict[str, Any]]:
        # BUG-2 fix: REST backfill so a page refresh rehydrates the board instead of
        # losing every candidate that only arrived over the WebSocket.
        pattern = self.candidate_key(watch_id, "*") if watch_id else "cand:*:*"
        items: list[dict[str, Any]] = []
        for key in self.redis.scan_iter(match=pattern):
            parts = decode(key).split(":", 2)
            if len(parts) < 3:
                continue
            items.append(self._candidate_payload(parts[1], parts[2]))
        items.sort(key=lambda item: str(item.get("timestamp") or ""))
        return items

    def recompute_curve(self, watch_id: str) -> dict[str, Any]:
        accepted = 0
        false_alarms = 0
        for key in self.redis.scan_iter(match=f"cand:{watch_id}:*"):
            cand = decode_hash(self.redis.hgetall(key))
            if cand.get("judgment") != "accepted" or cand.get("state") == "duplicate":
                continue
            accepted += 1
            if cand.get("label") == "not_relevant":
                false_alarms += 1
        rate = ((SEED_FALSE_ALARM * 3.0) + false_alarms) / (3.0 + accepted)
        return self._append_curve(watch_id, max(0.0, min(1.0, rate)))

    def get_curve(self, watch_id: str | None = None) -> list[dict[str, Any]]:
        # BUG-1 fix: return a single watch's series (default = most-accepted "primary"
        # watch) so the precision curve is coherent and falls cleanly on screen.
        target = watch_id or self._primary_watch_id()
        if target:
            return self._curve_points(self.metrics_key(target))
        points: list[dict[str, Any]] = []
        for key in self.redis.scan_iter(match="watch:*:metrics"):
            points.extend(self._curve_points(decode(key)))
        points.sort(key=lambda item: item["timestamp"])
        return points

    def _curve_points(self, metrics_key: str) -> list[dict[str, Any]]:
        points: list[dict[str, Any]] = []
        for member in self.redis.zrange(metrics_key, 0, -1):
            point = json_loads(member, None)
            if point:
                points.append(point)
        points.sort(key=lambda item: item["timestamp"])
        return points

    def _primary_watch_id(self) -> str | None:
        best_id: str | None = None
        best_score = (-1, -1)  # (accepted, total) — most-active watch wins
        for watch in self.get_watches():
            wid = watch["id"]
            accepted = total = 0
            for key in self.redis.scan_iter(match=f"cand:{wid}:*"):
                cand = decode_hash(self.redis.hgetall(key))
                total += 1
                if cand.get("judgment") == "accepted" and cand.get("state") != "duplicate":
                    accepted += 1
            score = (accepted, total)
            if score > best_score:
                best_score = score
                best_id = wid
        return best_id

    async def emit_pipeline(self, cid: str) -> None:
        _, cand = self.find_candidate(cid)
        cand = cand or {}
        watch = self.get_watch(str(cand.get("watch_id"))) if cand.get("watch_id") else None
        stages = ["scout", "judge", "strategist", "drafter", "critic"]
        with agent_span(
            "act_pipeline",
            span_kind="CHAIN",
            input_value=f"candidate={cid}",
            attributes={"lookout.candidate_id": cid},
        ) as pipeline_span:
            for stage in stages:
                with agent_span(
                    f"agent.{stage}",
                    span_kind="AGENT",
                    input_value=f"candidate={cid}",
                    attributes={"lookout.stage": stage, "lookout.candidate_id": cid},
                ) as stage_span:
                    await self.feed.broadcast({"type": "pipeline_stage", "stage": stage, "status": "running"})
                    await asyncio.sleep(0.35)
                    snippet = pipeline_snippet(stage, cid, cand, watch)
                    set_span_output(stage_span, snippet)
                    await self.feed.broadcast(
                        {
                            "type": "pipeline_stage",
                            "stage": stage,
                            "status": "done",
                            "output_snippet": snippet,
                        }
                    )
            set_span_output(pipeline_span, f"completed {len(stages)} stages for {cid}")

    def _store_candidate(
        self,
        watch_id: str,
        cid: str,
        event: dict[str, Any],
        embedding: np.ndarray,
        content_hash: str,
        state: str,
        judgment: dict[str, Any],
        duplicate_of: str | None,
    ) -> None:
        mapping: dict[str, Any] = {
            "id": cid,
            "raw_id": str(event.get("id") or ""),
            "watch_id": watch_id,
            "title": str(event.get("title") or ""),
            "source": str(event.get("source") or ""),
            "url": str(event.get("url") or ""),
            "starts_at": str(event.get("starts_at") or ""),
            "location": str(event.get("location") or ""),
            "status": str(event.get("status") or ""),
            "description": str(event.get("description") or ""),
            "thumbnail": str(event.get("thumbnail") or ""),
            "content_hash": content_hash,
            "first_seen": now_iso(),
            "timestamp": now_iso(),
            "state": state,
            "judgment": str(judgment.get("judgment") or "rejected"),
            "reason": str(judgment.get("reason") or ""),
            "reasoning": str(judgment.get("reasoning") or judgment.get("reason") or ""),
            "criteria": json_dumps(judgment.get("criteria") or []),
            "vec": np.asarray(embedding, dtype=np.float32).tobytes(),
        }
        if duplicate_of:
            mapping["duplicate_of"] = duplicate_of
        existing = decode_hash(self.redis.hgetall(self.candidate_key(watch_id, cid)))
        if existing.get("first_seen"):
            mapping["first_seen"] = existing["first_seen"]
        # Preserve an existing application so re-processing never wipes it.
        if existing.get("applied"):
            mapping["applied"] = existing["applied"]
            mapping["applied_at"] = existing.get("applied_at", "")
        self.redis.hset(self.candidate_key(watch_id, cid), mapping=mapping)

    def _candidate_payload(self, watch_id: str, cid: str) -> dict[str, Any]:
        cand = decode_hash(self.redis.hgetall(self.candidate_key(watch_id, cid)))
        return {
            "type": "candidate",
            "watch_id": watch_id,
            "id": cid,
            "title": cand.get("title"),
            "source": cand.get("source"),
            "url": cand.get("url"),
            "thumbnail": cand.get("thumbnail"),
            "location": cand.get("location"),
            "starts_at": cand.get("starts_at"),
            "status": cand.get("status"),
            "judgment": cand.get("judgment"),
            "reason": cand.get("reason"),
            "reasoning": cand.get("reasoning"),
            "criteria": json_loads(cand.get("criteria"), []),
            "state": cand.get("state"),
            "applied": cand.get("applied") == "1",
            "applied_at": cand.get("applied_at") or "",
            "timestamp": cand.get("timestamp") or now_iso(),
        }

    def mark_applied(self, cid: str, watch_id: str | None = None) -> dict[str, Any]:
        key: str | None = None
        if watch_id:
            candidate_key = self.candidate_key(watch_id, cid)
            if self.redis.exists(candidate_key):
                key = candidate_key
        if key is None:
            key, _ = self.find_candidate(cid)
        if key is None:
            raise KeyError(cid)
        self.redis.hset(key, mapping={"applied": "1", "applied_at": now_iso()})
        return {"ok": True, "applied_at": now_iso()}

    def _learned_score(self, watch_id: str, embedding: np.ndarray, watch: dict[str, Any]) -> float | None:
        scored = self.learning.score(watch_id, embedding)
        if not scored:
            return None
        probability, threshold = scored
        watch["threshold"] = threshold
        return probability

    def _append_curve(self, watch_id: str, rate: float) -> dict[str, Any]:
        point = {"timestamp": now_iso(), "false_alarm_rate": round(rate, 4)}
        self.redis.zadd(self.metrics_key(watch_id), {json_dumps(point): int(time.time() * 1000)})
        return point

    def _link_duplicate(self, original_key: str, duplicate_id: str) -> None:
        existing = decode_hash(self.redis.hgetall(original_key))
        linked = json_loads(existing.get("linked_ids"), [])
        if duplicate_id not in linked:
            linked.append(duplicate_id)
        self.redis.hset(original_key, mapping={"linked_ids": json_dumps(linked)})

    @staticmethod
    def watch_key(watch_id: str) -> str:
        return f"watch:{watch_id}:spec"

    @staticmethod
    def seen_key(watch_id: str) -> str:
        return f"watch:{watch_id}:seen"

    @staticmethod
    def metrics_key(watch_id: str) -> str:
        return f"watch:{watch_id}:metrics"

    @staticmethod
    def candidate_key(watch_id: str, cid: str) -> str:
        return f"cand:{watch_id}:{cid}"


def candidate_id(event: dict[str, Any]) -> str:
    raw = str(event.get("id") or hash_event(event)[:12])
    safe = "".join(char if char.isalnum() or char in "_-" else "_" for char in raw).strip("_")
    return safe or f"c_{hashlib.sha1(raw.encode('utf-8')).hexdigest()[:12]}"


def hash_event(event: dict[str, Any]) -> str:
    stable = "|".join(str(event.get(field, "")) for field in ("title", "url", "starts_at", "location", "status", "description"))
    return hashlib.sha1(stable.encode("utf-8")).hexdigest()


def has_watched_change(existing: dict[str, Any], event: dict[str, Any]) -> bool:
    return any(str(existing.get(field, "")) != str(event.get(field, "")) for field in WATCH_FIELDS)


def parse_search_fields(raw: Any) -> dict[str, Any]:
    fields: dict[str, Any] = {}
    if not isinstance(raw, list):
        return fields
    for index in range(0, len(raw), 2):
        name = decode(raw[index])
        value = raw[index + 1] if index + 1 < len(raw) else None
        if name == "vec":
            continue
        fields[name] = decode(value)
    return fields


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def pipeline_snippet(
    stage: str,
    cid: str,
    cand: dict[str, Any] | None = None,
    watch: dict[str, Any] | None = None,
) -> str:
    cand = cand or {}
    title = cand.get("title") or cid
    source = cand.get("source") or "source"
    location = cand.get("location") or "—"
    starts_at = cand.get("starts_at") or "soon"
    must = (watch or {}).get("spec", {}).get("must_match", []) if watch else []
    must_txt = "; ".join(must[:2]) if must else "the compiled watch spec"
    snippets = {
        "scout": f'Loaded "{title}" ({source}) from Redis memory.',
        "judge": f"Checked against {must_txt} and the learned relevance bar.",
        "strategist": f"Prioritized: {location}, starts {starts_at} — fresh, local, time-sensitive.",
        "drafter": f'Drafted an application/outreach angle for "{title}".',
        "critic": "Red-teamed the draft against the spec; removed unsupported claims.",
    }
    return snippets.get(stage, "Stage complete.")

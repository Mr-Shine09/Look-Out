import asyncio
import json
import os
import re
from typing import Any


DEFAULT_MUST_MATCH = [
    "In-person event (not virtual-only)",
    "Theme is ML, AI, or data",
    "Located within ~100mi of San Francisco",
    "Registration currently open",
]

DEFAULT_REJECT_CASES = [
    "Online / virtual-only events",
    "Pure Web3 / crypto hackathons",
    "Already-closed or past registration",
    "Career fairs or info sessions (not build events)",
]


class SpecAndFitJudge:
    def __init__(
        self,
        api_key: str | None,
        provider: str | None = None,
        ollama_host: str | None = None,
        ollama_model: str | None = None,
    ) -> None:
        self.api_key = api_key
        self.model = os.getenv("LOOKOUT_ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")
        self.ollama_host = (ollama_host or os.getenv("LOOKOUT_OLLAMA_HOST", "http://localhost:11434")).rstrip("/")
        self.ollama_model = ollama_model or os.getenv("LOOKOUT_OLLAMA_MODEL", "llama3.1:8b")
        # "anthropic" | "ollama" | "stub" | "auto" (auto = anthropic if keyed, else stub)
        self.provider = (provider or os.getenv("LOOKOUT_JUDGE_PROVIDER", "auto")).lower()
        if self.provider == "auto":
            self.provider = "anthropic" if api_key else "stub"

    async def compile_spec(self, query_text: str) -> dict[str, list[str]]:
        try:
            if self.provider == "anthropic" and self.api_key:
                return await asyncio.to_thread(self._compile_spec_with_claude, query_text)
            if self.provider == "ollama":
                return await asyncio.to_thread(self._compile_spec_with_ollama, query_text)
        except Exception:
            pass
        return stub_spec_for(query_text)

    async def judge_candidate(
        self,
        watch: dict[str, Any],
        event: dict[str, Any],
        learned_score: float | None = None,
    ) -> dict[str, Any]:
        if learned_score is not None and learned_score < float(watch.get("threshold", 0.5)):
            return {
                "judgment": "rejected",
                "reason": f"Learned Redis relevance bar scored this at {learned_score:.2f}, below threshold.",
                "reasoning": "The per-watch logistic model was trained from feedback labels stored in Redis and filtered this before spending a model call.",
                "criteria": [{"ok": False, "text": "Below learned relevance threshold"}],
            }
        try:
            if self.provider == "anthropic" and self.api_key:
                return await asyncio.to_thread(self._judge_with_claude, watch, event, learned_score)
            if self.provider == "ollama":
                return await asyncio.to_thread(self._judge_with_ollama, watch, event, learned_score)
        except Exception:
            pass
        return stub_judgment(watch, event, learned_score)

    def _compile_spec_with_claude(self, query_text: str) -> dict[str, list[str]]:
        from anthropic import Anthropic

        client = Anthropic(api_key=self.api_key)
        message = client.messages.create(
            model=self.model,
            max_tokens=700,
            temperature=0,
            system="Return only compact JSON with keys must_match and reject_cases. No prose.",
            messages=[
                {
                    "role": "user",
                    "content": (
                        "Compile this watch query into BROAD Lookout matching criteria. "
                        "Keep it lenient: at most 2-3 must_match items capturing only the "
                        "CORE topic/intent of the query. Do NOT add narrow constraints that "
                        "are rarely present in event listings (exact coordinates, precise "
                        "registration_status, specific date windows). Add at most 2-3 "
                        "reject_cases for clearly-unwanted results only. "
                        f"Query: {query_text!r}. JSON shape: "
                        "{\"must_match\":[...],\"reject_cases\":[...]}"
                    ),
                }
            ],
        )
        return _coerce_spec(_message_text(message))

    def _judge_with_claude(
        self,
        watch: dict[str, Any],
        event: dict[str, Any],
        learned_score: float | None,
    ) -> dict[str, Any]:
        from anthropic import Anthropic

        client = Anthropic(api_key=self.api_key)
        message = client.messages.create(
            model=self.model,
            max_tokens=900,
            temperature=0,
            system="You are a LENIENT relevance filter. Return only compact JSON. No prose.",
            messages=[
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "task": (
                                "Decide if the candidate is RELEVANT to the watcher's core "
                                "interest expressed in watch_query. Be lenient: ACCEPT if the "
                                "candidate is topically on-target, even when some details "
                                "(exact location, dates, format, registration state) are "
                                "missing or only partially match. Treat 'must_match' as SOFT "
                                "preferences, not hard gates. Only REJECT if the candidate is "
                                "clearly off-topic for watch_query OR clearly matches one of "
                                "the reject_cases."
                            ),
                            "return_shape": {
                                "judgment": "accepted|rejected",
                                "reason": "one line",
                                "reasoning": "short explanation",
                                "criteria": [{"ok": True, "text": "criterion"}],
                            },
                            "watch_query": watch.get("query_text", ""),
                            "watch": watch,
                            "candidate": event,
                            "learned_score": learned_score,
                        }
                    ),
                }
            ],
        )
        return _coerce_judgment(_message_text(message), watch, event, learned_score)

    def _compile_spec_with_ollama(self, query_text: str) -> dict[str, list[str]]:
        prompt = (
            "Return only compact JSON with keys must_match and reject_cases. No prose.\n"
            "Compile this watch query into BROAD Lookout matching criteria. "
            "Keep it lenient: at most 2-3 must_match items capturing only the "
            "CORE topic/intent of the query. Do NOT add narrow constraints that "
            "are rarely present in event listings (exact coordinates, precise "
            "registration_status, specific date windows). Add at most 2-3 "
            "reject_cases for clearly-unwanted results only. "
            "Every item in must_match and reject_cases MUST be a short plain-English "
            "sentence (a string) — never a nested object or key-value pairs.\n"
            f"Query: {query_text!r}.\n"
            "Example for query 'in-person AI hackathons near SF':\n"
            '{"must_match":["In-person event","AI/ML or data themed",'
            '"Located near San Francisco"],'
            '"reject_cases":["Online / virtual-only events","Pure crypto or Web3 events"]}\n'
            "Now produce the JSON for the actual query above, same shape: "
            "{\"must_match\":[...],\"reject_cases\":[...]}"
        )
        return _coerce_spec(self._ollama_chat(prompt))

    def _judge_with_ollama(
        self,
        watch: dict[str, Any],
        event: dict[str, Any],
        learned_score: float | None,
    ) -> dict[str, Any]:
        prompt = (
            "You are a relevance filter. Return only compact JSON. No prose.\n"
            "Decide if the candidate is RELEVANT to the watcher's core interest in "
            "watch_query. Treat must_match items as SOFT preferences: accept even if "
            "some details (exact location, dates, format, registration state) are "
            "missing or only partially match. But reject_cases are HARD gates: if the "
            "candidate matches the topic/theme of ANY reject_case (e.g. it is online/"
            "virtual and a reject_case says virtual, or it is crypto/web3 and a "
            "reject_case says crypto/web3), you MUST reject it even if it also looks "
            "topically related to the watch_query. When must_match and a reject_case "
            "conflict, reject_cases win.\n"
            "Example: watch_query='AI hackathons near SF', reject_cases include "
            "'Online / virtual-only events'. Candidate is an online web3 meetup -> "
            'judgment MUST be "rejected" (matches the virtual reject_case), even '
            "though web3 sounds tech-adjacent.\n"
            "return_shape: {\"judgment\":\"accepted|rejected\",\"reason\":\"one line\","
            '"reasoning":"short explanation","criteria":[{"ok":true,"text":"criterion"}]}\n'
            "Input:\n"
            + json.dumps(
                {
                    "watch_query": watch.get("query_text", ""),
                    "watch": watch,
                    "candidate": event,
                    "learned_score": learned_score,
                }
            )
        )
        return _coerce_judgment(self._ollama_chat(prompt), watch, event, learned_score)

    def _ollama_chat(self, prompt: str) -> str:
        import requests

        resp = requests.post(
            f"{self.ollama_host}/api/chat",
            json={
                "model": self.ollama_model,
                "messages": [{"role": "user", "content": prompt}],
                "format": "json",
                "stream": False,
                "options": {"temperature": 0},
            },
            timeout=60,
        )
        resp.raise_for_status()
        return resp.json().get("message", {}).get("content", "")


def stub_spec_for(query_text: str) -> dict[str, list[str]]:
    q = query_text.lower()
    must_match = ["Matches the described intent"]
    reject_cases = ["Clearly off-topic results"]
    if re.search(r"in[- ]person|nearby|within|\bsf\b|san francisco", q):
        must_match.append("In-person event (not virtual-only)")
        reject_cases.append("Online / virtual-only events")
    if re.search(r"\bml\b|ai|machine learning|llm|agent|data|hackathon", q):
        must_match.append("ML / AI / data themed")
        reject_cases.append("Pure Web3 / crypto events")
    if re.search(r"\bsf\b|san francisco|100mi|100 mi|miles|within", q):
        must_match.append("Located within the specified radius")
        reject_cases.append("Outside the specified radius")
    if re.search(r"open|registration|deadline", q):
        must_match.append("Registration / deadline still open")
        reject_cases.append("Already closed or past deadline")
    if must_match == ["Matches the described intent"]:
        must_match = DEFAULT_MUST_MATCH.copy()
        reject_cases = DEFAULT_REJECT_CASES.copy()
    return {"must_match": must_match, "reject_cases": reject_cases}


def stub_judgment(
    watch: dict[str, Any],
    event: dict[str, Any],
    learned_score: float | None = None,
) -> dict[str, Any]:
    text = " ".join(
        str(event.get(field, ""))
        for field in ("title", "description", "location", "status", "source")
    ).lower()
    criteria: list[dict[str, Any]] = []
    rejections: list[str] = []

    is_event = bool(re.search(r"hackathon|buildathon|sprint|jam|challenge|datathon|makeathon", text))
    is_ai = bool(re.search(r"\bai\b|ml|machine learning|llm|agent|data|vision|robotics|genai", text))
    is_virtual = bool(re.search(r"online|virtual|remote-only|webinar", text))
    is_crypto = bool(re.search(r"crypto|web3|ethereum|defi|blockchain", text))
    is_career = bool(re.search(r"career fair|job fair|info session|webinar", text))
    is_closed = str(event.get("status", "")).lower() not in {"open", "just_opened"}
    near_sf = bool(
        re.search(
            r"san francisco|sf|berkeley|oakland|san jose|stanford|palo alto|santa clara|san mateo|daly city|mountain view",
            text,
        )
    )

    criteria.append({"ok": not is_virtual, "text": "In-person / physical venue"})
    criteria.append({"ok": is_ai, "text": "AI / ML / data theme"})
    criteria.append({"ok": near_sf, "text": "Within Bay Area radius"})
    criteria.append({"ok": not is_closed, "text": "Registration or listing is open"})
    criteria.append({"ok": is_event, "text": "Build event rather than passive listing"})

    if is_virtual:
        rejections.append("Virtual-only — fails the in-person requirement.")
    if is_crypto:
        rejections.append("Web3/crypto focus — excluded by reject cases.")
    if is_career:
        rejections.append("Career fair or info session, not a build event.")
    if is_closed:
        rejections.append("Registration is not currently open.")
    if not near_sf and _watch_mentions_sf(watch):
        rejections.append("Outside the requested San Francisco radius.")
    if not is_ai and _watch_mentions_ai(watch):
        rejections.append("Does not match the requested AI / ML theme.")
    if not is_event and _watch_mentions_hackathon(watch):
        rejections.append("Not a hackathon or build event.")

    requires_event = _watch_mentions_hackathon(watch)
    accepted = (
        not rejections
        and (is_event or not requires_event)
        and (is_ai or not _watch_mentions_ai(watch))
    )
    if accepted:
        score_text = f" Learned score {learned_score:.2f}." if learned_score is not None else ""
        reason = f"In-person AI/ML build event near SF with registration open.{score_text}"
        reasoning = "The candidate satisfies the must-match criteria and triggers no deterministic reject cases."
        judgment = "accepted"
    else:
        reason = rejections[0] if rejections else "Does not strongly satisfy the watch spec."
        reasoning = "The deterministic stub judge rejected this based on the watch spec until an Anthropic key is configured."
        judgment = "rejected"

    return {"judgment": judgment, "reason": reason, "reasoning": reasoning, "criteria": criteria}


def _watch_mentions_sf(watch: dict[str, Any]) -> bool:
    return bool(re.search(r"\bsf\b|san francisco|100mi|100 mi|bay area|within", str(watch).lower()))


def _watch_mentions_ai(watch: dict[str, Any]) -> bool:
    return bool(re.search(r"\bai\b|\bml\b|machine learning|llm|agent|data", str(watch).lower()))


def _watch_mentions_hackathon(watch: dict[str, Any]) -> bool:
    return bool(re.search(r"hackathon|buildathon|datathon|event", str(watch).lower()))


def _message_text(message: Any) -> str:
    parts: list[str] = []
    for block in getattr(message, "content", []) or []:
        text = getattr(block, "text", None)
        if text:
            parts.append(text)
    return "\n".join(parts)


def _json_from_text(text: str) -> dict[str, Any]:
    try:
        return json.loads(text)
    except Exception:
        match = re.search(r"\{.*\}", text, re.S)
        if not match:
            raise
        return json.loads(match.group(0))


def _coerce_spec(text: str) -> dict[str, list[str]]:
    parsed = _json_from_text(text)
    must_match = parsed.get("must_match") or []
    reject_cases = parsed.get("reject_cases") or []
    return {
        "must_match": [str(item) for item in must_match],
        "reject_cases": [str(item) for item in reject_cases],
    }


def _coerce_judgment(
    text: str,
    watch: dict[str, Any],
    event: dict[str, Any],
    learned_score: float | None,
) -> dict[str, Any]:
    try:
        parsed = _json_from_text(text)
    except Exception:
        return stub_judgment(watch, event, learned_score)
    judgment = str(parsed.get("judgment", "rejected")).lower()
    if judgment not in {"accepted", "rejected"}:
        judgment = "rejected"
    criteria = parsed.get("criteria") if isinstance(parsed.get("criteria"), list) else []
    return {
        "judgment": judgment,
        "reason": str(parsed.get("reason") or "Judged by Claude."),
        "reasoning": str(parsed.get("reasoning") or parsed.get("reason") or "Judged by Claude."),
        "criteria": criteria,
    }

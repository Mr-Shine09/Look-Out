"""Web-search event source.

Drop-in replacement for ``ScrapeEventSource`` / ``SeedEventSource`` (implements
the same ``poll()`` + ``snapshot()`` contract).  Instead of scraping a fixed
Luma page, it runs one or more natural-language queries through a web-search
API (Tavily by default) and normalises each result into the Lookout event
schema.  Results are cached to disk so repeated polls do not re-hit the API.

This lets a watch effectively "search the open web" for events across Devpost,
MLH, Eventbrite, Luma, etc. in a single pass, rather than being limited to one
hand-coded site parser.
"""

from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests


REQUIRED_EVENT_FIELDS = {
    "id",
    "title",
    "source",
    "url",
    "starts_at",
    "location",
    "status",
    "description",
}

_TAVILY_ENDPOINT = "https://api.tavily.com/search"


def _domain_label(url: str) -> str:
    try:
        host = urlparse(url).netloc.lower().lstrip("www.")
    except Exception:
        return "Web"
    mapping = {
        "devpost.com": "Devpost",
        "mlh.io": "MLH",
        "eventbrite.com": "Eventbrite",
        "lu.ma": "Luma",
        "meetup.com": "Meetup",
    }
    for key, label in mapping.items():
        if host.endswith(key):
            return label
    return host or "Web"


class SearchEventSource:
    def __init__(
        self,
        queries: list[str],
        api_key: str | None,
        cache_path: Path,
        batch_size: int = 5,
        refresh_seconds: int = 1800,
        max_results: int = 10,
        include_domains: list[str] | None = None,
        provider: str = "tavily",
    ) -> None:
        self.queries = [q for q in queries if q]
        self.api_key = api_key
        self.cache_path = Path(cache_path)
        self.batch_size = batch_size
        self.refresh_seconds = refresh_seconds
        self.max_results = max_results
        self.include_domains = [d for d in (include_domains or []) if d]
        self.provider = provider
        self._cursor = 0
        self._events: list[dict[str, str]] = []
        self._last_refresh = 0.0

    # ---- EventSource contract --------------------------------------------
    def poll(self) -> list[dict[str, str]]:
        self._ensure_fresh()
        if self._cursor > len(self._events):
            self._cursor = len(self._events)
        batch = self._events[self._cursor : self._cursor + self.batch_size]
        self._cursor += len(batch)
        return batch

    def snapshot(self) -> list[dict[str, str]]:
        self._ensure_fresh()
        return list(self._events)

    # ---- Refresh + cache --------------------------------------------------
    def _ensure_fresh(self) -> None:
        now = time.time()
        if self._events and (now - self._last_refresh) < self.refresh_seconds:
            return
        if not self._events and self._load_cache():
            self._last_refresh = now
            return
        try:
            events = self._search_all()
        except Exception as exc:  # never let search crash the scout loop
            print(f"[search] refresh failed: {exc!r}")
            if self._load_cache():
                self._last_refresh = now
            return
        if events:
            self._events = events
            self._cursor = 0
            self._last_refresh = now
            self._write_cache(events)

    def _load_cache(self) -> bool:
        if not self.cache_path.exists():
            return False
        try:
            data = json.loads(self.cache_path.read_text(encoding="utf-8"))
        except Exception:
            return False
        if isinstance(data, list) and data:
            self._events = [self._normalize(e) for e in data]
            return True
        return False

    def _write_cache(self, events: list[dict[str, str]]) -> None:
        try:
            self.cache_path.parent.mkdir(parents=True, exist_ok=True)
            self.cache_path.write_text(json.dumps(events, indent=2), encoding="utf-8")
        except Exception as exc:
            print(f"[search] cache write failed: {exc!r}")

    # ---- Search -----------------------------------------------------------
    def _search_all(self) -> list[dict[str, str]]:
        if not self.api_key:
            print("[search] no API key configured; returning no events")
            return []
        events: list[dict[str, str]] = []
        seen_ids: set[str] = set()
        for query in self.queries:
            try:
                results = self._search_tavily(query)
            except Exception as exc:
                print(f"[search] query failed ({query!r}): {exc!r}")
                continue
            for result in results:
                mapped = self._map_result(result)
                if not mapped or mapped["id"] in seen_ids:
                    continue
                seen_ids.add(mapped["id"])
                events.append(mapped)
        print(f"[search] {len(events)} events from {len(self.queries)} queries")
        return events

    def _search_tavily(self, query: str) -> list[dict[str, Any]]:
        body: dict[str, Any] = {
            "api_key": self.api_key,
            "query": query,
            "search_depth": "advanced",
            "max_results": self.max_results,
            "include_answer": False,
            "include_raw_content": False,
        }
        if self.include_domains:
            body["include_domains"] = self.include_domains
        resp = requests.post(_TAVILY_ENDPOINT, json=body, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        results = data.get("results")
        return results if isinstance(results, list) else []

    def _map_result(self, result: dict[str, Any]) -> dict[str, str] | None:
        url = str(result.get("url") or "").strip()
        title = str(result.get("title") or "").strip()
        if not url or not title:
            return None
        content = str(result.get("content") or "").strip()
        source = _domain_label(url)
        cid = "web-" + hashlib.sha1(url.encode("utf-8")).hexdigest()[:12]
        description = (
            f"{title}. Found via web search on {source}. {content} "
            f"Source: {url}"
        ).strip()
        return {
            "id": cid,
            "title": title,
            "source": source,
            "url": url,
            "starts_at": "",
            "location": "",
            "status": "open",
            "description": description,
            "thumbnail": str(result.get("image") or ""),
        }

    @staticmethod
    def _normalize(event: dict[str, Any]) -> dict[str, str]:
        fields = REQUIRED_EVENT_FIELDS | {"thumbnail"}
        return {field: str(event.get(field, "")) for field in fields}

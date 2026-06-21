"""Devpost event source.

Hits Devpost's public hackathons JSON API (no key required) and normalises each
hackathon into the Lookout event schema.  Implements the same ``poll()`` +
``snapshot()`` contract as the other sources so it slots straight into the
engine (directly or via ``MultiEventSource``).
"""

from __future__ import annotations

import json
import re
import time
from pathlib import Path
from typing import Any

import requests


_DEVPOST_ENDPOINT = "https://devpost.com/api/hackathons"
_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)
_TAG_RE = re.compile(r"<[^>]+>")

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


class DevpostEventSource:
    def __init__(
        self,
        queries: list[str] | None = None,
        cache_path: Path | None = None,
        batch_size: int = 5,
        refresh_seconds: int = 1800,
        max_pages: int = 1,
        open_only: bool = True,
    ) -> None:
        self.queries = queries or ["artificial intelligence", "machine learning"]
        self.cache_path = Path(cache_path) if cache_path else None
        self.batch_size = batch_size
        self.refresh_seconds = refresh_seconds
        self.max_pages = max_pages
        self.open_only = open_only
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
            events = self._fetch_all()
        except Exception as exc:  # never let fetching crash the scout loop
            print(f"[devpost] refresh failed: {exc!r}")
            if self._load_cache():
                self._last_refresh = now
            return
        if events:
            self._events = events
            self._cursor = 0
            self._last_refresh = now
            self._write_cache(events)

    def _load_cache(self) -> bool:
        if not self.cache_path or not self.cache_path.exists():
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
        if not self.cache_path:
            return
        try:
            self.cache_path.parent.mkdir(parents=True, exist_ok=True)
            self.cache_path.write_text(json.dumps(events, indent=2), encoding="utf-8")
        except Exception as exc:
            print(f"[devpost] cache write failed: {exc!r}")

    # ---- Fetch ------------------------------------------------------------
    def _fetch_all(self) -> list[dict[str, str]]:
        events: list[dict[str, str]] = []
        seen_ids: set[str] = set()
        for query in self.queries:
            for page in range(1, self.max_pages + 1):
                for hackathon in self._fetch_page(query, page):
                    mapped = self._map_hackathon(hackathon)
                    if not mapped or mapped["id"] in seen_ids:
                        continue
                    seen_ids.add(mapped["id"])
                    events.append(mapped)
        print(f"[devpost] {len(events)} hackathons from {len(self.queries)} queries")
        return events

    def _fetch_page(self, query: str, page: int) -> list[dict[str, Any]]:
        params: dict[str, Any] = {
            "search": query,
            "order_by": "recently-added",
            "page": page,
        }
        if self.open_only:
            params["status[]"] = "open"
        resp = requests.get(
            _DEVPOST_ENDPOINT,
            params=params,
            headers={"User-Agent": _USER_AGENT, "Accept": "application/json"},
            timeout=25,
        )
        resp.raise_for_status()
        data = resp.json()
        hackathons = data.get("hackathons")
        return hackathons if isinstance(hackathons, list) else []

    def _map_hackathon(self, h: dict[str, Any]) -> dict[str, str] | None:
        hid = h.get("id")
        title = h.get("title")
        url = h.get("url")
        if not hid or not title or not url:
            return None
        loc = h.get("displayed_location") or {}
        location = str(loc.get("location") or "").strip() or "Online"
        open_state = str(h.get("open_state") or "open")
        dates = str(h.get("submission_period_dates") or "").strip()
        themes = ", ".join(
            str(t.get("name")) for t in (h.get("themes") or []) if isinstance(t, dict) and t.get("name")
        )
        prize = _TAG_RE.sub("", str(h.get("prize_amount") or "")).strip()
        thumb = str(h.get("thumbnail_url") or "").strip()
        if thumb.startswith("//"):
            thumb = "https:" + thumb
        org = str(h.get("organization_name") or "").strip()
        regs = h.get("registrations_count")
        description = (
            f"{title}. Hackathon on Devpost"
            + (f" by {org}" if org else "")
            + f". Location: {location}. Dates: {dates or 'TBD'}. "
            + (f"Themes: {themes}. " if themes else "")
            + (f"Prizes: {prize}. " if prize else "")
            + (f"{regs} registrations. " if regs else "")
            + f"Status: {open_state}. Register at {url}"
        ).strip()
        return {
            "id": f"devpost-{hid}",
            "title": str(title),
            "source": "Devpost",
            "url": str(url),
            "starts_at": dates,
            "location": location,
            "status": "open" if open_state == "open" else open_state,
            "description": description,
            "thumbnail": thumb,
        }

    @staticmethod
    def _normalize(event: dict[str, Any]) -> dict[str, str]:
        fields = REQUIRED_EVENT_FIELDS | {"thumbnail"}
        return {field: str(event.get(field, "")) for field in fields}

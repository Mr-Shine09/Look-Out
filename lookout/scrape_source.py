"""Real event source that scrapes Luma discovery pages.

Drop-in replacement for ``SeedEventSource`` (implements the same ``poll()``
contract).  Fetches each configured Luma page, parses the server-rendered
``__NEXT_DATA__`` JSON into the Lookout event schema, and caches the result to
disk so repeated polls do not re-hit the network (or burn Browserbase minutes).

Fetch transport:
  * If ``use_browserbase`` is set and credentials are present, the page is
    loaded through a real Browserbase session (Playwright over CDP).
  * Otherwise it falls back to a plain ``requests`` GET.  Luma server-renders
    the event list, so both paths yield the same structured data.
"""

from __future__ import annotations

import json
import re
import time
from pathlib import Path
from typing import Any

import requests

_NEXT_DATA_RE = re.compile(
    r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>',
    re.S,
)

_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

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


class ScrapeEventSource:
    def __init__(
        self,
        sources: list[str],
        cache_path: Path,
        batch_size: int = 5,
        refresh_seconds: int = 1800,
        use_browserbase: bool = False,
        bb_api_key: str | None = None,
        bb_project_id: str | None = None,
    ) -> None:
        self.sources = [s for s in sources if s]
        self.cache_path = Path(cache_path)
        self.batch_size = batch_size
        self.refresh_seconds = refresh_seconds
        self.use_browserbase = use_browserbase
        self.bb_api_key = bb_api_key
        self.bb_project_id = bb_project_id
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

    # ---- Refresh + cache --------------------------------------------------
    def _ensure_fresh(self) -> None:
        now = time.time()
        if self._events and (now - self._last_refresh) < self.refresh_seconds:
            return
        # Try cache on disk first (survives restarts, avoids re-scraping).
        if not self._events and self._load_cache():
            self._last_refresh = now
            return
        try:
            events = self._scrape_all()
        except Exception as exc:  # never let scraping crash the scout loop
            print(f"[scrape] refresh failed: {exc!r}")
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
            print(f"[scrape] cache write failed: {exc!r}")

    # ---- Scrape -----------------------------------------------------------
    def _scrape_all(self) -> list[dict[str, str]]:
        events: list[dict[str, str]] = []
        seen_ids: set[str] = set()
        for url in self.sources:
            html = self._fetch_html(url)
            for event in self._parse_luma(html):
                if event["id"] in seen_ids:
                    continue
                seen_ids.add(event["id"])
                events.append(event)
        return events

    def _fetch_html(self, url: str) -> str:
        if self.use_browserbase and self.bb_api_key and self.bb_project_id:
            try:
                html = self._fetch_with_browserbase(url)
                if html:
                    print(f"[scrape] fetched via Browserbase: {url}")
                    return html
            except Exception as exc:
                print(f"[scrape] Browserbase failed ({exc!r}); falling back to requests")
        resp = requests.get(url, headers={"User-Agent": _USER_AGENT}, timeout=25)
        resp.raise_for_status()
        return resp.text

    def _fetch_with_browserbase(self, url: str) -> str:
        from browserbase import Browserbase
        from playwright.sync_api import sync_playwright

        bb = Browserbase(api_key=self.bb_api_key)
        session = bb.sessions.create(project_id=self.bb_project_id)
        with sync_playwright() as p:
            browser = p.chromium.connect_over_cdp(session.connect_url)
            try:
                context = browser.contexts[0] if browser.contexts else browser.new_context()
                page = context.pages[0] if context.pages else context.new_page()
                page.goto(url, wait_until="domcontentloaded", timeout=45000)
                page.wait_for_timeout(1500)
                return page.content()
            finally:
                browser.close()

    # ---- Parse Luma __NEXT_DATA__ ----------------------------------------
    def _parse_luma(self, html: str) -> list[dict[str, str]]:
        match = _NEXT_DATA_RE.search(html)
        if not match:
            return []
        data = json.loads(match.group(1))
        try:
            raw_events = data["props"]["pageProps"]["initialData"]["data"]["events"]
        except (KeyError, TypeError):
            return []
        events: list[dict[str, str]] = []
        for wrap in raw_events:
            event = wrap.get("event", wrap) if isinstance(wrap, dict) else None
            if not isinstance(event, dict):
                continue
            mapped = self._map_event(event)
            if mapped:
                events.append(mapped)
        return events

    def _map_event(self, event: dict[str, Any]) -> dict[str, str] | None:
        api_id = event.get("api_id")
        name = event.get("name")
        if not api_id or not name:
            return None
        slug = event.get("url", "")
        url = f"https://lu.ma/{slug}" if slug else "https://lu.ma"
        geo = event.get("geo_address_info") or {}
        location_type = (event.get("location_type") or "").lower()
        is_online = location_type in {"online", "virtual"}
        if is_online:
            location = "Online"
        else:
            location = (
                geo.get("city_state")
                or geo.get("full_address")
                or geo.get("address")
                or geo.get("city")
                or "San Francisco, CA"
            )
        address = geo.get("address") or ""
        starts_at = event.get("start_at") or ""
        event_type = event.get("event_type") or "event"
        venue = "Online / virtual event" if is_online else f"In-person event at {location}"
        description = (
            f"{name}. {venue}. {address} "
            f"Listed on Luma ({event_type}). Starts {starts_at}. "
            "Registration open via Luma."
        ).strip()
        return {
            "id": f"luma-{api_id}",
            "title": str(name),
            "source": "Luma",
            "url": url,
            "starts_at": str(starts_at),
            "location": str(location),
            "status": "open",
            "description": description,
        }

    @staticmethod
    def _normalize(event: dict[str, Any]) -> dict[str, str]:
        return {field: str(event.get(field, "")) for field in REQUIRED_EVENT_FIELDS}

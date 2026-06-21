import json
from pathlib import Path
from typing import Protocol


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


class EventSource(Protocol):
    def poll(self) -> list[dict]: ...
    def snapshot(self) -> list[dict]: ...


class MultiEventSource:
    """Fan several site-specific sources into one pool (e.g. Luma + Devpost)."""

    def __init__(self, sources: list) -> None:
        self.sources = [s for s in sources if s is not None]

    def poll(self) -> list[dict]:
        batch: list[dict] = []
        for source in self.sources:
            try:
                batch.extend(source.poll())
            except Exception as exc:  # never let one source crash the scout loop
                print(f"[multi] poll failed for {type(source).__name__}: {exc!r}")
        return batch

    def snapshot(self) -> list[dict]:
        events: list[dict] = []
        seen: set[str] = set()
        for source in self.sources:
            try:
                items = source.snapshot()
            except Exception as exc:
                print(f"[multi] snapshot failed for {type(source).__name__}: {exc!r}")
                continue
            for event in items:
                eid = str(event.get("id") or event.get("url") or "")
                if eid and eid in seen:
                    continue
                if eid:
                    seen.add(eid)
                events.append(event)
        return events


class SeedEventSource:
    def __init__(self, path: Path, batch_size: int = 3) -> None:
        self.path = path
        self.batch_size = batch_size
        self._cursor = 0

    def poll(self) -> list[dict]:
        events = self._read_events()
        if self._cursor > len(events):
            self._cursor = len(events)
        batch = events[self._cursor : self._cursor + self.batch_size]
        self._cursor += len(batch)
        return batch

    def snapshot(self) -> list[dict]:
        """Full known event pool (for per-watch backfill on watch creation)."""
        return self._read_events()

    def _read_events(self) -> list[dict]:
        if not self.path.exists():
            return []
        with self.path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
        if not isinstance(data, list):
            raise ValueError(f"{self.path} must contain a JSON list")
        return [self._normalize(event) for event in data]

    def _normalize(self, event: dict) -> dict:
        missing = REQUIRED_EVENT_FIELDS.difference(event)
        if missing:
            raise ValueError(f"seed event missing fields: {sorted(missing)}")
        return {field: str(event.get(field, "")) for field in REQUIRED_EVENT_FIELDS}

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

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class Settings:
    redis_url: str
    anthropic_api_key: str | None
    poll_seconds: int
    event_batch_size: int
    events_path: Path
    semantic_duplicate_distance: float
    embedding_model: str
    cors_origins: list[str]
    seed_default_watch: bool


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    cors = os.getenv("LOOKOUT_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
    return Settings(
        redis_url=os.getenv("REDIS_URL", "redis://localhost:6379"),
        anthropic_api_key=os.getenv("ANTHROPIC_API_KEY") or None,
        poll_seconds=int(os.getenv("LOOKOUT_POLL_SECONDS", "5")),
        event_batch_size=int(os.getenv("LOOKOUT_EVENT_BATCH_SIZE", "3")),
        events_path=Path(os.getenv("LOOKOUT_EVENTS_PATH", str(ROOT_DIR / "data" / "events.json"))),
        semantic_duplicate_distance=float(os.getenv("LOOKOUT_DUP_DISTANCE", "0.08")),
        embedding_model=os.getenv("LOOKOUT_EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2"),
        cors_origins=[origin.strip() for origin in cors.split(",") if origin.strip()],
        seed_default_watch=os.getenv("LOOKOUT_SEED_DEFAULT_WATCH", "1") != "0",
    )

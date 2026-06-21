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
    event_source: str
    scrape_sources: list[str]
    scrape_cache_path: Path
    scrape_refresh_seconds: int
    use_browserbase: bool
    browserbase_api_key: str | None
    browserbase_project_id: str | None


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    cors = os.getenv("LOOKOUT_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
    scrape_sources = os.getenv("LOOKOUT_SCRAPE_SOURCES", "https://lu.ma/sf")
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
        event_source=os.getenv("LOOKOUT_EVENT_SOURCE", "seed").lower(),
        scrape_sources=[s.strip() for s in scrape_sources.split(",") if s.strip()],
        scrape_cache_path=Path(
            os.getenv("LOOKOUT_SCRAPE_CACHE", str(ROOT_DIR / "data" / "scraped_events.json"))
        ),
        scrape_refresh_seconds=int(os.getenv("LOOKOUT_SCRAPE_REFRESH_SECONDS", "1800")),
        use_browserbase=os.getenv("LOOKOUT_USE_BROWSERBASE", "0") not in {"0", "", "false", "False"},
        browserbase_api_key=os.getenv("BROWSERBASE_API_KEY") or None,
        browserbase_project_id=os.getenv("BROWSERBASE_PROJECT_ID") or None,
    )

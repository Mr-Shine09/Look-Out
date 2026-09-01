import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class Settings:
    redis_url: str
    anthropic_api_key: str | None
    judge_provider: str
    ollama_host: str
    ollama_model: str
    poll_seconds: int
    event_batch_size: int
    events_path: Path
    semantic_duplicate_distance: float
    embedding_model: str
    cors_origins: list[str]
    cors_origin_regex: str | None
    seed_default_watch: bool
    max_active_watches: int
    event_source: str
    scrape_sources: list[str]
    scrape_cache_path: Path
    scrape_refresh_seconds: int
    use_browserbase: bool
    browserbase_api_key: str | None
    browserbase_project_id: str | None
    search_provider: str
    tavily_api_key: str | None
    search_queries: list[str]
    search_cache_path: Path
    search_refresh_seconds: int
    search_max_results: int
    search_include_domains: list[str]
    site_sources: list[str]
    devpost_queries: list[str]
    devpost_cache_path: Path
    devpost_max_pages: int
    discord_webhook_url: str | None
    notify_webhook_url: str | None


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    cors = os.getenv("LOOKOUT_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
    scrape_sources = os.getenv("LOOKOUT_SCRAPE_SOURCES", "https://lu.ma/sf")
    return Settings(
        redis_url=os.getenv("REDIS_URL", "redis://localhost:6379"),
        anthropic_api_key=os.getenv("ANTHROPIC_API_KEY") or None,
        judge_provider=os.getenv("LOOKOUT_JUDGE_PROVIDER", "auto").lower(),
        ollama_host=os.getenv("LOOKOUT_OLLAMA_HOST", "http://localhost:11434"),
        ollama_model=os.getenv("LOOKOUT_OLLAMA_MODEL", "llama3.1:8b"),
        poll_seconds=int(os.getenv("LOOKOUT_POLL_SECONDS", "5")),
        event_batch_size=int(os.getenv("LOOKOUT_EVENT_BATCH_SIZE", "3")),
        events_path=Path(os.getenv("LOOKOUT_EVENTS_PATH", str(ROOT_DIR / "data" / "events.json"))),
        semantic_duplicate_distance=float(os.getenv("LOOKOUT_DUP_DISTANCE", "0.08")),
        embedding_model=os.getenv("LOOKOUT_EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2"),
        cors_origins=[origin.strip() for origin in cors.split(",") if origin.strip()],
        # Allow any localhost/127.0.0.1 port by default so the dev frontend AND the
        # IDE browser-preview proxy (random 127.0.0.1:5xxxx origin) are never CORS-blocked.
        cors_origin_regex=os.getenv(
            "LOOKOUT_CORS_ORIGIN_REGEX", r"https?://(localhost|127\.0\.0\.1)(:\d+)?"
        )
        or None,
        seed_default_watch=os.getenv("LOOKOUT_SEED_DEFAULT_WATCH", "0") != "0",
        max_active_watches=int(os.getenv("LOOKOUT_MAX_ACTIVE_WATCHES", "3")),
        event_source=os.getenv("LOOKOUT_EVENT_SOURCE", "seed").lower(),
        scrape_sources=[s.strip() for s in scrape_sources.split(",") if s.strip()],
        scrape_cache_path=Path(
            os.getenv("LOOKOUT_SCRAPE_CACHE", str(ROOT_DIR / "data" / "scraped_events.json"))
        ),
        scrape_refresh_seconds=int(os.getenv("LOOKOUT_SCRAPE_REFRESH_SECONDS", "1800")),
        use_browserbase=os.getenv("LOOKOUT_USE_BROWSERBASE", "0") not in {"0", "", "false", "False"},
        browserbase_api_key=os.getenv("BROWSERBASE_API_KEY") or None,
        browserbase_project_id=os.getenv("BROWSERBASE_PROJECT_ID") or None,
        search_provider=os.getenv("LOOKOUT_SEARCH_PROVIDER", "tavily").lower(),
        tavily_api_key=os.getenv("TAVILY_API_KEY") or None,
        search_queries=[
            q.strip()
            for q in os.getenv(
                "LOOKOUT_SEARCH_QUERIES",
                "upcoming AI ML hackathons 2026 open registration"
                "|in-person hackathons San Francisco Bay Area 2026 register",
            ).split("|")
            if q.strip()
        ],
        search_cache_path=Path(
            os.getenv("LOOKOUT_SEARCH_CACHE", str(ROOT_DIR / "data" / "searched_events.json"))
        ),
        search_refresh_seconds=int(os.getenv("LOOKOUT_SEARCH_REFRESH_SECONDS", "1800")),
        search_max_results=int(os.getenv("LOOKOUT_SEARCH_MAX_RESULTS", "10")),
        search_include_domains=[
            d.strip()
            for d in os.getenv(
                "LOOKOUT_SEARCH_DOMAINS",
                "devpost.com,mlh.io,eventbrite.com,lu.ma,meetup.com",
            ).split(",")
            if d.strip()
        ],
        site_sources=[
            s.strip().lower()
            for s in os.getenv("LOOKOUT_SITE_SOURCES", "luma,devpost").split(",")
            if s.strip()
        ],
        devpost_queries=[
            q.strip()
            for q in os.getenv(
                "LOOKOUT_DEVPOST_QUERIES", "artificial intelligence|machine learning"
            ).split("|")
            if q.strip()
        ],
        devpost_cache_path=Path(
            os.getenv("LOOKOUT_DEVPOST_CACHE", str(ROOT_DIR / "data" / "devpost_events.json"))
        ),
        devpost_max_pages=int(os.getenv("LOOKOUT_DEVPOST_MAX_PAGES", "1")),
        discord_webhook_url=os.getenv("LOOKOUT_DISCORD_WEBHOOK") or None,
        notify_webhook_url=os.getenv("LOOKOUT_WEBHOOK_URL") or None,
    )

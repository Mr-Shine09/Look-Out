import asyncio
import json
from contextlib import asynccontextmanager
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, HTTPException, Response, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from .embeddings import EmbeddingService
from .engine import LookoutEngine
from .devpost_source import DevpostEventSource
from .event_source import MultiEventSource, SeedEventSource
from .scrape_source import ScrapeEventSource
from .search_source import SearchEventSource
from .judge import SpecAndFitJudge
from .learning import LearningService
from .redis_store import RedisStore
from .notify import Notifier
from .schemas import DeliveryUpdate, FeedbackCreate, ProfileUpdate, SpecUpdate, WatchCreate
from .settings import get_settings
from .tracing import setup_sentry, setup_tracing
from .websocket import FeedHub


# Sentry first so it captures errors from the entire startup path (backend errors only).
setup_sentry()


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    # Register Phoenix tracing + Anthropic instrumentation before any Claude call fires.
    setup_tracing()
    feed = FeedHub()
    store = RedisStore(settings.redis_url)
    if settings.event_source == "sites":
        sub_sources = []
        if "luma" in settings.site_sources:
            sub_sources.append(
                ScrapeEventSource(
                    sources=settings.scrape_sources,
                    cache_path=settings.scrape_cache_path,
                    batch_size=settings.event_batch_size,
                    refresh_seconds=settings.scrape_refresh_seconds,
                    use_browserbase=settings.use_browserbase,
                    bb_api_key=settings.browserbase_api_key,
                    bb_project_id=settings.browserbase_project_id,
                )
            )
        if "devpost" in settings.site_sources:
            sub_sources.append(
                DevpostEventSource(
                    queries=settings.devpost_queries,
                    cache_path=settings.devpost_cache_path,
                    batch_size=settings.event_batch_size,
                    refresh_seconds=settings.scrape_refresh_seconds,
                    max_pages=settings.devpost_max_pages,
                )
            )
        if "search" in settings.site_sources:
            sub_sources.append(
                SearchEventSource(
                    queries=settings.search_queries,
                    api_key=settings.tavily_api_key,
                    cache_path=settings.search_cache_path,
                    batch_size=settings.event_batch_size,
                    refresh_seconds=settings.search_refresh_seconds,
                    max_results=settings.search_max_results,
                    include_domains=settings.search_include_domains,
                    provider=settings.search_provider,
                )
            )
        source = MultiEventSource(sub_sources)
        print(
            f"[startup] event source: sites ({', '.join(settings.site_sources)}) "
            f"browserbase={'on' if settings.use_browserbase else 'off'}"
        )
    elif settings.event_source == "search":
        source = SearchEventSource(
            queries=settings.search_queries,
            api_key=settings.tavily_api_key,
            cache_path=settings.search_cache_path,
            batch_size=settings.event_batch_size,
            refresh_seconds=settings.search_refresh_seconds,
            max_results=settings.search_max_results,
            include_domains=settings.search_include_domains,
            provider=settings.search_provider,
        )
        print(
            f"[startup] event source: search ({settings.search_provider}, "
            f"{len(settings.search_queries)} queries, key={'set' if settings.tavily_api_key else 'MISSING'})"
        )
    elif settings.event_source == "scrape":
        source = ScrapeEventSource(
            sources=settings.scrape_sources,
            cache_path=settings.scrape_cache_path,
            batch_size=settings.event_batch_size,
            refresh_seconds=settings.scrape_refresh_seconds,
            use_browserbase=settings.use_browserbase,
            bb_api_key=settings.browserbase_api_key,
            bb_project_id=settings.browserbase_project_id,
        )
        print(
            f"[startup] event source: scrape ({', '.join(settings.scrape_sources)}) "
            f"browserbase={'on' if settings.use_browserbase else 'off'}"
        )
    else:
        source = SeedEventSource(settings.events_path, settings.event_batch_size)
        print("[startup] event source: seed")
    embeddings = EmbeddingService(settings.embedding_model)
    judge = SpecAndFitJudge(settings.anthropic_api_key)
    learning = LearningService(store.redis)
    notifier = Notifier(store, settings)
    engine = LookoutEngine(settings, store, feed, source, embeddings, judge, learning, notifier)
    await engine.setup()

    scheduler = AsyncIOScheduler(timezone="UTC")
    scheduler.add_job(engine.poll_once, "interval", seconds=settings.poll_seconds, id="lookout-scout", max_instances=1)
    scheduler.start()

    app.state.settings = settings
    app.state.feed = feed
    app.state.store = store
    app.state.engine = engine
    app.state.notifier = notifier
    app.state.scheduler = scheduler
    try:
        yield
    finally:
        scheduler.shutdown(wait=False)


app = FastAPI(title="Lookout Redis Backend", version="0.1.0", lifespan=lifespan)
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def engine() -> LookoutEngine:
    return app.state.engine


@app.get("/health")
def health() -> dict[str, Any]:
    store = app.state.store
    redis_ok = store.ping()
    index_ok = store.index_exists()
    return {"ok": redis_ok and index_ok, "redis": redis_ok, "index": index_ok, "index_name": "idx:cand"}


@app.websocket("/ws/feed")
async def websocket_feed(websocket: WebSocket) -> None:
    feed = app.state.feed
    await feed.connect(websocket)
    await feed.keepalive(websocket)


@app.get("/api/watches")
def get_watches() -> list[dict[str, Any]]:
    return engine().get_watches()


@app.post("/api/watches", status_code=202)
async def create_watch(payload: WatchCreate, response: Response) -> dict[str, Any]:
    watch_id = engine().create_watch(payload.query_text)
    asyncio.create_task(engine().compile_watch(watch_id))
    response.status_code = 202
    return {"accepted": True, "watch_id": watch_id}


@app.patch("/api/watches/{watch_id}/spec")
async def update_watch_spec(watch_id: str, payload: SpecUpdate) -> dict[str, Any]:
    try:
        watch = engine().update_spec(watch_id, payload.must_match, payload.reject_cases)
    except KeyError:
        raise HTTPException(status_code=404, detail="watch not found")
    await app.state.feed.broadcast(
        {
            "type": "spec_ready",
            "watch_id": watch_id,
            "must_match": watch["spec"]["must_match"],
            "reject_cases": watch["spec"]["reject_cases"],
        }
    )
    return watch


@app.post("/api/candidates/{candidate_id}/feedback")
async def candidate_feedback(candidate_id: str, payload: FeedbackCreate) -> dict[str, Any]:
    try:
        return await engine().feedback(candidate_id, payload.label, payload.watch_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="candidate not found")


@app.get("/api/candidates")
def list_candidates(watch_id: str | None = None) -> list[dict[str, Any]]:
    return engine().list_candidates(watch_id)


@app.get("/api/curve")
def get_curve(watch_id: str | None = None) -> list[dict[str, Any]]:
    return engine().get_curve(watch_id)


@app.get("/api/delivery")
def get_delivery() -> dict[str, Any]:
    return app.state.notifier.get_config()


@app.post("/api/delivery")
async def save_delivery(payload: DeliveryUpdate) -> dict[str, Any]:
    notifier = app.state.notifier
    cfg = notifier.set_config(payload.model_dump())
    result: dict[str, Any] = {"ok": True, "config": cfg}
    if payload.test:
        result["test"] = await asyncio.to_thread(notifier.send_test, cfg)
    return result


PROFILE_KEY = "lookout:profile"


@app.get("/api/profile")
def get_profile() -> dict[str, Any]:
    raw = app.state.store.redis.get(PROFILE_KEY)
    if not raw:
        return ProfileUpdate().model_dump()
    try:
        data = json.loads(raw)
    except Exception:
        data = {}
    return ProfileUpdate(**{k: v for k, v in data.items() if k in ProfileUpdate.model_fields}).model_dump()


@app.post("/api/profile")
def save_profile(payload: ProfileUpdate) -> dict[str, Any]:
    cfg = payload.model_dump()
    app.state.store.redis.set(PROFILE_KEY, json.dumps(cfg))
    return {"ok": True, "profile": cfg}


@app.post("/api/candidates/{candidate_id}/apply")
def apply_candidate(candidate_id: str, watch_id: str | None = None) -> dict[str, Any]:
    try:
        return engine().mark_applied(candidate_id, watch_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="candidate not found")


@app.post("/api/candidates/{candidate_id}/pipeline", status_code=202)
async def trigger_pipeline(candidate_id: str) -> dict[str, Any]:
    asyncio.create_task(engine().emit_pipeline(candidate_id))
    return {"accepted": True}


@app.post("/api/scout/run", status_code=202)
async def run_scout_once() -> dict[str, Any]:
    results = await engine().poll_once()
    return {"accepted": True, "results": results}


@app.get("/api/debug/error")
def debug_error() -> dict[str, Any]:
    """Deliberately raise so we can confirm Sentry is wired (backend errors only)."""
    raise RuntimeError("Lookout Sentry smoke test — intentional backend error.")

import asyncio
from contextlib import asynccontextmanager
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, HTTPException, Response, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from .embeddings import EmbeddingService
from .engine import LookoutEngine
from .event_source import SeedEventSource
from .judge import SpecAndFitJudge
from .learning import LearningService
from .redis_store import RedisStore
from .schemas import FeedbackCreate, WatchCreate
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
    source = SeedEventSource(settings.events_path, settings.event_batch_size)
    embeddings = EmbeddingService(settings.embedding_model)
    judge = SpecAndFitJudge(settings.anthropic_api_key)
    learning = LearningService(store.redis)
    engine = LookoutEngine(settings, store, feed, source, embeddings, judge, learning)
    await engine.setup()

    scheduler = AsyncIOScheduler(timezone="UTC")
    scheduler.add_job(engine.poll_once, "interval", seconds=settings.poll_seconds, id="lookout-scout", max_instances=1)
    scheduler.start()

    app.state.settings = settings
    app.state.feed = feed
    app.state.store = store
    app.state.engine = engine
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


@app.post("/api/candidates/{candidate_id}/feedback")
async def candidate_feedback(candidate_id: str, payload: FeedbackCreate) -> dict[str, Any]:
    try:
        return await engine().feedback(candidate_id, payload.label)
    except KeyError:
        raise HTTPException(status_code=404, detail="candidate not found")


@app.get("/api/curve")
def get_curve() -> list[dict[str, Any]]:
    return engine().get_curve()


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

import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from lookout.embeddings import EmbeddingService
from lookout.engine import LookoutEngine
from lookout.event_source import SeedEventSource
from lookout.judge import SpecAndFitJudge, stub_spec_for
from lookout.learning import LearningService
from lookout.redis_store import RedisStore
from lookout.settings import get_settings
from lookout.websocket import FeedHub


TEST_WATCH_ID = "w_dedup_test"
TEST_QUERY = "Alert me when a new in-person ML/AI hackathon opens registration within 100mi of SF"


async def main() -> None:
    settings = get_settings()
    store = RedisStore(settings.redis_url)
    store.ensure_index()
    cleanup(store)

    spec = stub_spec_for(TEST_QUERY)
    store.redis.hset(
        f"watch:{TEST_WATCH_ID}:spec",
        mapping={
            "query_text": TEST_QUERY,
            "must_match": __import__("json").dumps(spec["must_match"]),
            "reject_cases": __import__("json").dumps(spec["reject_cases"]),
            "status": "watching",
        },
    )

    engine = LookoutEngine(
        settings=settings,
        store=store,
        feed=FeedHub(),
        source=SeedEventSource(settings.events_path, batch_size=1000),
        embeddings=EmbeddingService(settings.embedding_model),
        judge=SpecAndFitJudge(settings.anthropic_api_key),
        learning=LearningService(store.redis),
    )
    watch = engine.get_watch(TEST_WATCH_ID)
    source = SeedEventSource(settings.events_path, batch_size=1000)

    for event in source.poll():
        result = await engine.process_event(watch, event, broadcast=False)
        print(f"{result['status']:7} {result['id']:<36} {event['title']} :: {result['reason']}")

    changed = {
        "id": "devpost-treehacks-closed",
        "title": "Stanford TreeHacks",
        "source": "Devpost",
        "url": "https://example.com/treehacks",
        "starts_at": "2026-02-14",
        "location": "Stanford, CA",
        "status": "open",
        "description": "In-person Stanford hackathon with AI tracks, hardware labs, and product design workshops. Registration reopened after more spots were added.",
    }
    result = await engine.process_event(watch, changed, broadcast=False)
    print(f"{result['status']:7} {result['id']:<36} {changed['title']} :: {result['reason']}")


def cleanup(store: RedisStore) -> None:
    keys = []
    for pattern in (f"cand:{TEST_WATCH_ID}:*", f"watch:{TEST_WATCH_ID}:*"):
        keys.extend(list(store.redis.scan_iter(match=pattern)))
    if keys:
        store.redis.delete(*keys)


if __name__ == "__main__":
    asyncio.run(main())

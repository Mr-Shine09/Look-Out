import json
import re
from typing import Any

import redis
from redis.exceptions import ResponseError


INDEX_NAME = "idx:cand"
VECTOR_DIM = 384


class RedisStore:
    def __init__(self, redis_url: str) -> None:
        self.redis = redis.Redis.from_url(redis_url, decode_responses=False)

    def ping(self) -> bool:
        return bool(self.redis.ping())

    def index_exists(self) -> bool:
        try:
            self.redis.execute_command("FT.INFO", INDEX_NAME)
            return True
        except ResponseError:
            return False

    def ensure_index(self) -> None:
        if self.index_exists():
            return
        try:
            self.redis.execute_command(
                "FT.CREATE",
                INDEX_NAME,
                "ON",
                "HASH",
                "PREFIX",
                "1",
                "cand:",
                "SCHEMA",
                "watch_id",
                "TAG",
                "source",
                "TAG",
                "state",
                "TAG",
                "title",
                "TEXT",
                "url",
                "TEXT",
                "vec",
                "VECTOR",
                "HNSW",
                "6",
                "TYPE",
                "FLOAT32",
                "DIM",
                str(VECTOR_DIM),
                "DISTANCE_METRIC",
                "COSINE",
            )
        except ResponseError as exc:
            if "already exists" not in str(exc).lower():
                raise


def decode(value: Any) -> Any:
    if isinstance(value, bytes):
        return value.decode("utf-8")
    return value


def decode_hash(raw: dict[Any, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key, value in raw.items():
        name = decode(key)
        out[name] = value if name == "vec" else decode(value)
    return out


def json_dumps(value: Any) -> str:
    return json.dumps(value, separators=(",", ":"))


def json_loads(value: Any, default: Any) -> Any:
    if value in (None, "", b""):
        return default
    try:
        return json.loads(decode(value))
    except Exception:
        return default


def tag_escape(value: str) -> str:
    return re.sub(r"([\\{}|, .<>'\"():;!@#$%^&*\-+=~\[\]])", r"\\\1", value)

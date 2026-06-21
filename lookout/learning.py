import math
from typing import Any

import numpy as np

from .redis_store import decode, decode_hash, json_dumps, json_loads


class LearningService:
    def __init__(self, redis_client) -> None:
        self.redis = redis_client

    def score(self, watch_id: str, embedding: np.ndarray) -> tuple[float, float] | None:
        raw = self.redis.hgetall(f"watch:{watch_id}:model")
        model = decode_hash(raw)
        if not model or not model.get("coef"):
            return None
        coef = np.asarray(json_loads(model.get("coef"), []), dtype=np.float32)
        if coef.shape[0] != embedding.shape[0]:
            return None
        intercept = float(model.get("intercept") or 0.0)
        threshold = float(model.get("threshold") or 0.5)
        z = float(np.dot(coef, embedding.astype(np.float32)) + intercept)
        probability = 1.0 / (1.0 + math.exp(-max(min(z, 50.0), -50.0)))
        return probability, threshold

    def train_if_ready(self, watch_id: str) -> dict[str, Any]:
        rows = self._labeled_rows(watch_id)
        positives = [row for row in rows if row[1] == 1]
        negatives = [row for row in rows if row[1] == 0]
        if len(positives) < 3 or len(negatives) < 3:
            return {"trained": False, "n_labels": len(rows)}

        from sklearn.linear_model import LogisticRegression

        x = np.vstack([row[0] for row in rows]).astype(np.float32)
        y = np.asarray([row[1] for row in rows], dtype=np.int32)
        classifier = LogisticRegression(max_iter=500, class_weight="balanced")
        classifier.fit(x, y)
        coef = classifier.coef_[0].astype(float).tolist()
        intercept = float(classifier.intercept_[0])
        self.redis.hset(
            f"watch:{watch_id}:model",
            mapping={
                "coef": json_dumps(coef),
                "intercept": str(intercept),
                "threshold": "0.5",
                "n_labels": str(len(rows)),
            },
        )
        return {"trained": True, "n_labels": len(rows)}

    def _labeled_rows(self, watch_id: str) -> list[tuple[np.ndarray, int]]:
        rows: list[tuple[np.ndarray, int]] = []
        for key in self.redis.scan_iter(match=f"cand:{watch_id}:*"):
            cand = decode_hash(self.redis.hgetall(key))
            label = cand.get("label")
            if label not in {"relevant", "not_relevant"}:
                continue
            vec = cand.get("vec")
            if not isinstance(vec, bytes):
                continue
            embedding = np.frombuffer(vec, dtype=np.float32)
            if embedding.size == 0:
                continue
            rows.append((embedding, 1 if label == "relevant" else 0))
        return rows

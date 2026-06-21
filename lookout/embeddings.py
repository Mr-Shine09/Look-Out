import hashlib
import math
import re
from typing import Iterable

import numpy as np

from .redis_store import VECTOR_DIM


_TOKEN_RE = re.compile(r"[a-z0-9]+")


class EmbeddingService:
    def __init__(self, model_name: str) -> None:
        self.model_name = model_name
        self._model = None
        self._load_failed = False

    def embed(self, text: str) -> np.ndarray:
        model = self._get_model()
        if model is not None:
            vector = np.asarray(model.encode(text, normalize_embeddings=True), dtype=np.float32)
            return self._fit_dim(vector)
        return self._fallback_embed(text)

    def _get_model(self):
        if self._model is not None or self._load_failed:
            return self._model
        try:
            from sentence_transformers import SentenceTransformer

            self._model = SentenceTransformer(self.model_name)
        except Exception:
            self._load_failed = True
            self._model = None
        return self._model

    def _fit_dim(self, vector: np.ndarray) -> np.ndarray:
        vector = np.asarray(vector, dtype=np.float32).reshape(-1)
        if vector.shape[0] > VECTOR_DIM:
            vector = vector[:VECTOR_DIM]
        elif vector.shape[0] < VECTOR_DIM:
            vector = np.pad(vector, (0, VECTOR_DIM - vector.shape[0]))
        norm = float(np.linalg.norm(vector))
        if norm > 0:
            vector = vector / norm
        return vector.astype(np.float32)

    def _fallback_embed(self, text: str) -> np.ndarray:
        vector = np.zeros(VECTOR_DIM, dtype=np.float32)
        tokens = _TOKEN_RE.findall(text.lower())
        features = list(self._features(tokens, text.lower()))
        for feature in features:
            digest = hashlib.blake2b(feature.encode("utf-8"), digest_size=8).digest()
            bucket = int.from_bytes(digest[:4], "little") % VECTOR_DIM
            sign = 1.0 if digest[4] & 1 else -1.0
            vector[bucket] += sign
        norm = math.sqrt(float(np.dot(vector, vector)))
        if norm > 0:
            vector /= norm
        return vector.astype(np.float32)

    def _features(self, tokens: list[str], lowered: str) -> Iterable[str]:
        for token in tokens:
            yield f"tok:{token}"
        for left, right in zip(tokens, tokens[1:]):
            yield f"bi:{left}:{right}"
        compact = re.sub(r"\s+", " ", lowered)
        for index in range(max(0, len(compact) - 4)):
            yield f"ch:{compact[index:index + 5]}"

"""Embedding wrapper around sentence-transformers, lazy-loaded.

Uses the multilingual BAAI/bge-m3 by default so EN + 中文 queries both work
well in the same vector space.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Iterable, List

from . import CHROMA_DIR, RAG_MODEL, is_rag_available

logger = logging.getLogger("agent")

_model = None
_model_name_loaded: str | None = None


def _get_model():
    global _model, _model_name_loaded
    if _model is not None and _model_name_loaded == RAG_MODEL:
        return _model
    if not is_rag_available():
        return None
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError:
        logger.warning("sentence-transformers not installed; embeddings unavailable")
        return None
    cache_dir = Path(CHROMA_DIR).parent / "hf_cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    logger.info("Loading embedding model %s (first run may download ~450MB)", RAG_MODEL)
    _model = SentenceTransformer(RAG_MODEL, cache_folder=str(cache_dir))
    _model_name_loaded = RAG_MODEL
    return _model


def get_embedding_dimension() -> int:
    model = _get_model()
    if model is None:
        return 0
    return int(model.get_sentence_embedding_dimension() or 0)


def embed_texts(texts: List[str]) -> list[list[float]]:
    if not texts:
        return []
    model = _get_model()
    if model is None:
        # Return zero vectors as a safe fallback that the vector store can ignore.
        return [[] for _ in texts]
    embeddings = model.encode(texts, convert_to_numpy=True, normalize_embeddings=True)
    return embeddings.tolist()


def embed_query(query: str) -> list[float]:
    model = _get_model()
    if model is None:
        return []
    arr = model.encode([query], convert_to_numpy=True, normalize_embeddings=True)
    return arr.tolist()[0]


def iter_embed(texts: Iterable[str]) -> Iterable[list[float]]:
    buf = list(texts)
    for e in embed_texts(buf):
        yield e

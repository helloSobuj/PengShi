"""RAG feature flag — graceful RAG_DISABLED fallback similar to DB_DISABLED.

Every rag submodule imports and checks this before trying to import heavy deps
(sentence-transformers, chromadb). This way the agent can still start on
memory-constrained environments without them.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

logger = logging.getLogger("agent")

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
RAG_DIR = DATA_DIR / "rag"
CHROMA_DIR = RAG_DIR / "chroma"
UPLOADS_DIR = RAG_DIR / "uploads"

RAG_DISABLED = os.getenv("RAG_DISABLED", "false").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}

RAG_MODEL = os.getenv("RAG_MODEL", "BAAI/bge-m3")
RAG_TOP_K = int(os.getenv("RAG_TOP_K", "4"))
RAG_CHUNK_SIZE = int(os.getenv("RAG_CHUNK_SIZE", "500"))
RAG_CHUNK_OVERLAP = int(os.getenv("RAG_CHUNK_OVERLAP", "80"))
CHROMA_COLLECTION = "echo_knowledge_base"


def _ensure_dirs() -> None:
    RAG_DIR.mkdir(parents=True, exist_ok=True)
    CHROMA_DIR.mkdir(parents=True, exist_ok=True)
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


def is_rag_available(quiet: bool = True) -> bool:
    """Return True only if RAG is enabled AND its heavy imports succeed."""
    if RAG_DISABLED:
        if not quiet:
            logger.info("RAG disabled (RAG_DISABLED=true); skipping")
        return False
    try:
        import chromadb  # noqa: F401
        import sentence_transformers  # noqa: F401
    except ImportError as exc:
        if not quiet:
            logger.warning(
                "RAG imports unavailable: %s. Install chromadb + sentence-transformers.",
                exc,
            )
        return False
    _ensure_dirs()
    return True


__all__ = [
    "CHROMA_COLLECTION",
    "CHROMA_DIR",
    "DATA_DIR",
    "RAG_CHUNK_OVERLAP",
    "RAG_CHUNK_SIZE",
    "RAG_DIR",
    "RAG_DISABLED",
    "RAG_MODEL",
    "RAG_TOP_K",
    "UPLOADS_DIR",
    "is_rag_available",
]

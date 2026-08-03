"""ChromaDB wrapper: collection init, upsert chunks, semantic search.

Lazy-imports chromadb to keep the agent startable when RAG is disabled.
"""

from __future__ import annotations

import hashlib
import json
import logging
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from . import CHROMA_COLLECTION, CHROMA_DIR, RAG_TOP_K, is_rag_available
from .embed import embed_texts, embed_query

logger = logging.getLogger("agent")

_client = None
_collection = None


def get_client():
    global _client
    if _client is None:
        if not is_rag_available(quiet=False):
            return None
        try:
            import chromadb
        except ImportError:
            logger.warning("chromadb not installed; vector store unavailable")
            return None
        Path(CHROMA_DIR).mkdir(parents=True, exist_ok=True)
        _client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    return _client


def get_collection():
    global _collection
    if _collection is not None:
        return _collection
    client = get_client()
    if client is None:
        return None
    _collection = client.get_or_create_collection(
        name=CHROMA_COLLECTION,
        metadata={"hnsw:space": "cosine"},
    )
    return _collection


@dataclass
class SearchResult:
    doc_id: str
    source_id: str  # knowledge_docs.id or external id
    title: str
    source: str  # "upload", "url", "manual"
    text: str
    score: float  # distance from query (lower = better)


def upsert_chunks(
    *,
    doc_id: int | str,
    title: str,
    source: str,
    chunks: list[str],
    embeddings: list[list[float]] | None = None,
) -> int:
    """Insert/overwrite chunks for a single KnowledgeDoc.

    Returns the number of chunks successfully written. Deletes prior chunks
    with the same doc_id metadata so re-ingests are idempotent.
    """
    collection = get_collection()
    if collection is None or not chunks:
        return 0

    doc_key = str(doc_id)

    # Remove stale chunks for same doc if any
    try:
        existing = collection.get(
            where={"doc_id": doc_key}, include=["ids"]
        )
        if existing and existing.get("ids"):
            collection.delete(ids=existing["ids"])
    except Exception as exc:  # noqa: BLE001
        logger.info("No prior chunks for doc %s (%s); skipping delete", doc_key, exc)

    if embeddings is None or len(embeddings) != len(chunks):
        embeddings = embed_texts(chunks)

    valid: list[tuple[str, str, list[float]]] = []
    for i, (chunk, emb) in enumerate(zip(chunks, embeddings, strict=False)):
        if not emb:
            continue
        chunk_id = f"doc{doc_key}_{i}_{hashlib.md5(chunk.encode()).hexdigest()[:8]}"
        valid.append((chunk_id, chunk, emb))

    if not valid:
        return 0

    ids, documents, vectors = zip(*valid)
    metadatas = [
        {"doc_id": doc_key, "title": title, "source": source, "index": i}
        for i in range(len(ids))
    ]
    collection.upsert(
        ids=list(ids),
        documents=list(documents),
        embeddings=list(vectors),
        metadatas=metadatas,
    )
    logger.info(
        "Upserted %s chunks for doc %s (%s) into Chroma",
        len(valid),
        doc_key,
        title,
    )
    return len(valid)


def delete_doc_chunks(doc_id: int | str) -> int:
    collection = get_collection()
    if collection is None:
        return 0
    doc_key = str(doc_id)
    try:
        existing = collection.get(where={"doc_id": doc_key}, include=["ids"])
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to look up chunks for doc %s: %s", doc_key, exc)
        return 0
    ids = existing.get("ids") or []
    if ids:
        collection.delete(ids=ids)
    return len(ids)


def search(query: str, *, top_k: int | None = None) -> list[SearchResult]:
    """Semantic search with a graceful empty fallback when RAG unavailable."""
    k = top_k or RAG_TOP_K
    collection = get_collection()
    if collection is None:
        return []
    q_emb = embed_query(query)
    if not q_emb:
        return []
    try:
        res = collection.query(
            query_embeddings=[q_emb],
            n_results=k,
            include=["documents", "metadatas", "distances"],
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Chroma query failed: %s", exc)
        return []

    out: list[SearchResult] = []
    ids_list = res.get("ids") or [[]]
    docs_list = res.get("documents") or [[]]
    meta_list = res.get("metadatas") or [[]]
    dist_list = res.get("distances") or [[]]
    for i, doc_id in enumerate(ids_list[0]):
        meta = (meta_list[0][i] or {}) if i < len(meta_list[0]) else {}
        distance = float(dist_list[0][i]) if i < len(dist_list[0]) else 9999.0
        text = docs_list[0][i] if i < len(docs_list[0]) else ""
        out.append(
            SearchResult(
                doc_id=str(doc_id),
                source_id=str(meta.get("doc_id", "")),
                title=str(meta.get("title", "Untitled")),
                source=str(meta.get("source", "manual")),
                text=text,
                score=distance,
            )
        )
    return out


def count_chunks() -> int:
    collection = get_collection()
    if collection is None:
        return 0
    try:
        return int(collection.count())
    except Exception:
        return 0


def status_info() -> dict[str, Any]:
    available = is_rag_available(quiet=False)
    info: dict[str, Any] = {
        "enabled": not getattr(__import__(__name__), "RAG_DISABLED", False),
        "available": available,
        "model": getattr(__import__(__name__), "RAG_MODEL", "BAAI/bge-m3"),
        "chroma_dir": str(CHROMA_DIR),
        "collection": CHROMA_COLLECTION,
        "chunks": 0,
    }
    if available:
        info["chunks"] = count_chunks()
    return info


__all__ = [
    "SearchResult",
    "count_chunks",
    "delete_doc_chunks",
    "get_client",
    "get_collection",
    "search",
    "status_info",
    "upsert_chunks",
]

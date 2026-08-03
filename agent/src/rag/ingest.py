"""Document ingestion: PDF → text chunks, URL → html2text, manual text → chunks.

Also manages the KnowledgeDoc registry in SQLite for the docs list page.
"""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from db import SessionLocal, init_db
from models import KnowledgeDoc

from . import UPLOADS_DIR, is_rag_available
from .chunker import chunk_text
from .embed import embed_texts
from .store import delete_doc_chunks, upsert_chunks

logger = logging.getLogger("agent")


def _text_to_chunks(text: str) -> list[str]:
    return chunk_text(text)


def _sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def extract_text_from_pdf(pdf_path: str | Path) -> str:
    """Extract plain text from a local PDF file using pypdf (if available)."""
    try:
        from pypdf import PdfReader
    except ImportError:
        logger.warning("pypdf not installed; cannot ingest PDF %s", pdf_path)
        return ""
    reader = PdfReader(str(pdf_path))
    pages: list[str] = []
    for page in reader.pages:
        try:
            text = page.extract_text() or ""
        except Exception as exc:  # noqa: BLE001
            logger.warning("Skipping page of %s due to error: %s", pdf_path, exc)
            continue
        pages.append(text)
    return "\n\n".join(pages)


def extract_text_from_url(url: str) -> str:
    """Fetch a URL and strip HTML tags for a rough plain-text version."""
    import re

    import httpx

    try:
        r = httpx.get(url, follow_redirects=True, timeout=30)
        r.raise_for_status()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to fetch URL %s: %s", url, exc)
        return ""
    html = r.text
    # 1) drop <script> and <style> blocks
    html = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.IGNORECASE)
    html = re.sub(r"<style[\s\S]*?</style>", " ", html, flags=re.IGNORECASE)
    # 2) tags → whitespace, entities decoded naively
    text = re.sub(r"<[^>]+>", " ", html)
    text = text.replace("&nbsp;", " ").replace("&amp;", "&")
    text = text.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"')
    # 3) collapse whitespace
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _register_doc(
    *, source: str, title: str, content_hash: str, chunk_count: int, metadata: dict[str, Any] | None = None
) -> int:
    """Upsert a KnowledgeDoc row (unique by content_hash) and return its id."""
    init_db()
    with SessionLocal() as db:
        if db is None:
            return 0
        from sqlmodel import select

        existing = db.exec(
            select(KnowledgeDoc).where(KnowledgeDoc.content_hash == content_hash)
        ).first()
        meta_json = json.dumps(metadata) if metadata else None
        if existing is not None:
            existing.title = title
            existing.source = source
            existing.chunk_count = chunk_count
            existing.metadata_ = meta_json
            db.add(existing)
            db.commit()
            db.refresh(existing)
            return int(existing.id or 0)
        row = KnowledgeDoc(
            source=source,
            title=title,
            content_hash=content_hash,
            chunk_count=chunk_count,
            metadata_=meta_json,
            created_at=datetime.utcnow(),
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return int(row.id or 0)


def _save_uploads_dir(text: str, *, title: str, source: str) -> str:
    """Keep a local cache of ingested plain texts in UPLOADS_DIR."""
    Path(UPLOADS_DIR).mkdir(parents=True, exist_ok=True)
    safe_name = hashlib.md5(title.encode("utf-8")).hexdigest()[:12]
    out = Path(UPLOADS_DIR) / f"{source}_{safe_name}.txt"
    out.write_text(text, encoding="utf-8")
    return str(out)


def _ingest_text_internal(
    text: str,
    *,
    source: str,
    title: str,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    text = (text or "").strip()
    if not text:
        return {"ok": False, "error": "Empty document"}
    content_hash = _sha256_text(text)
    chunks = _text_to_chunks(text)
    if not chunks:
        return {"ok": False, "error": "No chunks extracted from document"}
    doc_id = _register_doc(
        source=source,
        title=title,
        content_hash=content_hash,
        chunk_count=len(chunks),
        metadata=metadata,
    )
    _save_uploads_dir(text, title=title, source=source)
    if not is_rag_available():
        # Register doc in SQLite even if Chroma unavailable for graceful banner.
        return {
            "ok": True,
            "doc_id": doc_id,
            "registered": True,
            "embedded": False,
            "chunks": len(chunks),
            "reason": "Chroma not available; metadata registered but not embedded.",
        }
    embeddings = embed_texts(chunks)
    written = upsert_chunks(
        doc_id=str(doc_id),
        title=title,
        source=source,
        chunks=chunks,
        embeddings=embeddings,
    )
    return {
        "ok": True,
        "doc_id": doc_id,
        "registered": True,
        "embedded": written > 0,
        "chunks": written,
    }


def ingest_pdf(pdf_path: str | Path, *, title: str | None = None) -> dict[str, Any]:
    text = extract_text_from_pdf(pdf_path)
    final_title = title or Path(pdf_path).stem
    return _ingest_text_internal(
        text,
        source="upload",
        title=final_title,
        metadata={"original_path": str(pdf_path)},
    )


def ingest_url(url: str, *, title: str | None = None) -> dict[str, Any]:
    text = extract_text_from_url(url)
    final_title = title or urlparse(url).netloc
    return _ingest_text_internal(
        text,
        source="url",
        title=final_title,
        metadata={"url": url},
    )


def ingest_manual(*, title: str, content: str) -> dict[str, Any]:
    return _ingest_text_internal(
        content,
        source="manual",
        title=title or "Untitled",
        metadata={},
    )


def list_docs() -> list[dict[str, Any]]:
    init_db()
    with SessionLocal() as db:
        if db is None:
            return []
        from sqlmodel import select

        rows = db.exec(
            select(KnowledgeDoc).order_by(KnowledgeDoc.created_at.desc())
        ).all()
        out: list[dict[str, Any]] = []
        for r in rows:
            out.append(
                {
                    "id": r.id,
                    "source": r.source,
                    "title": r.title,
                    "chunk_count": r.chunk_count,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                    "metadata": json.loads(r.metadata_) if r.metadata_ else None,
                }
            )
        return out


def delete_doc(doc_id: int) -> bool:
    init_db()
    with SessionLocal() as db:
        if db is None:
            return False
        row = db.get(KnowledgeDoc, doc_id)
        if row is None:
            return False
        db.delete(row)
        db.commit()
    deleted = delete_doc_chunks(str(doc_id))
    logger.info("Deleted doc %s (removed %s chunks)", doc_id, deleted)
    return True


__all__ = [
    "delete_doc",
    "extract_text_from_pdf",
    "extract_text_from_url",
    "ingest_manual",
    "ingest_pdf",
    "ingest_url",
    "list_docs",
]

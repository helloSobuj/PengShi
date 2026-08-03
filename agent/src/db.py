"""SQLite database setup with graceful DB_DISABLED fallback."""

from __future__ import annotations

import logging
import os
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator, Optional

from sqlmodel import Session, SQLModel, create_engine, select

logger = logging.getLogger("agent")

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
DB_PATH = DATA_DIR / "echo.sqlite3"

DB_DISABLED = os.getenv("DB_DISABLED", "false").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}

_engine = None
_initialized = False


def get_engine():
    """Return a shared SQLAlchemy engine, creating it on first call."""
    global _engine
    if _engine is None and not DB_DISABLED:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        sqlite_url = f"sqlite:///{DB_PATH}"
        _engine = create_engine(
            sqlite_url,
            connect_args={"check_same_thread": False},
            echo=False,
        )
    return _engine


def init_db() -> None:
    """Create all tables. Safe to call multiple times (idempotent).

    Imports models lazily so the module can still be imported when sqlmodel is
    not installed or DB_DISABLED=true.
    """
    global _initialized
    if _initialized or DB_DISABLED:
        if DB_DISABLED and not _initialized:
            logger.info("DB disabled (DB_DISABLED=true); skipping SQLite init")
        _initialized = True
        return
    try:
        from models import ChatMessage, ChatSession, KnowledgeDoc, Note  # noqa: F401
    except ImportError as exc:
        logger.warning("Cannot import SQLModel models; DB unavailable: %s", exc)
        return
    engine = get_engine()
    if engine is None:
        return
    SQLModel.metadata.create_all(engine)
    _initialized = True
    logger.info("SQLite initialised at %s", DB_PATH)


@contextmanager
def SessionLocal() -> Iterator[Optional[Session]]:
    """Context manager yielding a SQLModel session, or None if DB disabled.

    Usage::

        with SessionLocal() as db:
            if db is None:
                return fallback_result()
            db.add(...)
            db.commit()
    """
    if DB_DISABLED:
        yield None
        return
    engine = get_engine()
    if engine is None:
        yield None
        return
    session = Session(engine)
    try:
        yield session
    finally:
        session.close()


__all__ = [
    "DB_DISABLED",
    "DB_PATH",
    "DATA_DIR",
    "SessionLocal",
    "get_engine",
    "init_db",
    "select",
]

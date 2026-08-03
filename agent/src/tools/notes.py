"""SQLite-backed notes storage for the personal assistant, with legacy JSON migration."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from livekit.agents import RunContext, function_tool
from sqlmodel import select

from db import DB_DISABLED, SessionLocal, init_db

logger = logging.getLogger("agent")

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
NOTES_FILE = DATA_DIR / "notes.json"

_migrated = False


def _ensure_migrated() -> None:
    """Auto-migrate legacy notes.json into SQLite once on first use."""
    global _migrated
    if _migrated or DB_DISABLED:
        return
    init_db()
    _migrated = True
    if not NOTES_FILE.exists():
        return
    try:
        raw = json.loads(NOTES_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Skipping notes migration; couldn't read notes.json: %s", exc)
        return
    if not isinstance(raw, list) or not raw:
        return

    from models import Note

    migrated = 0
    with SessionLocal() as db:
        if db is None:
            return
        existing = db.exec(select(Note.id)).all()
        if existing:
            logger.info(
                "SQLite notes table already has %s rows; skipping notes.json migration",
                len(existing),
            )
            return
        for entry in raw:
            if not isinstance(entry, dict) or "text" not in entry:
                continue
            created = entry.get("created_at")
            if isinstance(created, str):
                try:
                    created_at = datetime.fromisoformat(created.replace("Z", "+00:00"))
                except ValueError:
                    created_at = None
            else:
                created_at = None
            if created_at is None:
                created_at = datetime.now(timezone.utc)
            db.add(Note(text=str(entry["text"]).strip(), created_at=created_at))
            migrated += 1
        db.commit()
    if migrated:
        logger.info("Migrated %s notes from notes.json to SQLite", migrated)


def _count_notes() -> int:
    if DB_DISABLED:
        if NOTES_FILE.exists():
            try:
                return len(json.loads(NOTES_FILE.read_text(encoding="utf-8")))
            except (json.JSONDecodeError, OSError):
                return 0
        return 0
    from models import Note

    with SessionLocal() as db:
        if db is None:
            return 0
        return db.query(Note).count()


@function_tool
async def save_note(context: RunContext, text: str) -> str:
    """Save a personal note for the user.

    Args:
        text: The note content to remember.
    """
    _ensure_migrated()
    text_clean = text.strip()
    if not text_clean:
        return "The note was empty, so I didn't save anything."

    if DB_DISABLED:
        # Legacy JSON fallback
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        notes: list[dict] = []
        if NOTES_FILE.exists():
            try:
                loaded = json.loads(NOTES_FILE.read_text(encoding="utf-8"))
                if isinstance(loaded, list):
                    notes = loaded
            except (json.JSONDecodeError, OSError) as exc:
                logger.warning("Failed to load notes.json: %s", exc)
                notes = []
        entry = {
            "id": len(notes) + 1,
            "text": text_clean,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        notes.append(entry)
        NOTES_FILE.write_text(json.dumps(notes, indent=2), encoding="utf-8")
        return f"Saved note number {entry['id']}."

    from models import Note

    with SessionLocal() as db:
        if db is None:
            return "Notes storage is unavailable right now."
        note = Note(text=text_clean)
        db.add(note)
        db.commit()
        db.refresh(note)
        logger.info("Saved note #%s", note.id)
        return f"Saved note number {note.id}."


@function_tool
async def list_notes(context: RunContext) -> str:
    """List all saved personal notes."""
    _ensure_migrated()

    if DB_DISABLED:
        notes: list[dict] = []
        if NOTES_FILE.exists():
            try:
                loaded = json.loads(NOTES_FILE.read_text(encoding="utf-8"))
                if isinstance(loaded, list):
                    notes = loaded
            except (json.JSONDecodeError, OSError) as exc:
                logger.warning("Failed to load notes.json: %s", exc)
        if not notes:
            return "You have no saved notes yet."
        lines = [f"Note {n['id']}: {n['text']}" for n in notes]
        return f"You have {len(notes)} notes. " + " ".join(lines)

    from models import Note

    with SessionLocal() as db:
        if db is None:
            return "Notes storage is unavailable right now."
        notes = db.exec(select(Note).order_by(Note.created_at.desc())).all()
        if not notes:
            return "You have no saved notes yet."
        lines = [f"Note {n.id}: {n.text}" for n in notes]
        return f"You have {len(notes)} notes. " + " ".join(lines)


__all__ = ["save_note", "list_notes", "_count_notes", "_ensure_migrated"]

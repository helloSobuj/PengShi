"""Local JSON notes storage for the personal assistant."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

from livekit.agents import RunContext, function_tool

logger = logging.getLogger("agent")

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
NOTES_FILE = DATA_DIR / "notes.json"


def _ensure_notes_file() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not NOTES_FILE.exists():
        NOTES_FILE.write_text("[]", encoding="utf-8")


def _load_notes() -> list[dict]:
    _ensure_notes_file()
    try:
        data = json.loads(NOTES_FILE.read_text(encoding="utf-8"))
        if isinstance(data, list):
            return data
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Failed to load notes: %s", exc)
    return []


def _save_notes(notes: list[dict]) -> None:
    _ensure_notes_file()
    NOTES_FILE.write_text(json.dumps(notes, indent=2), encoding="utf-8")


@function_tool
async def save_note(context: RunContext, text: str) -> str:
    """Save a personal note for the user.

    Args:
        text: The note content to remember.
    """
    notes = _load_notes()
    entry = {
        "id": len(notes) + 1,
        "text": text.strip(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    notes.append(entry)
    _save_notes(notes)
    logger.info("Saved note #%s", entry["id"])
    return f"Saved note number {entry['id']}."


@function_tool
async def list_notes(context: RunContext) -> str:
    """List all saved personal notes."""
    notes = _load_notes()
    if not notes:
        return "You have no saved notes yet."

    lines = [f"Note {n['id']}: {n['text']}" for n in notes]
    return f"You have {len(notes)} notes. " + " ".join(lines)

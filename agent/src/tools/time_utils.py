"""Time utility tool for the personal assistant."""

from __future__ import annotations

from datetime import datetime

from livekit.agents import RunContext, function_tool


@function_tool
async def get_current_time(context: RunContext) -> str:
    """Get the current local date and time."""
    now = datetime.now().astimezone()
    # Spell-friendly spoken format for TTS
    spoken = now.strftime("%A, %B %d, %Y at %I:%M %p")
    return f"The current time is {spoken}."

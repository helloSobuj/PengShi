"""Echo personal voice + vision agent entrypoint with SQLite chat history."""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import AsyncIterator, Optional
from uuid import UUID

from dotenv import load_dotenv
from livekit.agents import AgentServer, ChatContext, JobContext, cli, room_io
from livekit.plugins import ai_coustics

from assistant import PersonalAssistant
from config import build_session, get_model_mode
from db import SessionLocal, init_db
from mcp_config import (
    build_mcp_toolsets,
    collect_user_attributes_from_room,
    load_admin_mcp_servers,
    merge_mcp_servers,
    parse_user_mcp_servers,
)
from models import ChatMessage, ChatSession

logger = logging.getLogger("agent")

load_dotenv(".env.local")

# Re-export for tests and external imports
Assistant = PersonalAssistant

server = AgentServer()

# ---------- shared session context ----------

_current_session_id: Optional[UUID] = None


def get_current_session_id() -> Optional[UUID]:
    return _current_session_id


def _create_chat_session(
    *, room_name: str, participant_identity: Optional[str], model_mode: str
) -> UUID:
    """Create a new ChatSession row and return its UUID.

    Safe no-op when DB_DISABLED=true.
    """
    init_db()
    with SessionLocal() as db:
        if db is None:
            return UUID(int=0)
        session = ChatSession(
            room_name=room_name,
            participant_identity=participant_identity,
            model_mode=model_mode,
        )
        db.add(session)
        db.commit()
        db.refresh(session)
        logger.info("Created chat session %s for room=%s", session.id, room_name)
        return session.id


def _end_chat_session(session_id: Optional[UUID]) -> None:
    if session_id is None or session_id.int == 0:
        return
    with SessionLocal() as db:
        if db is None:
            return
        row = db.get(ChatSession, session_id)
        if row is not None:
            row.ended_at = datetime.now(timezone.utc)
            db.add(row)
            db.commit()
            logger.info("Ended chat session %s", session_id)


def append_chat_message(
    *, session_id: Optional[UUID], role: str, content: str
) -> None:
    """Append one message row for the currently tracked session."""
    if session_id is None or session_id.int == 0:
        return
    with SessionLocal() as db:
        if db is None:
            return
        db.add(ChatMessage(session_id=session_id, role=role, content=content))
        db.commit()


# ---------- vision flag ----------

def _vision_enabled() -> bool:
    return os.getenv("VISION_ENABLED", "true").strip().lower() in {"1", "true", "yes", "on"}


@asynccontextmanager
async def session_ctx(
    *, room_name: str, participant_identity: Optional[str], model_mode: str
) -> AsyncIterator[UUID]:
    """Context manager that creates a ChatSession on enter and ends it on exit."""
    global _current_session_id
    sid = _create_chat_session(
        room_name=room_name,
        participant_identity=participant_identity,
        model_mode=model_mode,
    )
    _current_session_id = sid
    try:
        yield sid
    finally:
        _end_chat_session(sid)
        _current_session_id = None


# ---------- agent definition ----------

@server.rtc_session(agent_name="echo-agent")
async def echo_agent(ctx: JobContext):
    ctx.log_context_fields = {
        "room": ctx.room.name,
        "model_mode": get_model_mode(),
        "vision": _vision_enabled(),
    }

    # Connect first so JWT participant attributes (user MCP) are visible.
    await ctx.connect()

    admin = load_admin_mcp_servers()
    user = parse_user_mcp_servers(collect_user_attributes_from_room(ctx.room))
    merged = merge_mcp_servers(admin, user)
    mcp_tools = build_mcp_toolsets(merged)
    logger.info(
        "MCP servers: admin=%s user=%s toolsets=%s",
        len(admin),
        len(user),
        len(mcp_tools),
    )

    session = build_session(tools=mcp_tools or None)
    mode = get_model_mode()
    participant_identity: Optional[str] = None
    if ctx.room.local_participant is not None:
        # Prefer the first remote participant's identity for the user column
        for remote in ctx.room.remote_participants.values():
            participant_identity = remote.identity
            break

    async with session_ctx(
        room_name=ctx.room.name,
        participant_identity=participant_identity,
        model_mode=mode,
    ):
        agent = PersonalAssistant()

        # --- chat history hooks: wrap the agent's lifecycle hooks ---------
        original_on_user = agent.on_user_turn_completed
        original_on_agent = getattr(agent, "on_agent_reply_completed", None)

        async def wrapped_on_user(turn_ctx: ChatContext, new_message) -> None:
            # Persist user message BEFORE passing to the hook so history
            # captures what the user actually said.
            user_text = ""
            if isinstance(new_message.content, str):
                user_text = new_message.content
            elif isinstance(new_message.content, list):
                # Drop ImageContent, keep plain text segments
                parts = [c for c in new_message.content if isinstance(c, str)]
                user_text = " ".join(parts)
            append_chat_message(
                session_id=get_current_session_id(), role="user", content=user_text
            )
            await original_on_user(turn_ctx, new_message)

        async def wrapped_on_agent(turn_ctx: ChatContext, new_message) -> None:
            text = ""
            if isinstance(new_message.content, str):
                text = new_message.content
            elif isinstance(new_message.content, list):
                parts = [c for c in new_message.content if isinstance(c, str)]
                text = " ".join(parts)
            append_chat_message(
                session_id=get_current_session_id(),
                role="assistant",
                content=text,
            )
            if original_on_agent is not None:
                await original_on_agent(turn_ctx, new_message)

        agent.on_user_turn_completed = wrapped_on_user
        setattr(agent, "on_agent_reply_completed", wrapped_on_agent)

        await session.start(
            agent=agent,
            room=ctx.room,
            room_options=room_io.RoomOptions(
                video_input=_vision_enabled(),
                audio_input=room_io.AudioInputOptions(
                    noise_cancellation=ai_coustics.audio_enhancement(
                        model=ai_coustics.EnhancerModel.QUAIL_VF_S
                    ),
                ),
            ),
        )

        await session.generate_reply(
            instructions=(
                "Greet the user warmly as Echo. Mention that you can hear them, "
                "and if they turn on the camera you can also see what they show you."
            )
        )


if __name__ == "__main__":
    cli.run_app(server)

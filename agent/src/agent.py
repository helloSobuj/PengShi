"""Echo personal voice + vision agent entrypoint."""

from __future__ import annotations

import logging
import os

from dotenv import load_dotenv
from livekit.agents import AgentServer, JobContext, cli, room_io
from livekit.plugins import ai_coustics

from assistant import PersonalAssistant
from config import build_session, get_model_mode
from mcp_config import (
    build_mcp_toolsets,
    collect_user_attributes_from_room,
    load_admin_mcp_servers,
    merge_mcp_servers,
    parse_user_mcp_servers,
)

logger = logging.getLogger("agent")

load_dotenv(".env.local")

# Re-export for tests and external imports
Assistant = PersonalAssistant

server = AgentServer()


def _vision_enabled() -> bool:
    return os.getenv("VISION_ENABLED", "true").strip().lower() in {"1", "true", "yes", "on"}


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

    await session.start(
        agent=PersonalAssistant(),
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

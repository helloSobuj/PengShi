"""Model provider configuration: LiveKit Inference, BYOK, or OpenRouter (vision)."""

from __future__ import annotations

import logging
import os
from typing import Any

from livekit.agents import AgentSession, TurnHandlingOptions, inference

logger = logging.getLogger("agent")

CARTESIA_DEFAULT_VOICE = "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc"
# Vision-capable Gemini via OpenRouter (no Google API key required)
DEFAULT_OPENROUTER_VISION_MODEL = "google/gemini-2.5-flash"


def get_model_mode() -> str:
    """Return 'inference' (default), 'byok', or 'openrouter'."""
    mode = os.getenv("MODEL_MODE", "inference").strip().lower()
    # Auto-enable OpenRouter when key is present and vision is requested
    if mode == "inference" and os.getenv("OPENROUTER_API_KEY") and _vision_enabled():
        return "openrouter"
    return mode


def _vision_enabled() -> bool:
    return os.getenv("VISION_ENABLED", "true").strip().lower() in {"1", "true", "yes", "on"}


def build_session(*, tools: list[Any] | None = None) -> AgentSession:
    """Build an AgentSession using Inference, BYOK, or OpenRouter+Gemini."""
    mode = get_model_mode()
    # Preemptive replies start before on_user_turn_completed, so they never see
    # the attached screen/camera frame. Keep them off whenever vision is enabled.
    vision = _vision_enabled()
    turn_handling = TurnHandlingOptions(
        turn_detection=inference.TurnDetector(),
        preemptive_generation={"enabled": not vision},
    )
    if vision:
        logger.info("VISION_ENABLED — disabling preemptive generation so frames can attach")

    extra: dict[str, Any] = {}
    if tools:
        extra["tools"] = tools

    if mode == "byok":
        logger.info("MODEL_MODE=byok — using Deepgram, OpenAI, and Cartesia plugins")
        from livekit.plugins import cartesia, deepgram, openai

        return AgentSession(
            stt=deepgram.STT(model="nova-3"),
            llm=openai.LLM(model=os.getenv("OPENAI_LLM_MODEL", "gpt-4.1-mini")),
            tts=cartesia.TTS(
                model=os.getenv("CARTESIA_TTS_MODEL", "sonic-3"),
                voice=os.getenv("CARTESIA_VOICE_ID", CARTESIA_DEFAULT_VOICE),
            ),
            turn_handling=turn_handling,
            **extra,
        )

    if mode == "openrouter":
        logger.info("MODEL_MODE=openrouter — STT/TTS via Inference, LLM via OpenRouter")
        from livekit.plugins import openai

        model = os.getenv("OPENROUTER_MODEL", DEFAULT_OPENROUTER_VISION_MODEL)
        return AgentSession(
            stt=inference.STT(model="deepgram/nova-3", language="multi"),
            llm=openai.LLM.with_openrouter(
                model=model,
                api_key=os.getenv("OPENROUTER_API_KEY"),
                site_url=os.getenv("OPENROUTER_SITE_URL", "https://echo-web-tau-ochre.vercel.app"),
                app_name=os.getenv("OPENROUTER_APP_NAME", "Echo Voice Agent"),
            ),
            tts=inference.TTS(
                model="inworld/inworld-tts-2",
                voice=os.getenv("INFERENCE_TTS_VOICE", "Ashley"),
            ),
            turn_handling=turn_handling,
            **extra,
        )

    if mode != "inference":
        logger.warning("Unknown MODEL_MODE=%r; falling back to inference", mode)

    logger.info("MODEL_MODE=inference — using LiveKit Inference")
    return AgentSession(
        stt=inference.STT(model="deepgram/nova-3", language="multi"),
        llm=inference.LLM(model="google/gemma-4-31b-it"),
        tts=inference.TTS(
            model="inworld/inworld-tts-2",
            voice=os.getenv("INFERENCE_TTS_VOICE", "Ashley"),
        ),
        turn_handling=turn_handling,
        **extra,
    )

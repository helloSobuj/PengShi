"""Tavily web search tool for the personal assistant."""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path

import httpx
from livekit.agents import RunContext, function_tool

logger = logging.getLogger("agent")

CONFIG_PATH = Path(__file__).resolve().parents[2] / "data" / "api_config.json"


def _get_tavily_key() -> str | None:
    key = os.getenv("TAVILY_API_KEY")
    if key:
        return key

    try:
        if CONFIG_PATH.exists():
            data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                tavily = data.get("tavily")
                if isinstance(tavily, dict):
                    return tavily.get("api_key")
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Failed to load config for Tavily key: %s", exc)

    return None


def _is_tavily_enabled() -> bool:
    try:
        if CONFIG_PATH.exists():
            data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                tavily = data.get("tavily")
                if isinstance(tavily, dict):
                    return tavily.get("enabled", True)
    except (json.JSONDecodeError, OSError):
        pass

    return True


@function_tool
async def web_search(context: RunContext, query: str) -> str:
    """Search the web using Tavily and return a concise summary of the top results.

    Args:
        query: The search query to run against the web.
    """
    key = _get_tavily_key()
    if not key:
        return "Web search is not configured. Please ask the administrator to set up a Tavily API key."

    if not _is_tavily_enabled():
        return "Web search is currently disabled."

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                "https://api.tavily.com/search",
                json={
                    "query": query,
                    "max_results": 5,
                    "include_answer": True,
                    "api_key": key,
                },
            )
            response.raise_for_status()
            data = response.json()

        results = data.get("results", [])
        if not results:
            return f"I searched the web for '{query}' but found no results."

        summary_parts: list[str] = []
        answer = data.get("answer")
        if answer:
            summary_parts.append(answer)

        for i, result in enumerate(results[:3], 1):
            title = result.get("title", f"Result {i}")
            snippet = result.get("content", "")
            summary_parts.append(f"{i}. {title}: {snippet}")

        return " ".join(summary_parts)

    except httpx.HTTPStatusError as exc:
        logger.error("Tavily HTTP error: %s", exc)
        return "I couldn't reach the web right now. Please try again later."
    except httpx.RequestError as exc:
        logger.error("Tavily request error: %s", exc)
        return "I couldn't reach the web right now. Please try again later."
    except Exception as exc:
        logger.error("Unexpected error during web search: %s", exc)
        return "Something went wrong with the web search. Please try again."

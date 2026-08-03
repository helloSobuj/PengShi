"""Load and merge MCP server configs for Echo."""

from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

logger = logging.getLogger("agent")

USER_ATTR_KEY = "echo_mcp_servers"
MAX_USER_SERVERS = 10
_ID_RE = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")


@dataclass
class McpServerConfig:
    id: str
    name: str
    url: str
    enabled: bool = True
    headers: dict[str, str] = field(default_factory=dict)


def _normalize_headers(raw: Any) -> dict[str, str]:
    if raw is None:
        return {}
    if not isinstance(raw, dict):
        raise ValueError("headers must be an object")
    out: dict[str, str] = {}
    for k, v in raw.items():
        if not isinstance(k, str) or not isinstance(v, str):
            raise ValueError("header keys and values must be strings")
        out[k] = v
    return out


def parse_mcp_server_list(raw: Any) -> list[McpServerConfig]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise ValueError("MCP servers must be a JSON array")
    servers: list[McpServerConfig] = []
    for item in raw:
        if not isinstance(item, dict):
            raise ValueError("each MCP server must be an object")
        sid = str(item.get("id") or "").strip()
        name = str(item.get("name") or sid or "MCP").strip()
        url = str(item.get("url") or "").strip()
        if not sid or not _ID_RE.match(sid):
            raise ValueError(f"invalid MCP server id: {sid!r}")
        if not url:
            raise ValueError("MCP server url is required")
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"}:
            raise ValueError(f"MCP url must be http(s): {url}")
        enabled = item.get("enabled", True)
        if not isinstance(enabled, bool):
            raise ValueError("enabled must be a boolean")
        servers.append(
            McpServerConfig(
                id=sid,
                name=name,
                url=url,
                enabled=enabled,
                headers=_normalize_headers(item.get("headers")),
            )
        )
    return servers


def load_admin_mcp_servers(data_path: Path | None = None) -> list[McpServerConfig]:
    env_raw = os.getenv("MCP_SERVERS", "").strip()
    if env_raw:
        try:
            return parse_mcp_server_list(json.loads(env_raw))
        except (json.JSONDecodeError, ValueError) as exc:
            logger.warning("Invalid MCP_SERVERS env: %s", exc)
            return []

    path = data_path or (
        Path(__file__).resolve().parents[1] / "data" / "mcp_servers.json"
    )
    if not path.exists():
        return []
    try:
        return parse_mcp_server_list(json.loads(path.read_text(encoding="utf-8")))
    except (json.JSONDecodeError, OSError, ValueError) as exc:
        logger.warning("Failed to load %s: %s", path, exc)
        return []


def parse_user_mcp_servers(attributes: dict[str, str] | None) -> list[McpServerConfig]:
    if not attributes:
        return []
    raw = attributes.get(USER_ATTR_KEY)
    if not raw:
        return []
    try:
        servers = parse_mcp_server_list(json.loads(raw))
    except (json.JSONDecodeError, ValueError) as exc:
        logger.warning("Invalid user MCP attribute: %s", exc)
        return []
    return servers[:MAX_USER_SERVERS]


def merge_mcp_servers(
    admin: list[McpServerConfig], user: list[McpServerConfig]
) -> list[McpServerConfig]:
    by_url: dict[str, McpServerConfig] = {}
    for s in admin:
        by_url[s.url] = s
    for s in user:
        by_url[s.url] = s
    return list(by_url.values())


def collect_user_attributes_from_room(room: Any) -> dict[str, str]:
    """Best-effort: first remote participant that has echo_mcp_servers."""
    remotes = getattr(room, "remote_participants", {}) or {}
    for participant in remotes.values():
        attrs = getattr(participant, "attributes", None) or {}
        if USER_ATTR_KEY in attrs:
            return dict(attrs)
    for participant in remotes.values():
        attrs = getattr(participant, "attributes", None) or {}
        if attrs:
            return dict(attrs)
    return {}


def build_mcp_toolsets(servers: list[McpServerConfig]) -> list[Any]:
    try:
        from livekit.agents import mcp
    except ImportError as exc:
        logger.error(
            "MCP extra missing. Install with: uv sync / livekit-agents[mcp]. %s",
            exc,
        )
        raise

    toolsets: list[Any] = []
    for server in servers:
        if not server.enabled:
            continue
        try:
            toolsets.append(
                mcp.MCPToolset(
                    id=server.id,
                    mcp_server=mcp.MCPServerHTTP(
                        url=server.url,
                        headers=server.headers or None,
                        client_session_timeout_seconds=30,
                    ),
                )
            )
        except Exception as exc:
            logger.warning(
                "Skipping MCP server %s (%s): %s", server.id, server.url, exc
            )
    return toolsets

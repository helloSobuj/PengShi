import json
from pathlib import Path

import pytest

from mcp_config import (
    USER_ATTR_KEY,
    McpServerConfig,
    build_mcp_toolsets,
    load_admin_mcp_servers,
    merge_mcp_servers,
    parse_mcp_server_list,
    parse_user_mcp_servers,
)


def test_parse_valid_list():
    raw = [
        {
            "id": "a",
            "name": "A",
            "url": "https://example.com/sse",
            "enabled": True,
            "headers": {"Authorization": "Bearer x"},
        }
    ]
    servers = parse_mcp_server_list(raw)
    assert len(servers) == 1
    assert servers[0].url == "https://example.com/sse"
    assert servers[0].headers["Authorization"] == "Bearer x"


def test_parse_rejects_bad_scheme():
    with pytest.raises(ValueError):
        parse_mcp_server_list(
            [{"id": "x", "name": "X", "url": "ftp://nope", "enabled": True}]
        )


def test_merge_user_overrides_same_url():
    admin = [
        McpServerConfig(
            id="a", name="Admin", url="https://ex.com/sse", enabled=True, headers={}
        )
    ]
    user = [
        McpServerConfig(
            id="u",
            name="User",
            url="https://ex.com/sse",
            enabled=True,
            headers={"Authorization": "Bearer u"},
        )
    ]
    merged = merge_mcp_servers(admin, user)
    assert len(merged) == 1
    assert merged[0].name == "User"
    assert merged[0].headers["Authorization"] == "Bearer u"


def test_parse_user_from_attributes():
    payload = json.dumps(
        [{"id": "u", "name": "U", "url": "https://ex.com/sse", "enabled": True}]
    )
    servers = parse_user_mcp_servers({USER_ATTR_KEY: payload})
    assert len(servers) == 1


def test_load_admin_from_env(monkeypatch):
    monkeypatch.setenv(
        "MCP_SERVERS",
        json.dumps(
            [
                {
                    "id": "e",
                    "name": "E",
                    "url": "https://env.example/sse",
                    "enabled": True,
                }
            ]
        ),
    )
    servers = load_admin_mcp_servers(Path("/nonexistent/mcp_servers.json"))
    assert len(servers) == 1
    assert servers[0].id == "e"


def test_build_mcp_toolsets_skips_disabled():
    servers = [
        McpServerConfig(
            id="off", name="Off", url="https://ex.com/sse", enabled=False, headers={}
        ),
        McpServerConfig(
            id="on", name="On", url="https://ex.com/other", enabled=True, headers={}
        ),
    ]
    toolsets = build_mcp_toolsets(servers)
    assert len(toolsets) == 1
    assert toolsets[0].id == "on"

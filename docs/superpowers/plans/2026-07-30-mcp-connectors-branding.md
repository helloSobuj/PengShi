# MCP Connectors + Echo Branding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Echo load HTTP/SSE MCP tools from admin env defaults plus per-user connectors configured in the web UI, and remove user-visible LiveKit branding from the frontend.

**Architecture:** Admin MCP servers come from `MCP_SERVERS` env (or `agent/data/mcp_servers.json`). User connectors live in `localStorage`, are POSTed to `/api/token`, and ride on LiveKit participant JWT attributes (`echo_mcp_servers`). The agent connects to the room, merges configs, builds `mcp.MCPToolset`s, then starts the session. Branding swaps LiveKit logos/copy for Echo marks.

**Tech Stack:** LiveKit Agents Python (`livekit-agents[mcp]`, `MCPToolset`, `MCPServerHTTP`), Next.js token route + `TokenSource.custom`, localStorage, existing `/admin` panel.

**Spec:** `docs/superpowers/specs/2026-07-30-mcp-connectors-branding-design.md`

---

## File map

| File | Responsibility |
| --- | --- |
| `agent/pyproject.toml`, `agent/uv.lock` | Add `[mcp]` extra (may already be dirty from prep) |
| `agent/src/mcp_config.py` | Parse/merge MCP configs; build toolsets |
| `agent/tests/test_mcp_config.py` | Unit tests for parse/merge/validate |
| `agent/src/config.py` | Accept optional `tools=` on `build_session` |
| `agent/src/agent.py` | Connect → merge MCP → start session with toolsets |
| `agent/src/assistant.py` | MCP blurb in instructions |
| `agent/.env.example` | Document `MCP_SERVERS` |
| `agent/data/mcp_servers.json` | Optional empty/example local defaults file |
| `web/lib/mcp-connectors.ts` | Types, localStorage, validate helpers |
| `web/app/api/token/route.ts` | Accept `mcp_servers`; set JWT attributes |
| `web/components/app/app.tsx` | TokenSource that posts MCP list |
| `web/components/app/mcp-connectors-panel.tsx` | User CRUD UI |
| `web/components/app/settings-panel.tsx` | Link/open connectors |
| `web/components/app/welcome-view.tsx` | Branding + connectors entry |
| `web/app/layout.tsx` | Echo header, remove LiveKit footer brand |
| `web/app-config.ts` | Echo description + logo paths |
| `web/public/echo-logo.svg`, `echo-logo-dark.svg` | Simple Echo marks |
| `web/app/opengraph-image.tsx` | Use Echo logos |
| `web/app/admin/page.tsx` | MCP defaults help + local file save if writable |
| `web/lib/agent-config.ts` / admin API | Optional local `mcp_servers.json` read/write |

---

### Task 1: Agent dependency (`livekit-agents[mcp]`)

**Files:**
- Modify: `agent/pyproject.toml`
- Modify: `agent/uv.lock`

- [ ] **Step 1: Ensure mcp extra is declared**

In `agent/pyproject.toml`, dependencies must include:

```toml
"livekit-agents[openai,deepgram,cartesia,mcp]>=1.6.1",
```

If already present from prep work, skip editing and only verify lockfile.

- [ ] **Step 2: Sync lockfile**

Run:

```bash
cd agent
uv sync
uv run python -c "from livekit.agents import mcp; print(mcp.MCPToolset, mcp.MCPServerHTTP)"
```

Expected: prints class objects; no ImportError.

- [ ] **Step 3: Commit**

```bash
git add agent/pyproject.toml agent/uv.lock
git commit -m "Add livekit-agents MCP optional dependency."
```

---

### Task 2: `mcp_config` module + unit tests

**Files:**
- Create: `agent/src/mcp_config.py`
- Create: `agent/tests/test_mcp_config.py`

- [ ] **Step 1: Write failing tests**

Create `agent/tests/test_mcp_config.py`:

```python
import json
import os
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
        parse_mcp_server_list([{"id": "x", "name": "X", "url": "ftp://nope", "enabled": True}])


def test_merge_user_overrides_same_url():
    admin = [
        McpServerConfig(id="a", name="Admin", url="https://ex.com/sse", enabled=True, headers={})
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
            [{"id": "e", "name": "E", "url": "https://env.example/sse", "enabled": True}]
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
```

- [ ] **Step 2: Run tests — expect fail**

Run:

```bash
cd agent
uv run pytest tests/test_mcp_config.py -v
```

Expected: FAIL with `ModuleNotFoundError: mcp_config` (or import error).

- [ ] **Step 3: Implement `agent/src/mcp_config.py`**

```python
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

    path = data_path or (Path(__file__).resolve().parents[1] / "data" / "mcp_servers.json")
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
    # Fallback: any remote participant attributes
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
            "MCP extra missing. Install with: uv sync / livekit-agents[mcp]. %s", exc
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
            logger.warning("Skipping MCP server %s (%s): %s", server.id, server.url, exc)
    return toolsets
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd agent
uv run pytest tests/test_mcp_config.py -v
```

Expected: all PASSED.

- [ ] **Step 5: Commit**

```bash
git add agent/src/mcp_config.py agent/tests/test_mcp_config.py
git commit -m "Add MCP server config parse/merge helpers."
```

---

### Task 3: Wire MCP into agent session start

**Files:**
- Modify: `agent/src/config.py`
- Modify: `agent/src/agent.py`
- Modify: `agent/src/assistant.py`
- Modify: `agent/.env.example`
- Create: `agent/data/mcp_servers.json` (empty array `[]`)

- [ ] **Step 1: Extend `build_session` to accept tools**

In `agent/src/config.py`, change signature and pass `tools` through every `AgentSession(...)`:

```python
def build_session(*, tools: list | None = None) -> AgentSession:
    ...
    session_kwargs: dict = {"turn_handling": turn_handling}
    if tools:
        session_kwargs["tools"] = tools
    # each return AgentSession(..., **session_kwargs) or tools=tools when present
```

Apply to byok / openrouter / inference branches: add `tools=tools` when `tools` is not None/empty.

- [ ] **Step 2: Update `agent.py` startup order**

Replace session start sequence with:

```python
from mcp_config import (
    build_mcp_toolsets,
    collect_user_attributes_from_room,
    load_admin_mcp_servers,
    merge_mcp_servers,
    parse_user_mcp_servers,
)

@server.rtc_session(agent_name="echo-agent")
async def echo_agent(ctx: JobContext):
    ...
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
        room_options=room_io.RoomOptions(...),
    )

    await session.generate_reply(...)
```

Important: move `ctx.connect()` **before** `session.start`, and remove the old connect-after-start order.

- [ ] **Step 3: Instructions blurb in `assistant.py`**

Under `# Tools`, add:

```text
- External MCP tools may be available depending on configuration. When they are,
  use them for matching user requests. Never invent tool results.
```

- [ ] **Step 4: Env example + empty data file**

Append to `agent/.env.example`:

```bash
# --- Optional: admin-default MCP servers (JSON array) ---
# MCP_SERVERS=[{"id":"example","name":"Example","url":"https://example.com/sse","enabled":true,"headers":{}}]
```

Create `agent/data/mcp_servers.json`:

```json
[]
```

- [ ] **Step 5: Smoke import**

```bash
cd agent
uv run python -c "from agent import echo_agent; from mcp_config import load_admin_mcp_servers; print(load_admin_mcp_servers())"
```

Expected: prints `[]` (or configured servers).

- [ ] **Step 6: Commit**

```bash
git add agent/src/config.py agent/src/agent.py agent/src/assistant.py agent/.env.example agent/data/mcp_servers.json
git commit -m "Wire MCP toolsets into agent session startup."
```

---

### Task 4: Token API — validate MCP and set attributes

**Files:**
- Create: `web/lib/mcp-connectors.ts`
- Modify: `web/app/api/token/route.ts`

- [ ] **Step 1: Shared TS helpers**

Create `web/lib/mcp-connectors.ts`:

```typescript
export const MCP_STORAGE_KEY = 'echo.mcp_servers';
export const MCP_ATTR_KEY = 'echo_mcp_servers';
export const MAX_USER_MCP_SERVERS = 10;
export const MAX_MCP_PAYLOAD_BYTES = 8_000;

export type McpServerConfig = {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  headers?: Record<string, string>;
};

export function sanitizeMcpServers(input: unknown): McpServerConfig[] {
  if (!Array.isArray(input)) {
    throw new Error('mcp_servers must be an array');
  }
  if (input.length > MAX_USER_MCP_SERVERS) {
    throw new Error(`At most ${MAX_USER_MCP_SERVERS} MCP servers allowed`);
  }
  const servers: McpServerConfig[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') throw new Error('invalid MCP server entry');
    const row = item as Record<string, unknown>;
    const id = String(row.id ?? '').trim();
    const name = String(row.name ?? id).trim();
    const url = String(row.url ?? '').trim();
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw new Error(`invalid id: ${id}`);
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`invalid url: ${url}`);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('url must be http(s)');
    }
    const enabled = row.enabled !== false;
    const headers: Record<string, string> = {};
    if (row.headers && typeof row.headers === 'object') {
      for (const [k, v] of Object.entries(row.headers as Record<string, unknown>)) {
        if (typeof k === 'string' && typeof v === 'string') headers[k] = v;
      }
    }
    servers.push({ id, name, url, enabled, headers });
  }
  const enabledOnly = servers.filter((s) => s.enabled);
  const payload = JSON.stringify(enabledOnly);
  if (new TextEncoder().encode(payload).length > MAX_MCP_PAYLOAD_BYTES) {
    throw new Error('MCP payload too large');
  }
  return servers;
}

export function loadMcpServersFromStorage(): McpServerConfig[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(MCP_STORAGE_KEY);
    if (!raw) return [];
    return sanitizeMcpServers(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveMcpServersToStorage(servers: McpServerConfig[]): void {
  window.localStorage.setItem(MCP_STORAGE_KEY, JSON.stringify(servers));
}
```

- [ ] **Step 2: Update token route**

In `web/app/api/token/route.ts`:

1. Import `MCP_ATTR_KEY`, `sanitizeMcpServers` from `@/lib/mcp-connectors`.
2. Parse `body.mcp_servers` alongside `room_config`.
3. On validation error, return `400` with message.
4. Pass attributes into `createParticipantToken`:

```typescript
const enabled = sanitizeMcpServers(body.mcp_servers ?? []).filter((s) => s.enabled);
const attributes =
  enabled.length > 0
    ? { [MCP_ATTR_KEY]: JSON.stringify(enabled) }
    : undefined;

const participantToken = await createParticipantToken(
  { identity: participantIdentity, name: participantName, attributes },
  roomName,
  roomConfig
);
```

Confirm `AccessTokenOptions` accepts `attributes` (livekit-server-sdk). If the constructor uses a different field, set via `at.attributes = ...` after construction.

- [ ] **Step 3: Commit**

```bash
git add web/lib/mcp-connectors.ts web/app/api/token/route.ts
git commit -m "Pass user MCP connectors via participant token attributes."
```

---

### Task 5: Frontend Connectors UI + token source

**Files:**
- Create: `web/components/app/mcp-connectors-panel.tsx`
- Modify: `web/components/app/app.tsx`
- Modify: `web/components/app/settings-panel.tsx`
- Modify: `web/components/app/welcome-view.tsx` (entry link only; branding in Task 7)

- [ ] **Step 1: Build `McpConnectorsPanel`**

Client component with:

- List of connectors (name, url truncated, enabled checkbox, delete).
- Form: name, url, optional Authorization bearer value (stored as `headers.Authorization`).
- Load/save via `loadMcpServersFromStorage` / `saveMcpServersToStorage`.
- Warning text: “Credentials stay in this browser for personal use only.”
- Empty state: “Admin defaults still apply if configured on the agent.”

Generate `id` with `crypto.randomUUID().slice(0, 8)` or `mcp_${Date.now()}`.

- [ ] **Step 2: Settings panel integration**

In `settings-panel.tsx`, add a section or nested open state that renders `<McpConnectorsPanel />` below the admin link (or a “MCP Connectors” toggle).

- [ ] **Step 3: Custom TokenSource in `app.tsx`**

Replace `TokenSource.endpoint('/api/token')` default with:

```typescript
import { loadMcpServersFromStorage } from '@/lib/mcp-connectors';

function createEchoTokenSource(appConfig: AppConfig) {
  return TokenSource.custom(async () => {
    const roomConfig = appConfig.agentName
      ? { agents: [{ agent_name: appConfig.agentName }] }
      : undefined;
    const mcp_servers = loadMcpServersFromStorage();
    const res = await fetch('/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room_config: roomConfig, mcp_servers }),
    });
    if (!res.ok) {
      throw new Error(await res.text());
    }
    return await res.json();
  });
}
```

Keep sandbox path unchanged (sandbox may ignore MCP; acceptable for phase 1).

- [ ] **Step 4: Manual UI check**

Run `pnpm --dir web dev`, open Settings → MCP Connectors, add a fake `https://example.com/sse`, refresh, confirm it persists.

- [ ] **Step 5: Commit**

```bash
git add web/components/app/mcp-connectors-panel.tsx web/components/app/app.tsx web/components/app/settings-panel.tsx
git commit -m "Add MCP connectors settings UI and token wiring."
```

---

### Task 6: Admin panel — MCP defaults docs (+ local file optional)

**Files:**
- Modify: `web/app/admin/page.tsx`
- Modify: `web/app/api/admin/config/route.ts` (and `web/lib/agent-config.ts` if used)
- Optionally write: `agent/data/mcp_servers.json` via existing writable path pattern

- [ ] **Step 1: Admin UI section**

After Tavily block, add **MCP defaults**:

- Explain production: set LiveKit agent secret `MCP_SERVERS` to a JSON array.
- Show example JSON in a `<pre>`.
- Show CLI hint: `lk agent update-secrets --secrets MCP_SERVERS='[...]'` (or secrets-file).
- If `storage.writable`, show textarea + Save that writes `mcp` key or separate `mcp_servers.json` — follow existing Tavily file pattern in `agent-config.ts`. Prefer writing `agent/data/mcp_servers.json` as a JSON array (matches agent loader). On Vercel readonly, show same “use LiveKit secrets” message as Tavily.

- [ ] **Step 2: Extend admin config API only if local write is implemented**

If implementing local save:

- GET returns `{ mcp: { configured: boolean, count: number }, storage: ... }` without leaking headers/secrets.
- POST body `{ mcp_servers: McpServerConfig[] }` validates with shared rules (duplicate `sanitize` logic server-side or import from `mcp-connectors.ts`).

- [ ] **Step 3: Commit**

```bash
git add web/app/admin/page.tsx web/app/api/admin/config/route.ts web/lib/agent-config.ts
git commit -m "Document admin MCP defaults in the admin panel."
```

---

### Task 7: Remove LiveKit product branding

**Files:**
- Create: `web/public/echo-logo.svg`, `web/public/echo-logo-dark.svg`
- Modify: `web/app-config.ts`
- Modify: `web/app/layout.tsx`
- Modify: `web/components/app/welcome-view.tsx`
- Modify: `web/app/opengraph-image.tsx`

- [ ] **Step 1: Add Echo SVG marks**

Simple geometric “E” / waveform mark in teal (`#0d9488` / `#2dd4bf`), 64×64 viewBox. Light and dark variants.

- [ ] **Step 2: `app-config.ts`**

```typescript
pageDescription: 'Talk to your personal voice assistant',
logo: '/echo-logo.svg',
logoDark: '/echo-logo-dark.svg',
```

- [ ] **Step 3: `layout.tsx`**

- Header logo links to `/` (not livekit.io).
- Replace “Built with LiveKit Agents” span with `Echo` text or remove entirely.

- [ ] **Step 4: `welcome-view.tsx`**

- Remove bottom “Built with LiveKit Agents” block.
- Tip line: either remove or change to “Make sure the Echo agent is running before connecting.” (no LiveKit brand).

- [ ] **Step 5: `opengraph-image.tsx`**

Replace `lk-logo` / `lk-wordmark` references with Echo logo paths.

- [ ] **Step 6: Visual check**

```bash
pnpm --dir web exec tsc --noEmit
```

Expected: no type errors. Hard-refresh UI: no LiveKit logo or “Built with LiveKit” in header/welcome.

- [ ] **Step 7: Commit**

```bash
git add web/public/echo-logo.svg web/public/echo-logo-dark.svg web/app-config.ts web/app/layout.tsx web/components/app/welcome-view.tsx web/app/opengraph-image.tsx
git commit -m "Replace LiveKit product branding with Echo."
```

---

### Task 8: Integration smoke + deploy notes

**Files:** none required (or short README note if already documenting secrets)

- [ ] **Step 1: Agent unit tests**

```bash
cd agent
uv run pytest tests/test_mcp_config.py -v
```

Expected: PASS.

- [ ] **Step 2: Web typecheck**

```bash
pnpm --dir web exec tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 3: Manual session (local if possible)**

1. No MCP → call starts; notes/time still work.
2. User connector in Settings → start call → agent logs `MCP servers: admin=0 user=1 toolsets=1` (or 0 if URL dead — session must still join).
3. Confirm branding gone.

- [ ] **Step 4: Deploy agent when ready**

```bash
cd agent
lk agent deploy --yes
```

Set secret if using admin defaults:

```bash
lk agent update-secrets --secrets MCP_SERVERS='[{"id":"demo","name":"Demo","url":"https://...","enabled":true}]'
```

Web: push/Vercel deploy for frontend changes.

- [ ] **Step 5: Final commit only if leftover docs**

```bash
git status
# commit any leftover intentional files; do not commit .env.local
```

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| `livekit-agents[mcp]` | Task 1 |
| `mcp_config.py` parse/merge/toolsets | Task 2 |
| Agent connect → merge → session tools | Task 3 |
| Instructions MCP blurb + `.env.example` | Task 3 |
| Token attributes `echo_mcp_servers` | Task 4 |
| localStorage Connectors UI | Task 5 |
| Custom TokenSource POST | Task 5 |
| Admin MCP defaults section | Task 6 |
| Branding removal | Task 7 |
| Error handling / smoke | Tasks 2, 4, 8 |

## Self-review notes

- No TBD placeholders; preferred JWT-attribute path only (no post-join attribute updates).
- Types aligned: `McpServerConfig` fields match between Python and TS.
- Deprecated `AgentSession(mcp_servers=...)` avoided; use `MCPToolset` via `tools=`.
- `uv add` may have already dirtied `pyproject.toml`/`uv.lock` — Task 1 commits that.

# Admin Panel + Tavily Web Search — Design

## Goal

Add an admin panel to the web UI so an operator can configure API keys (starting with Tavily) through the browser, and add a Tavily web-search tool to the voice agent so Echo can answer questions using current web information.

## Context

- Monorepo: Python LiveKit agent (`agent/`) + Next.js web UI (`web/`).
- Current stance: API keys live only in `agent/.env.local`, never in the browser. The existing `SettingsPanel` is display-only.
- In production the agent runs on LiveKit Cloud and the web on Vercel (no shared filesystem). The config-file write path targets local dev / single-server use; production uses agent secrets via env-var fallback.

## Decisions

- **Storage:** shared JSON config file (`agent/data/api_config.json`). The agent reads env var first, then falls back to the config file.
- **Access control:** simple password gate using `ADMIN_PASSWORD` env var, session held in a signed cookie (via existing `jose` dependency).
- **Panel location:** dedicated `/admin` route, keeping the display-only `SettingsPanel` untouched.

## Architecture

### 1. Config file format (`agent/data/api_config.json`)

Extensible schema — each API is a top-level key:

```json
{
  "tavily": { "api_key": "tvly-...", "enabled": true }
}
```

- Missing file = no APIs configured.
- Agent reads this at startup; `TAVILY_API_KEY` env var takes precedence over the file value, so production deployments using LiveKit agent secrets keep working without the panel.

### 2. Admin panel (web)

- New route `web/app/admin/page.tsx`: form-based UI to view (masked) and set API keys, with a per-API enable toggle. Starts with Tavily; schema is extensible so future APIs are a config entry + agent tool.
- Password gate: login form checks `ADMIN_PASSWORD`. On success, a signed JWT cookie is set (short TTL) so the operator isn't re-prompted on every action.
- API routes under `web/app/api/admin/`:
  - `POST /api/admin/login` — verifies password, sets signed cookie.
  - `GET /api/admin/config` — returns masked key status (set/not-set) + enabled flags. Never returns raw keys.
  - `POST /api/admin/config` — validates and writes updates to the config file.
- Config file path resolved via `AGENT_CONFIG_PATH` env var, defaulting to `../agent/data/api_config.json` relative to the web root (works in the monorepo).

### 3. Tavily web-search tool (agent)

- New `agent/src/tools/web_search.py` with a `web_search(query)` function tool that calls Tavily `POST /search` via `httpx.AsyncClient`, returning a concise summary of top results (titles + snippets) for the LLM to speak.
- Key resolution: `os.getenv("TAVILY_API_KEY")` → config file `tavily.api_key`. If neither exists, the tool returns a friendly "web search unavailable" message instead of erroring.
- Registered in `assistant.py` only when a key is available. The system prompt gains a line telling Echo it can search the web for current info.

## Scope

- **In scope:** Tavily search tool; admin panel to set the Tavily key (extensible schema); password gate; env-var fallback for production.
- **Out of scope (YAGNI):** multi-user auth, database/KV store, encrypting keys at rest, runtime hot-reload of keys without agent restart.

## Error handling

- Tavily HTTP failure or timeout: tool returns a short "I couldn't reach the web right now" message; never throws to the session.
- Missing key at tool-call time: returns "web search isn't configured" message.
- Admin write of malformed JSON / missing fields: API route returns 400 with a clear message, does not overwrite the file.

## Files touched

**Agent (Python):**
- `agent/src/tools/web_search.py` (new) — Tavily tool.
- `agent/src/tools/__init__.py` — export `web_search`.
- `agent/src/assistant.py` — conditionally register `web_search`; update prompt.
- `agent/.env.example` — document `TAVILY_API_KEY`.
- `agent/pyproject.toml` — add `httpx` dependency (explicit).

**Web (Next.js):**
- `web/app/admin/page.tsx` (new) — admin UI + login gate.
- `web/app/api/admin/login/route.ts` (new).
- `web/app/api/admin/config/route.ts` (new) — GET (masked) + POST (write).
- `web/lib/admin-auth.ts` (new) — password check + signed cookie helpers.
- `web/lib/agent-config.ts` (new) — config file read/write + path resolution.
- `web/.env.example` — document `ADMIN_PASSWORD`, `AGENT_CONFIG_PATH`.

## Production note

On Vercel the filesystem is read-only, so the file-write path is for local dev / single-server. For LiveKit Cloud production, set `TAVILY_API_KEY` in agent secrets — the tool reads env first, so no panel is needed there.

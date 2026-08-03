# Deployment Guide

Deploy Echo has two parts: the **voice agent** (deployed to LiveKit Cloud) and the **web UI** (deployed to Vercel).
The admin panel's file-write feature only works locally/single-server — on Vercel it will be read-only.
For production on Vercel + LiveKit Cloud, set secrets via env vars instead of the admin panel (below).

---

## 1. Deploy the Voice Agent → LiveKit Cloud

You need a [LiveKit Cloud](https://cloud.livekit.io) account (free tier is fine).

### Step 1: Login with LiveKit CLI

The `lk` CLI is already installed. Login or create a new project:

```bash
# Browser-based login (run once)
lk auth login
```

Or set credentials directly:

```bash
export LIVEKIT_URL=wss://your-project.livekit.cloud
export LIVEKIT_API_KEY=AP...
export LIVEKIT_API_SECRET=
```

### Step 2: Set Tavily key (optional, for web search)

The agent reads `TAVILY_API_KEY` from **agent secrets** — the env-var takes
precedence over the config file, so the admin panel is not required in production.

```bash
# In the agent/ directory
cd agent

# Set Tavily key (get one from https://tavily.com)
lk secret set TAVILY_API_KEY=tvly-xxxxxxxxxxxxxxxx

# Optional: BYOK model keys
lk secret set MODEL_MODE=byok
lk secret set OPENAI_API_KEY=sk-...
lk secret set DEEPGRAM_API_KEY=...
lk secret set CARTESIA_API_KEY=...
```

### Step 3: Deploy

```bash
cd agent
lk agent deploy
```

This builds the Docker image and pushes it to LiveKit Cloud. The agent will
auto-connect and wait for jobs.

### Step 4: Test in Console

```bash
lk agent console --agent-name echo-agent
```

Or open the web console at:
<https://cloud.livekit.io/projects/p_/agents/console>

---

## 2. Deploy the Web UI → Vercel

You need a [Vercel](https://vercel.com) account (free tier is fine).

The `vercel` CLI is already installed globally.

### Step 1: Login to Vercel

```bash
cd web
vercel login
```

### Step 2: Set env vars before deploying

On Vercel, the filesystem is **read-only**, so the admin panel cannot write
config files. You have two options:

- **Option A (Recommended):** Don't use the admin panel in prod. Set the Tavily
  key as a LiveKit agent secret (Step 1.2 above) and skip the admin UI env vars.
  The admin panel page will still render but saves won't persist.

- **Option B:** Swap the JSON-file storage for Vercel KV or a database (future work).

Deploy with:

```bash
cd web

# Link project (first time only)
vercel link

# Set required env vars for /api/token
vercel env add LIVEKIT_URL             # wss://your-project.livekit.cloud
vercel env add LIVEKIT_API_KEY         # AP...
vercel env add LIVEKIT_API_SECRET
vercel env add AGENT_NAME echo-agent
vercel env add ALLOW_PUBLIC_TOKEN true # needed for personal use (not public multi-user)
vercel env add NEXT_PUBLIC_MODEL_MODE inference

# Optional admin panel vars
vercel env add ADMIN_PASSWORD 'change-me'    # password for /admin
vercel env add AGENT_CONFIG_PATH ''          # leave blank on Vercel — writes won't persist

# --- Knowledge Base / RAG on Vercel ---
# Vercel serverless functions have an **ephemeral, read-only filesystem** after deploy.
# node:sqlite CAN read from a filesystem path (bundled or /tmp), but writes would not
# persist and the agent's data dir is not co-located with the Next.js bundle anyway.
# Two paths:
#
#   A) (Recommended for production) Expose the agent's HTTP API on the internet and point
#      the web UI at it. The agent runs on LiveKit Cloud OR a VPS with writable disk.
#      Set:
vercel env add AGENT_HISTORY_ENDPOINT https://agent-api.example.com
vercel env add AGENT_KB_ENDPOINT      https://agent-api.example.com
#      These endpoints must serve /history/sessions* and /kb/* respectively.
#
#   B) (Read-only historical playback) Set AGENT_DATA_DIR to a path within the
#      Next.js bundle and commit a seed of echo.sqlite3. This is a demo-only path
#      and any user uploads or new chat history won't be saved.

# i18n default locale for first-time visitors (en | zh)
vercel env add NEXT_PUBLIC_DEFAULT_LOCALE zh

# Deploy to production
vercel --prod
```

Vercel will print a URL like `https://echo-web-xxxx.vercel.app`. Open it and try the voice chat!

---

## 3. Knowledge Base / RAG deployment notes

### 3.1 RAG pre-cache

The agent `Dockerfile` runs `src/rag/_docker_precache.py` after `uv sync`. This downloads
`BAAI/bge-m3` (~1.2 GB in HuggingFace cache) and warms it up with a small encode so the
first user's `rag_search` call doesn't sit through a ~60s cold-start model download.

If you deploy without RAG deps (stripped `pyproject.toml`), the pre-cache step exits 0 — it's
graceful.

### 3.2 Two tiers of storage

| Tier | Where it runs | Persistent? | Path |
| --- | --- | --- | --- |
| SQL metadata + JSON configs | agent/data on the agent host (LiveKit Cloud disk / volume) | ✅ yes | `/app/data/echo.sqlite3` and friends |
| Chroma vectors + rag uploads | alongside the agent | ✅ yes | `/app/data/rag/chroma`, `/app/data/rag/uploads` |
| ML model weights | on the agent image (built-in) | ✅ yes (layer cache) | `/app/.cache/huggingface` |
| Web's local fallback reads | only in docker-compose or on your laptop (shared volume) | ⚠️ yes if volume mounted | same `AGENT_DATA_DIR` via shared volume |

### 3.3 Upgrading / wiping RAG state

```bash
# Inside the agent container or agent host:
rm -rf data/rag/chroma   # delete all embeddings (rebuild on next ingest)
# And optionally zero out chunk counts so the KB page reflects 0 chunks:
uv run python -c "
from db import init_db, DatabaseSession, KnowledgeDoc
init_db()
with DatabaseSession() as s:
    for d in s.query(KnowledgeDoc).all():
        d.chunk_count = 0
    s.commit()
"
```

---

## 4. One-command self-host (docker-compose)

For a VPS or laptop: both containers + persistent volume in one command.

```bash
# 1) copy env template to .env in repo root
cp .env.example .env
$EDITOR .env      # fill LIVEKIT_URL/LIVEKIT_API_KEY/LIVEKIT_API_SECRET at minimum

# 2) build + start (detached)
docker compose up -d --build

# 3) open http://localhost:3000 (or $WEB_PORT if overridden)

# 4) tail logs
docker compose logs -f agent web
```

The `echo_data` named volume holds `echo.sqlite3`, `api_config.json`, `mcp_servers.json`,
`profile.json`, Chroma vectors (`rag/chroma/`), and uploaded PDFs (`rag/uploads/`). It's
shared between the `agent` and `web` containers so `/api/history/sessions` and
`/api/knowledge-base/*` can read it directly via `node:sqlite` without a separate HTTP
micro-service.

The `echo_hf_cache` and `echo_torch_cache` volumes keep the bge-m3 model between rebuilds.

---

## 5. Local Quick-Test (skip cloud)

You already have this running on `http://localhost:3000`. To enable the voice
agent locally without cloud credentials:

```bash
# Terminal 1: agent
cd agent
# First set LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET in .env.local
# Optionally set TAVILY_API_KEY there too
uv run src/agent.py dev

# Terminal 2: web (already running)
cd web && pnpm run dev
```

Then open <http://localhost:3000/admin> to set the Tavily key via the UI.

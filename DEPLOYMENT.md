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

# Deploy to production
vercel --prod
```

Vercel will print a URL like `https://echo-web-xxxx.vercel.app`. Open it and try the voice chat!

---

## 3. Local Quick-Test (skip cloud)

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

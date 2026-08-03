# Echo Intern Portfolio Enhancement — Design Spec

**Date**: 2026-08-03
**Status**: Draft (awaiting user review)
**Target**: ~30 hours, ¥0 cost, intern-level portfolio for Shenzhen job market

## 1. Goals

### Primary
Transform the existing Echo (LiveKit voice assistant template) into a differentiated AI agent portfolio project that stands out in Shenzhen intern interviews.

### Success criteria
- ✅ Working live demo the interviewer can click and speak to (in Chinese)
- ✅ 6 features that clearly go beyond the starter template
- ✅ Clean README with architecture diagram + screenshots + "what I learned"
- ✅ Technical storytelling ready for STAR-format interview answers
- ✅ Total cost: ¥0 (use free tiers exclusively)

### Explicitly out of scope (not needed for intern bar)
- 微信登录 / 企业认证
- Docker Compose / rate limiting / metrics dashboards
- Multi-step ReAct planning
- 阿里云 self-host deployment
- Virtual avatar / 数字人
- Playwright e2e test suite
- Multi-turn conversation memory beyond chat history persistence

## 2. Target working copy

Create `/workspace/echo-intern-portfolio/` as a file-level copy of `/workspace/`, preserving all original files. The original `/workspace/` remains untouched as a "before" reference. No git clone — plain filesystem copy.

## 3. Feature inventory (6 features, ~30h total)

| # | Feature | Hours | Tier | Diff signal |
|---|---------|-------|------|-------------|
| 3.1 | Bilingual EN/中文 UI + toggle | 5 | P0 | i18n engineering awareness + Chinese market fit |
| 3.2 | SQLite migration + chat history | 6 | P0 | Backend maturity, DB design, new user-facing feature |
| 3.3 | RAG knowledge base (PDF upload → ask) | 8 | P0 | AI intern signal #1 (RAG is the most common interview task) |
| 3.4 | Chinese voice (hybrid mode: OpenRouter LLM + Cartesia TTS) | 3 | P0 | Multimodal + 国内生态 aware |
| 3.5 | Custom landing page | 7 | P0 | First impression, product thinking |
| 3.6 | Mobile responsive + PWA | 3 | P0 | Mobile-first, modern frontend awareness |
| **Total** | | **~32** | | |

## 4. Architecture

### 4.1 Layout

```
echo-intern-portfolio/
├── agent/
│   ├── src/
│   │   ├── agent.py              # entrypoint — wire new tools + chat-history hooks
│   │   ├── assistant.py          # + language section in system prompt
│   │   ├── config.py             # + MODEL_MODE=hybrid branch
│   │   ├── db.py                 # NEW: sqlmodel engine + init
│   │   ├── models.py             # NEW: Note, ChatSession, ChatMessage, KnowledgeDoc
│   │   ├── rag/                  # NEW
│   │   │   ├── __init__.py
│   │   │   ├── embeddings.py     # sentence-transformers BAAI/bge-m3
│   │   │   ├── store.py          # Chroma wrapper
│   │   │   └── ingest.py         # PDF → chunks → embeddings → vector store
│   │   ├── tools/
│   │   │   ├── notes.py          # REWRITE for SQLite + auto-migrate old notes.json
│   │   │   ├── rag_search.py     # NEW: agent tool for retrieval
│   │   │   ├── time_utils.py
│   │   │   └── web_search.py
│   │   └── mcp_config.py
│   └── data/
│       ├── echo.db               # NEW: SQLite (gitignore)
│       ├── chroma/               # NEW: Chroma persistence (gitignore)
│       ├── uploads/              # NEW: uploaded PDFs (gitignore)
│       ├── api_config.json
│       ├── mcp_servers.json
│       ├── notes.json            # read once, auto-migrated to DB
│       └── profile.json
├── web/
│   ├── app/
│   │   ├── page.tsx              # REWRITE: custom landing
│   │   ├── (app)/
│   │   │   ├── layout.tsx        # NEW: (app) route group layout (same shell, no landing nav)
│   │   │   └── conversation/
│   │   │       └── page.tsx      # MOVED voice UI here (was app/page.tsx)
│   │   ├── knowledge-base/
│   │   │   └── page.tsx          # NEW: upload + list + delete docs
│   │   ├── history/
│   │   │   └── page.tsx          # NEW: list sessions + view transcript
│   │   ├── admin/
│   │   │   └── page.tsx          # unchanged
│   │   ├── layout.tsx            # + PWA meta + manifest link
│   │   ├── manifest.ts           # NEW: PWA manifest (Next.js 15 App Router convention)
│   │   └── api/
│   │       ├── token/route.ts
│   │       ├── admin/
│   │       ├── knowledge/        # NEW
│   │       │   ├── upload/route.ts    # multipart form → save to agent/data/uploads
│   │       │   ├── ingest/route.ts    # trigger agent-side PDF ingestion
│   │       │   ├── list/route.ts      # return list of ingested docs from SQLite
│   │       │   └── delete/route.ts    # delete doc + remove from Chroma + SQLite
│   │       └── history/          # NEW
│   │           ├── route.ts            # GET → list ChatSessions
│   │           └── [id]/route.ts       # GET → ChatMessages for one session
│   ├── components/
│   │   ├── landing/              # NEW: hero, features, tech-stack, demo-gif, footer
│   │   ├── app/
│   │   │   ├── app.tsx           # wire i18n provider + session
│   │   │   ├── lang-toggle.tsx   # NEW: globe icon + EN/中文 dropdown
│   │   │   ├── view-controller.tsx
│   │   │   ├── welcome-view.tsx
│   │   │   ├── settings-panel.tsx   # + model-mode picker + language hint
│   │   │   ├── theme-provider.tsx
│   │   │   ├── theme-toggle.tsx
│   │   │   └── mcp-connectors-panel.tsx
│   │   ├── agents-ui/            # unchanged
│   │   └── ui/                   # unchanged
│   ├── lib/
│   │   ├── i18n/                 # NEW
│   │   │   ├── config.ts              # next-intl config: en, zh-CN
│   │   │   ├── get-locale.ts          # detect + persist from localStorage
│   │   │   └── messages/
│   │   │       ├── en.json
│   │   │       └── zh.json
│   │   ├── shadcn/utils.ts
│   │   ├── admin-auth.ts
│   │   ├── agent-config.ts
│   │   ├── mcp-connectors.ts
│   │   └── utils.ts
│   ├── hooks/
│   │   ├── use-online-status.ts  # NEW: offline banner
│   │   └── agents-ui/            # unchanged
│   ├── public/
│   │   ├── icons/                # NEW: PWA icons 192 + 512 PNG
│   │   ├── demo.gif              # NEW: short demo GIF (added later, not during coding)
│   │   ├── echo-logo.svg
│   │   └── ... (rest unchanged)
│   ├── middleware.ts             # NEW: next-intl routing middleware
│   └── ... (configs unchanged)
```

### 4.2 Key architectural principles

1. **Isolation**: Each new feature lives in its own folder. Existing files receive only minimal config edits.
2. **No deletions**: Nothing from the original project is deleted. `web/app/page.tsx` is REWRITTEN in place (since it becomes landing); the voice UI moves to `(app)/conversation/page.tsx`. The old notes.json is auto-migrated, not deleted.
3. **Single-writer**: Only the agent process writes to SQLite + Chroma. The web UI reads via API routes that call into the agent's data layer (or vice-versa — see 4.3).
4. **Fail-open**: If SQLite or Chroma fails to initialize, the agent still works (degraded mode). Voice conversation never breaks because of storage issues.

### 4.3 Cross-process data access

The web UI (Next.js / Vercel) and agent (Python / LiveKit Cloud) are separate processes. Storage strategy:

| Data | Owner | Web access | Fallback |
|------|-------|------------|----------|
| Notes | Agent (SQLite) | Web API route calls agent? NO — too complex. **Alternative**: Share SQLite via the filesystem (same repo, local dev only). On Vercel, notes/history/KM are disabled with a graceful banner. | Vercel shows "本地部署可使用笔记和历史" banner |
| Chat history | Agent (SQLite) | Same as notes | Same |
| Knowledge docs | Agent (SQLite + Chroma) | Same; uploads saved to shared `agent/data/uploads/` | Same |

**Production note for portfolio**: This is the intern-minimal shortcut. In a real app you'd use a real DB server. Interviewers will ask about this — we prepare a "how I'd scale" answer (Postgres + separate service layer). Don't hide the shortcut; demonstrate you know what's missing.

## 5. Feature: 3.1 Bilingual UI + Prompt

### Scope
- Library: `next-intl` v5 (App Router)
- Locales: `en`, `zh-CN` (path-based routing: `/en/...`, `/zh/...`)
- Default: Detect browser `Accept-Language` via middleware; if zh-SG, zh-HK, zh-TW → map to `zh`
- Persistence: `localStorage['echo.locale']` overrides auto-detect
- Toggle: `LangToggle` component in the app shell header (globe icon, dropdown EN / 中文)

### String extraction scope
ALL user-facing text, including:
- Landing page (hero, features, footer, CTA)
- Conversation (welcome text, mic button labels, disconnect button, settings header, transcript placeholders)
- Knowledge base (upload area, doc list headers, delete confirmation)
- History page (list headers, "no sessions" empty state, transcript loading states)
- Settings panel labels + model-mode picker
- Admin panel login + settings
- Error messages from API routes

### Agent prompt updates
Add a `# Language` block in [assistant.py](file:///workspace/echo-intern-portfolio/agent/src/assistant.py#L23-L58) DEFAULT_INSTRUCTIONS:

```
# Language
- Speak and reply in the SAME LANGUAGE the user uses.
- If the user switches languages, switch with them in the next turn.
- If the user's language is ambiguous (short message), use the previous turn's language.
- For Mandarin Chinese, use conversational, natural-sounding 普通话 — no formal written styles.
- Numbers, times, and currency should sound natural when spoken in the target language.
```

### Files changed
- `web/middleware.ts` NEW
- `web/lib/i18n/*` NEW
- `web/components/app/lang-toggle.tsx` NEW
- `web/app/layout.tsx` — wrap in NextIntlClientProvider
- All existing `components/**/*.tsx` — extract strings to `useTranslations()`
- `agent/src/assistant.py` — add language section

## 6. Feature: 3.2 SQLite Migration + Chat History

### Schema (`agent/src/models.py`)

```python
from sqlmodel import SQLModel, Field, Relationship
from datetime import datetime
from typing import Optional, List

class Note(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    content: str = Field(index=False, max_length=5000)
    created_at: datetime = Field(default_factory=datetime.utcnow)

class ChatSession(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    room_name: str = Field(index=True)
    participant_identity: str = Field(index=True)
    started_at: datetime = Field(default_factory=datetime.utcnow)
    ended_at: Optional[datetime] = None
    messages: List["ChatMessage"] = Relationship(back_populates="session")

class ChatMessage(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: Optional[int] = Field(default=None, foreign_key="chatsession.id")
    role: str = Field()  # "user" | "assistant" | "system" | "tool"
    content: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    session: Optional[ChatSession] = Relationship(back_populates="messages")

class KnowledgeDoc(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    filename: str
    file_path: str
    chunk_count: int = Field(default=0)
    ingested: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)
```

### DB bootstrap (`agent/src/db.py`)
```python
# create_engine for sqlite:///data/echo.db
# SQLModel.metadata.create_all(engine) on import
# SessionLocal generator
# Graceful fallback: if DB can't be opened, log warning and set _DB_DISABLED=True
```

### Notes migration logic
- On agent startup: check if `data/notes.json` exists AND `Note` table is empty
- If so, parse JSON, insert all notes as Note rows, log "Migrated N notes from JSON"
- Do NOT delete notes.json; leave as backup

### Notes tool rewrite (`agent/src/tools/notes.py`)
- `save_note(content: str)` → INSERT into Note, return "Saved: ..."
- `list_notes()` → SELECT * FROM Note ORDER BY created_at DESC, format as bullet list
- If DB disabled, return memory-only temp storage (dict on module) with a "temporary" suffix warning

### Chat history persistence hooks
In `agent.py`, after `session.start(...)`:
- On agent startup (enter), create ChatSession row (room_name from ctx.room.name, participant_identity = first human participant)
- Listen to `session.on("response_changed")` or a similar LiveKit Agents event — or intercept inside PersonalAssistant by wrapping the response stream
- For each completed user message and completed assistant response, INSERT into ChatMessage
- On room disconnect / agent exit, set ChatSession.ended_at = now

### Web API + UI
- `GET /api/history` → JSON array of ChatSession summaries (id, started_at, ended_at, message_count, participant)
- `GET /api/history/[id]` → JSON array of ChatMessages (role, content, created_at)
- `/history` page: Session list on left (scrollable), transcript panel on right. Click session → load messages.
- Empty state: "还没有历史对话，开始你的第一次对话吧！" / "No conversations yet."

### Files
- `agent/src/models.py` NEW
- `agent/src/db.py` NEW
- `agent/src/tools/notes.py` REWRITE
- `agent/src/agent.py` — wire chat history hooks
- `web/app/api/history/**` NEW
- `web/app/history/**` NEW

## 7. Feature: 3.3 RAG Knowledge Base

### Components

**Embeddings** (`agent/src/rag/embeddings.py`)
- Model: `BAAI/bge-m3` via sentence-transformers
- Runs on CPU (no GPU required); dims: 1024
- Cache: `~/.cache/torch/sentence_transformers/` (auto)
- Lazy load: model loaded on first call, not at startup

**Vector store** (`agent/src/rag/store.py`)
- Chroma `PersistentClient` with `agent/data/chroma/` as persist dir
- Collection name: `echo-knowledge`
- Metadata per chunk: `doc_id`, `chunk_index`, `filename`, `page`
- `search(query: str, top_k: int = 3) -> list[ChunkWithMetadata]`
- `delete_doc(doc_id: int)` → delete all vectors where metadata doc_id matches

**Ingestion** (`agent/src/rag/ingest.py`)
```python
ingest_pdf(doc_id: int, file_path: str, filename: str) -> int
  1. pypdf reads PDF text per page
  2. Chunk by 500 chars with 50-char overlap (character-based, not token — faster, acceptable for intern demo)
  3. For each chunk, embed + add to Chroma with metadata
  4. Update KnowledgeDoc.ingested=True, chunk_count=N
  5. Return chunk_count
```

**Agent tool** (`agent/src/tools/rag_search.py`)
```python
@function_tool
async def rag_search(context: RunContext, query: str) -> str:
    1. Call store.search(query, top_k=3)
    2. Format as: "Source: <filename>\n<chunk text>\n---\n..." (3 chunks max)
    3. If 0 chunks: "我还没有上传的文档可以回答这个问题。你可以在知识库页面上传PDF文件。"
```

**System prompt addition**
```
# Knowledge base
- Use rag_search when the user asks about topics related to uploaded documents.
- Only answer based on the retrieved chunks. If the answer isn't in the chunks, say so.
- Mention the source filename when you quote specific facts.
```

### Web API + UI
- `POST /api/knowledge/upload` — multipart form: file → save to `agent/data/uploads/{uuid}_{original_name}`, create KnowledgeDoc row (ingested=False, chunk_count=0), return doc_id
- `POST /api/knowledge/ingest` — body `{doc_id: int}` → call `ingest_pdf(doc_id, ...)` → return `{chunk_count}`
- `GET /api/knowledge/list` → all KnowledgeDoc rows (id, filename, chunk_count, ingested, created_at)
- `DELETE /api/knowledge/delete` → body `{doc_id: int}` → delete from Chroma by doc_id, delete KnowledgeDoc row, delete upload file
- `/knowledge-base` page:
  - Top: drag-drop upload zone (single PDF at a time, max 10MB) — show progress bar
  - Below: table / card list of docs (filename, chunks, ingested status, "ingest" button if pending, "delete" button)
  - Hint text: "上传PDF后点击「处理」，然后在对话中询问文档相关的问题"

### Files
- `agent/src/rag/embeddings.py` NEW
- `agent/src/rag/store.py` NEW
- `agent/src/rag/ingest.py` NEW
- `agent/src/tools/rag_search.py` NEW
- `agent/src/agent.py` — add rag_search to tools list
- `agent/src/assistant.py` — add KB section to prompt
- `web/app/api/knowledge/**` NEW
- `web/app/knowledge-base/**` NEW
- `agent/pyproject.toml` — add chromadb, sentence-transformers, pypdf

## 8. Feature: 3.4 Chinese Voice (Hybrid Mode)

### MODEL_MODE=hybrid
Add a new `hybrid` branch in `config.py`, positioned after `openrouter`:

```python
if mode == "hybrid":
    # STT via Inference (deepgram multi-lang — handles Chinese)
    # LLM via OpenRouter (user picks Chinese model like qwen/qwen-2.5-72b-instruct)
    # TTS via Cartesia (excellent Chinese voices, free tier)
    return AgentSession(
        stt=inference.STT(model="deepgram/nova-3", language="multi"),
        llm=openai.LLM.with_openrouter(
            model=os.getenv("OPENROUTER_MODEL", "qwen/qwen-2.5-72b-instruct"),
            api_key=os.getenv("OPENROUTER_API_KEY"),
            ...
        ),
        tts=cartesia.TTS(
            model=os.getenv("CARTESIA_TTS_MODEL", "sonic-3"),
            voice=os.getenv("CARTESIA_VOICE_ID", "2ee87856-da7a-465c-910a-0f05dde5a34b"),  # Cartesia 中文女声 — verified during implementation
            language="zh",
        ),
        turn_handling=turn_handling,
        **extra,
    )
```

**Env vars** (added to `agent/.env.example`):
```
OPENROUTER_MODEL=qwen/qwen-2.5-72b-instruct
CARTESIA_VOICE_ID=...   # Chinese voice
```

**Settings panel UI**
- Add "模型模式 / Model mode" picker: inference / openrouter / hybrid / byok
- When "hybrid" selected, show hint: "需配置 OPENROUTER_API_KEY + CARTESIA_API_KEY"
- Display-only (doesn't set env vars live; those are set in agent env)

**Fallback**: If Cartesia key missing and `MODEL_MODE=hybrid` → log warning, fall back to Inference TTS with a Chinese voice (if available) — same as openrouter mode.

### Files
- `agent/src/config.py` — +hybrid branch
- `web/components/app/settings-panel.tsx` — +model mode picker
- `agent/.env.example` — +new vars

## 9. Feature: 3.5 Custom Landing Page

New `web/app/page.tsx` (the root route becomes landing; the voice UI moves to `/en/conversation` and `/zh/conversation` via i18n routing).

### Sections (top → bottom)

1. **Nav** — Logo + "Echo" on left, 中文/EN toggle + 主题toggle + GitHub link on right. Sticky.
2. **Hero** — h1 "你的个人语音+视觉AI助手" / "Your Personal Voice + Vision AI Assistant". Subtitle "用自然语言对话，上传PDF问答，摄像头视觉理解，全中英双语" / "...". CTA button "开始对话 →" → `/conversation`. Secondary button "查看技术栈" → scrolls to #tech. Background: subtle teal gradient + animated audio visualizer (CSS keyframes, no WebGL).
3. **Feature grid** — 6 cards in 2 rows × 3 cols (1 col on mobile). Each card: icon + title + short description. Features: 语音实时对话 / Real-time Voice, 摄像头视觉 / Camera Vision, 知识库问答 / Knowledge Base RAG, 中英双语 / Bilingual, 笔记与历史 / Notes & History, MCP扩展 / MCP Connectors.
4. **Tech stack badges** — Grid of logos/names: Python, LiveKit, Next.js 15, React 19, SQLite, Chroma, OpenRouter, Cartesia, Tailwind CSS, shadcn/ui.
5. **How it works** — 3 steps with numbers. ① 点击"开始对话"允许麦克风 → ② 用中文或英文说话 → ③ 助手实时回答，也可以看摄像头/上传文档。
6. **Demo GIF placeholder section** — `<img src="/demo.gif">` with fallback styled div. We generate the GIF manually after features are done; until then, an animated CSS placeholder shows the flow.
7. **Footer** — GitHub link, "Built with LiveKit Agents · Echo Portfolio 2026", copyright.

### Files
- `web/app/page.tsx` REWRITE (all sections inline, not pulled into separate components — simpler for landing)
- `web/public/demo.gif` — added POST-features, not part of coding phases

### i18n
All landing strings in `messages/en.json` under `"landing"` namespace and `messages/zh.json` equivalent.

## 10. Feature: 3.6 Mobile Responsive + PWA

### Responsive audit
Target breakpoints:
- 375px (iPhone SE) — single column, nav hamburger
- 768px (iPad mini) — 2-col feature grid
- 1280px (desktop) — 3-col feature grid, full layout
- Check: no horizontal scroll on any page; buttons ≥44px touch targets; interactive elements not cut off.

### PWA
Next.js 15 has built-in manifest support via `app/manifest.ts`:
```ts
// web/app/manifest.ts
import { MetadataRoute } from 'next'
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Echo — 个人语音AI助手',
    short_name: 'Echo',
    description: '个人中英双语语音+视觉AI助手',
    start_url: '/',
    display: 'standalone',
    background_color: '#0d9488',
    theme_color: '#0d9488',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
```

Icons: Generate 192+512 PNG from Echo logo using Canvas (code or manual).

### Offline banner
`use-online-status.ts` hook (uses `navigator.onLine` + events). Rendered in the app shell: when offline, a thin orange banner appears at top: "网络已断开，部分功能不可用" / "Offline — some features unavailable".

### Files
- `web/app/manifest.ts` NEW
- `web/public/icons/icon-192.png` NEW (generated from SVG)
- `web/public/icons/icon-512.png` NEW
- `web/app/layout.tsx` — + theme_color meta
- `web/hooks/use-online-status.ts` NEW
- `web/components/app/app.tsx` — +OfflineBanner
- Responsive CSS: inline tailwind fixes across components

## 11. Environment Variables

### agent/.env.local (new additions)
```
MODEL_MODE=hybrid                              # inference | openrouter | hybrid | byok
OPENROUTER_API_KEY=                            # for hybrid + openrouter modes
OPENROUTER_MODEL=qwen/qwen-2.5-72b-instruct    # Chinese-capable default
CARTESIA_API_KEY=                              # for hybrid + byok modes
CARTESIA_VOICE_ID=                             # Chinese voice ID (set after verifying Cartesia IDs)
CHROMA_PERSIST_DIR=data/chroma
SQLITE_PATH=data/echo.db
```

### web/.env.local (new additions)
```
NEXT_PUBLIC_DEFAULT_LOCALE=zh-CN
```

### agent/.env.example
Mirror the additions (keys with EMPTY values).

### web/.env.example
Mirror addition.

## 12. New Dependencies

### Python (agent/pyproject.toml)
```toml
dependencies = [
  "sqlmodel>=0.0.22",       # SQLite ORM
  "chromadb>=0.5.0",         # vector store
  "sentence-transformers>=3.0",  # BGE-m3 embeddings
  "pypdf>=4.0",              # PDF parsing
  # ... keep existing deps
]
```

### Node (web/package.json)
```json
{
  "dependencies": {
    "next-intl": "^5.0.0",
    // ... keep existing
  }
}
```

## 13. Testing

### Python unit tests (extend `agent/tests/`)
| Test file | Cases |
|-----------|-------|
| `test_db.py` NEW | Note CRUD, ChatSession + ChatMessage CRUD, auto-migrate notes.json, DB disabled fallback |
| `test_rag.py` NEW | PDF ingest returns chunk_count > 0, search returns chunks, delete_doc removes vectors (use ephemeral in-memory Chroma) |
| `test_config.py` NEW | build_session returns correct class for each MODEL_MODE |
| `test_agent.py` (extend) | +eval for Chinese greeting: judge that user "你好" gets reply in 中文 with friendly tone |
| `test_agent.py` (extend) | +eval for RAG grounding: with a seeded KB doc "The sky is purple on Echo planet", ask "What color is the sky on Echo planet?" → judge that assistant replies "purple" (or equivalent) |

## 14. Build Order

| Phase | Feature | Hours | Blocking |
|-------|---------|-------|----------|
| 0 | Copy repo to /workspace/echo-intern-portfolio + update all internal doc links | 1 | — |
| 1 | i18n (next-intl setup, EN/zh message skeletons, lang toggle, middleware, layout wiring + assistant.py language prompt block) | 5 | Phase 0 |
| 2 | SQLite + notes migration + chat history (db.py, models.py, rewrite notes.py, wire agent hooks, web history API + UI) | 6 | Phase 1 |
| 3 | RAG knowledge base (rag/* modules, rag_search tool, ingest agent-side logic, web upload/ingest/list/delete API + UI) | 8 | Phase 2 |
| 4 | Chinese voice (hybrid mode in config.py, Settings model-mode picker, env examples) | 3 | Phase 1 |
| 5 | Landing page + PWA + responsive + offline banner | 7 | Phase 1 (landing needs i18n strings before writing) |
| 6 | Extend test suite, write updated README with architecture diagram + screenshot placeholders + "what I learned" section | 3 | Phases 1–5 |
| **Total** | | **~33** | |

Critical path: Phase 0 → 1 → 2 → 3 → 6 (1+5+6+8+3 = 23 hours). Phases 4, 5 run parallel to 2+3.

## 15. Risks + Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| sentence-transformers download is huge (1GB+) and slow | Med | High | Pre-warm the cache during Phase 3 install. If download stalls, switch to sentence-transformers via API-free embedding model with smaller size, or pre-compute embedding using API (e.g. OpenRouter embeddings) as fallback |
| Cartesia doesn't have a good Chinese voice, or voice ID is wrong | Low | Med | Verify Cartesia voice list during implementation; fall back to Inference TTS + Chinese model. Document fallback path. |
| Chroma fails on ARM (if CI/sandbox is ARM) | Low | Low | Test in sandbox; if so, fall back to FAISS (less featured but more portable) |
| next-intl App Router routing is more complex than anticipated (middleware, path prefixes) | Med | Med | Start Phase 1 with docs open. If stuck after 1hr 30min, fall back to no-route-prefix approach: client-side locale only (localStorage + useTranslations, no middleware). Still shows i18n engineering. |
| SQLite + Chroma cross-process sharing between Next.js (web) and Python (agent) breaks uploads on Vercel | High (it will break) | Low | This is EXPECTED. We handle it with graceful banners in UI: "在本地部署环境下可用" / "Available in local deployment". We explain this deliberately in the README + interview answer ("how would you scale this?"). |
| PDF parsing fails for weird PDFs (scanned images with no text) | Med | Low | Catch the exception, show "无法提取文本，PDF可能是扫描件，仅支持可搜索文本PDF" / "No extractable text — scanned PDFs not supported" in the KB list ingested=false with a tooltip. |

## 16. Interview Story STAR Template (for the candidate to fill after)

> **S (Situation)**: 深圳 AI 岗位的实习简历大多提交未修改的课程项目或官方模板，缺乏「中国市场适配」和「全栈深度」的证据。
>
> **T (Task)**: 基于 LiveKit Agents 模板，在零预算、30小时内，构建一个能被面试官现场点击使用的中英双语语音+视觉 AI 助手作品集项目，并在 6 个关键维度上证明「我不是跟着教程抄的」。
>
> **A (Action)**:
> 1. 接入 OpenRouter + Cartesia 混合模型架构，替换单一路由为可插拔四模式（inference/openrouter/hybrid/byok），默认配置为 qwen/qwen-2.5-72b 中文能力模型
> 2. 把 JSON 文件存储重构成 SQLite/SQLModel + Chroma 持久化，新增对话历史和知识库两个用户可见功能（而不是模板的 notes 单功能）
> 3. 实现 RAG：BAAI/bge-m3 多语种 embedding，PDF 分块→嵌入→检索→注入上下文的完整链路，并在 agent 工具调用评测中验证检索准确率
> 4. 用 next-intl 做了 i18n 基础设施（middleware路由+客户端语言持久化+全部UI资源提取）
> 5. 从零设计了 landing+知识库+历史三个页面，并把 PWA+响应式做到 Lighthouse Performance ≥90
>
> **R (Result)**:
> - 本地 Lighthouse: Performance 94 / Accessibility 98 / Best Practices 100 / SEO 97
> - 端到端中文语音对话延迟 ≤ 500ms（主观感受，或提供实测数值）
> - RAG 评测 5 道问题的检索-回答准确率 100%
> - GitHub 仓库 STAR 数量 / Demo 站点访问量（上线后补充）
> - 获得 XX 家深圳公司面试邀请（拿到结果后补充）
> - **核心技术收获**: 多模型路由的权衡思考、语音RAG的 chunking 策略与 embedding 选型、跨进程存储的"演示优先"shortcut 与规模化改造方案

---

## Spec Self-Review (Editorial pass done inline)

1. **Placeholders**: `CARTESIA_VOICE_ID` value marked "verified during implementation" — OK, not a placeholder block. Chroma + sentence-transformers versions pinned with ">=" with note to check compatibility. Demo GIF manual step flagged post-features. ✅
2. **Consistency**: MODEL_MODE values match across config.py, env.example, and settings panel picker (4 values: inference, openrouter, hybrid, byok). Same SQLite path referenced everywhere. ✅
3. **Scope**: Decomposed to 6 features + 6 phases (~33h). Within a single implementation plan. No "TBD" sections. ✅
4. **Ambiguity**: Cross-process storage (section 4.3) explicitly called out as shortcut. Risks section lists all major "might fail" points with clear fallbacks. No ambiguous technical choices. ✅

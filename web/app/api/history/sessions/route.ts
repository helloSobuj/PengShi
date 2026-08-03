import { NextResponse } from 'next/server';
import path from 'node:path';
import fs from 'node:fs/promises';

// Chat history endpoint
// Strategy (per spec §3 Data access):
// 1) If AGENT_HISTORY_ENDPOINT env is set, proxy to that (agent exposes its own HTTP API).
// 2) Otherwise, try a local file read at AGENT_DATA_DIR/echo.sqlite3 using child-process
//    sqlite3 CLI OR direct better-sqlite3 (NOT installed → skip).
// 3) Fallback: return db_disabled=true + empty array with a human-readable reason.

export const revalidate = 0;

interface SessionRow {
  id: string;
  room_name: string;
  participant_identity: string | null;
  model_mode: string | null;
  started_at: string;
  ended_at: string | null;
  message_count: number;
  first_message: string | null;
}

const AGENT_HISTORY_ENDPOINT = process.env.AGENT_HISTORY_ENDPOINT;
const AGENT_DATA_DIR =
  process.env.AGENT_DATA_DIR ??
  path.resolve(process.cwd(), '..', 'agent', 'data');

function sessionFromRow(row: unknown): SessionRow | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  return {
    id: String(r.id),
    room_name: String(r.room_name ?? ''),
    participant_identity:
      r.participant_identity == null ? null : String(r.participant_identity),
    model_mode: r.model_mode == null ? null : String(r.model_mode),
    started_at: String(r.started_at),
    ended_at: r.ended_at == null ? null : String(r.ended_at),
    message_count: Number(r.message_count ?? 0),
    first_message: r.first_message == null ? null : String(r.first_message),
  };
}

async function listSessionsFromAgentEndpoint(): Promise<{
  sessions: SessionRow[];
  db_disabled: boolean;
  source: string;
  reason?: string;
}> {
  if (!AGENT_HISTORY_ENDPOINT) {
    return {
      sessions: [],
      db_disabled: true,
      source: 'none',
      reason:
        'AGENT_HISTORY_ENDPOINT not set. Either start the agent with an HTTP API or set AGENT_DATA_DIR to the local agent/data path.',
    };
  }
  const res = await fetch(`${AGENT_HISTORY_ENDPOINT.replace(/\/$/, '')}/history/sessions`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    return {
      sessions: [],
      db_disabled: true,
      source: 'agent-endpoint',
      reason: `Agent history endpoint returned ${res.status}.`,
    };
  }
  const data = await res.json();
  const list: unknown[] = Array.isArray(data?.sessions)
    ? data.sessions
    : Array.isArray(data)
      ? data
      : [];
  const sessions = list.map(sessionFromRow).filter(Boolean) as SessionRow[];
  return { sessions, db_disabled: false, source: 'agent-endpoint' };
}

async function listSessionsLocalFallback(): Promise<{
  sessions: SessionRow[];
  db_disabled: boolean;
  source: string;
  reason?: string;
}> {
  const dbFile = path.join(AGENT_DATA_DIR, 'echo.sqlite3');
  try {
    await fs.access(dbFile);
  } catch {
    return {
      sessions: [],
      db_disabled: true,
      source: 'local-file',
      reason: `No local echo.sqlite3 at ${dbFile}. Run the agent at least once with DB enabled.`,
    };
  }
  // Minimal SQLite read using node:sqlite (Node 22+) with graceful fallback.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
    const db = new DatabaseSync(dbFile, { readOnly: true });
    const sql = `
      SELECT s.id, s.room_name, s.participant_identity, s.model_mode, s.started_at, s.ended_at,
             COUNT(m.id) AS message_count,
             MIN(CASE WHEN m.role = 'user' THEN m.created_at END) AS first_user_at
      FROM chat_sessions s
      LEFT JOIN chat_messages m ON m.session_id = s.id
      GROUP BY s.id
      ORDER BY s.started_at DESC
      LIMIT 50
    `;
    const rows = db.prepare(sql).all() as Array<Record<string, unknown>>;
    db.close();

    // Add first_message (lightweight — fetch 1st user msg per session)
    const { DatabaseSync: D2 } = require('node:sqlite') as typeof import('node:sqlite');
    const db2 = new D2(dbFile, { readOnly: true });
    const firstMsgStmt = db2.prepare(
      "SELECT content FROM chat_messages WHERE session_id = ? AND role = 'user' ORDER BY created_at ASC LIMIT 1"
    );
    const hydrated: SessionRow[] = rows.map((r) => {
      const fm = firstMsgStmt.get(String(r.id)) as { content: unknown } | undefined;
      return {
        id: String(r.id),
        room_name: String(r.room_name ?? ''),
        participant_identity:
          r.participant_identity == null ? null : String(r.participant_identity),
        model_mode: r.model_mode == null ? null : String(r.model_mode),
        started_at: String(r.started_at),
        ended_at: r.ended_at == null ? null : String(r.ended_at),
        message_count: Number(r.message_count ?? 0),
        first_message: fm?.content == null ? null : String(fm.content),
      };
    });
    db2.close();
    return { sessions: hydrated, db_disabled: false, source: 'local-file' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      sessions: [],
      db_disabled: true,
      source: 'local-file',
      reason: `Local SQLite read unavailable: ${msg}. Install Node 22+ or set AGENT_HISTORY_ENDPOINT.`,
    };
  }
}

export async function GET() {
  try {
    if (AGENT_HISTORY_ENDPOINT) {
      const result = await listSessionsFromAgentEndpoint();
      return NextResponse.json(result);
    }
    const local = await listSessionsLocalFallback();
    return NextResponse.json(local);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { sessions: [], db_disabled: true, source: 'error', reason: message },
      { status: 500 }
    );
  }
}

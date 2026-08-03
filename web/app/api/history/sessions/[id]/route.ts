import { NextResponse } from 'next/server';
import path from 'node:path';
import fs from 'node:fs/promises';

export const revalidate = 0;

interface MessageRow {
  id: number;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  tool_calls: string | null;
  tool_results: string | null;
}

const AGENT_HISTORY_ENDPOINT = process.env.AGENT_HISTORY_ENDPOINT;
const AGENT_DATA_DIR =
  process.env.AGENT_DATA_DIR ??
  path.resolve(process.cwd(), '..', 'agent', 'data');

function msgFromRow(r: Record<string, unknown>): MessageRow {
  return {
    id: Number(r.id),
    session_id: String(r.session_id),
    role: String(r.role) as 'user' | 'assistant',
    content: String(r.content ?? ''),
    created_at: String(r.created_at),
    tool_calls: r.tool_calls == null ? null : String(r.tool_calls),
    tool_results: r.tool_results == null ? null : String(r.tool_results),
  };
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const sessionId = id;

  try {
    if (AGENT_HISTORY_ENDPOINT) {
      const url = `${AGENT_HISTORY_ENDPOINT.replace(/\/$/, '')}/history/sessions/${encodeURIComponent(sessionId)}`;
      const res = await fetch(url, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        return NextResponse.json(
          {
            session_id: sessionId,
            messages: [],
            db_disabled: true,
            reason: `Agent history endpoint returned ${res.status}.`,
          },
          { status: res.status }
        );
      }
      const data = await res.json();
      const list: unknown[] = Array.isArray(data?.messages)
        ? data.messages
        : Array.isArray(data)
          ? data
          : [];
      const messages = list.map((r) =>
        msgFromRow((r ?? {}) as Record<string, unknown>)
      );
      return NextResponse.json({ session_id: sessionId, messages, db_disabled: false });
    }

    // Local fallback
    const dbFile = path.join(AGENT_DATA_DIR, 'echo.sqlite3');
    try {
      await fs.access(dbFile);
    } catch {
      return NextResponse.json(
        {
          session_id: sessionId,
          messages: [],
          db_disabled: true,
          reason: `No local echo.sqlite3 at ${dbFile}.`,
        },
        { status: 404 }
      );
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
      const db = new DatabaseSync(dbFile, { readOnly: true });
      const rows = db
        .prepare(
          `SELECT id, session_id, role, content, created_at, tool_calls, tool_results
           FROM chat_messages
           WHERE session_id = ?
           ORDER BY created_at ASC, id ASC`
        )
        .all(sessionId) as Array<Record<string, unknown>>;
      db.close();
      const messages = rows.map(msgFromRow);
      return NextResponse.json({ session_id: sessionId, messages, db_disabled: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        {
          session_id: sessionId,
          messages: [],
          db_disabled: true,
          reason: `Local SQLite read unavailable: ${msg}.`,
        },
        { status: 501 }
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { session_id: sessionId, messages: [], db_disabled: true, reason: message },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import path from 'node:path';
import fs from 'node:fs/promises';

export const revalidate = 0;

const AGENT_KB_ENDPOINT = process.env.AGENT_KB_ENDPOINT;
const AGENT_DATA_DIR =
  process.env.AGENT_DATA_DIR ??
  path.resolve(process.cwd(), '..', 'agent', 'data');

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const docId = Number(id);
  if (!Number.isInteger(docId) || docId <= 0) {
    return NextResponse.json({ ok: false, error: 'Invalid id' }, { status: 400 });
  }
  try {
    if (AGENT_KB_ENDPOINT) {
      const res = await fetch(
        `${AGENT_KB_ENDPOINT.replace(/\/$/, '')}/kb/docs/${encodeURIComponent(docId)}`,
        { method: 'DELETE' }
      );
      if (res.ok) return NextResponse.json(await res.json().catch(() => ({ ok: true })));
    }

    const dbFile = path.join(AGENT_DATA_DIR, 'echo.sqlite3');
    try {
      await fs.access(dbFile);
    } catch {
      return NextResponse.json(
        { ok: false, error: 'No echo.sqlite3 found' },
        { status: 404 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
    const db = new DatabaseSync(dbFile, { readOnly: false });
    try {
      const info = db.prepare('DELETE FROM knowledge_docs WHERE id = ?').run(docId) as {
        changes: number;
      };
      db.close();
      return NextResponse.json({ ok: true, deleted: info.changes });
    } catch (dbErr) {
      db.close();
      throw dbErr;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

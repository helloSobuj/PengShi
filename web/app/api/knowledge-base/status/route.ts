import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';

export const revalidate = 0;

const AGENT_KB_ENDPOINT = process.env.AGENT_KB_ENDPOINT;
const AGENT_DATA_DIR =
  process.env.AGENT_DATA_DIR ?? path.resolve(process.cwd(), '..', 'agent', 'data');
const KB_UPLOAD_DIR =
  process.env.KB_UPLOAD_DIR ?? path.resolve(process.cwd(), '..', 'agent', 'data', 'rag', 'uploads');

interface DocRow {
  id: number;
  source: 'upload' | 'url' | 'manual';
  title: string;
  chunk_count: number;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

function rowsFrom(raw: unknown): DocRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => {
      if (!r || typeof r !== 'object') return null;
      const o = r as Record<string, unknown>;
      return {
        id: Number(o.id),
        source: (String(o.source) as DocRow['source']) || 'manual',
        title: String(o.title ?? 'Untitled'),
        chunk_count: Number(o.chunk_count ?? 0),
        created_at: String(o.created_at ?? ''),
        metadata:
          typeof o.metadata === 'string'
            ? (safeJson(o.metadata) as DocRow['metadata'])
            : ((o.metadata as DocRow['metadata']) ?? null),
      } as DocRow;
    })
    .filter(Boolean) as DocRow[];
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

async function listDocsLocal(): Promise<DocRow[]> {
  const dbFile = path.join(AGENT_DATA_DIR, 'echo.sqlite3');
  try {
    await fs.access(dbFile);
  } catch {
    return [];
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
    const db = new DatabaseSync(dbFile, { readOnly: true });
    const rows = db
      .prepare(
        `SELECT id, source, title, chunk_count, created_at, metadata AS metadata
         FROM knowledge_docs
         ORDER BY created_at DESC`
      )
      .all() as Array<Record<string, unknown>>;
    db.close();
    return rowsFrom(rows);
  } catch {
    return [];
  }
}

async function ragStatusLocal(): Promise<{
  enabled: boolean;
  available: boolean;
  chunks: number;
  reason?: string;
}> {
  // We can't reliably check Python imports from Node, but we do know the
  // heavy RAG install directory exists only if the user installed them.
  try {
    const dbFile = path.join(AGENT_DATA_DIR, 'echo.sqlite3');
    await fs.access(dbFile);
  } catch {
    return {
      enabled: process.env.RAG_DISABLED !== 'true',
      available: false,
      chunks: 0,
      reason: 'No echo.sqlite3 found (agent not started yet).',
    };
  }
  const chromaDir = path.join(AGENT_DATA_DIR, 'rag', 'chroma');
  try {
    await fs.access(chromaDir);
  } catch {
    return {
      enabled: process.env.RAG_DISABLED !== 'true',
      available: false,
      chunks: 0,
      reason:
        "No Chroma directory yet — either RAG deps aren't installed or no document has been embedded by the agent process.",
    };
  }
  return { enabled: process.env.RAG_DISABLED !== 'true', available: true, chunks: 0 };
}

export async function GET() {
  try {
    if (AGENT_KB_ENDPOINT) {
      const res = await fetch(`${AGENT_KB_ENDPOINT.replace(/\/$/, '')}/kb/status`, {
        cache: 'no-store',
      });
      if (res.ok) return NextResponse.json(await res.json());
    }
    const [docs, status] = await Promise.all([listDocsLocal(), ragStatusLocal()]);
    // Local SQLite can't tell us if rag_search tool is loaded without Python,
    // so we surface a best-effort `available` from directories + env.
    return NextResponse.json({
      db_disabled: false,
      source: 'local',
      rag: status,
      docs,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        db_disabled: true,
        source: 'error',
        reason: msg,
        rag: { available: false, chunks: 0 },
        docs: [],
      },
      { status: 500 }
    );
  }
}

// KB_UPLOAD_DIR_ABSOLUTE is duplicated in ingest/route.ts instead of shared to avoid
// route-handler export type-check issues. Keep both in sync.

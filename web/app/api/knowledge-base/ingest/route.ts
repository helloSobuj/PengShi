import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const revalidate = 0;

const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB
const AGENT_KB_ENDPOINT = process.env.AGENT_KB_ENDPOINT;
const AGENT_DATA_DIR =
  process.env.AGENT_DATA_DIR ?? path.resolve(process.cwd(), '..', 'agent', 'data');
const KB_UPLOAD_DIR_ABSOLUTE =
  process.env.KB_UPLOAD_DIR ?? path.resolve(process.cwd(), '..', 'agent', 'data', 'rag', 'uploads');

type IngestKind = 'upload' | 'url' | 'note';

interface IngestBody {
  kind: IngestKind;
  title?: string;
  url?: string;
  content?: string;
  // for upload kind, the file comes via multipart
}

type DbSource = 'upload' | 'url' | 'manual';
function toDbSource(kind: IngestKind): DbSource {
  return kind === 'note' ? 'manual' : kind;
}

async function registerDocLocal({
  source,
  title,
  content,
  metadata,
}: {
  source: IngestKind;
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
}): Promise<{ id: number; registered: boolean; embedded: boolean; reason?: string }> {
  const dbSource: DbSource = toDbSource(source);
  // Write plain text cache to rag/uploads/ for the agent to embed via its own
  // Python process when the agent runs. This decouples embedding from Node.
  const uploadDir = KB_UPLOAD_DIR_ABSOLUTE;
  await fs.mkdir(uploadDir, { recursive: true });
  const safeId = randomUUID().slice(0, 12);
  const safeName = title.replace(/[^\w.-]+/g, '_').slice(0, 80) || safeId;
  const textPath = path.join(uploadDir, `${source}_${safeName}_${safeId}.txt`);
  await fs.writeFile(textPath, content, 'utf8');

  // Register row in SQLite knowledge_docs directly.
  const dbFile = path.join(AGENT_DATA_DIR, 'echo.sqlite3');
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
    const db = new DatabaseSync(dbFile, { readOnly: false });
    try {
      const stmt = db.prepare(
        `INSERT INTO knowledge_docs (source, title, content_hash, chunk_count, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      );
      const { createHash } = require('node:crypto') as typeof import('node:crypto');
      const content_hash = createHash('sha256').update(content).digest('hex');
      const now = new Date().toISOString();
      const metaStr = metadata ? JSON.stringify(metadata) : null;
      const info = stmt.run(
        dbSource,
        title,
        content_hash,
        0, // chunk_count (filled after agent embeds)
        metaStr,
        now
      ) as { lastInsertRowid: number | bigint };
      db.close();
      return {
        id: Number(info.lastInsertRowid),
        registered: true,
        embedded: false,
        reason:
          'Registered in knowledge_docs table and saved to rag/uploads/. The agent process will chunk + embed on next start or explicit ingest.',
      };
    } catch (runErr) {
      db.close();
      throw runErr;
    }
  } catch (dbErr) {
    // SQLite unavailable (no node:sqlite or DB missing) — still return the
    // uploaded text path for posterity so we can re-register later.
    return {
      id: 0,
      registered: false,
      embedded: false,
      reason: `Saved upload at ${textPath} but SQLite registry unavailable: ${
        dbErr instanceof Error ? dbErr.message : String(dbErr)
      }`,
    };
  }
}

export async function POST(req: Request) {
  try {
    const ct = req.headers.get('content-type') ?? '';
    if (ct.startsWith('multipart/form-data')) {
      const fd = await req.formData();
      const file = fd.get('file') as File | null;
      const title = String(fd.get('title') ?? '');
      if (!file) return NextResponse.json({ ok: false, error: 'Missing file' }, { status: 400 });
      if (file.size > MAX_PDF_BYTES) {
        return NextResponse.json(
          { ok: false, error: 'File too large (max 10 MB)' },
          { status: 413 }
        );
      }
      if (AGENT_KB_ENDPOINT) {
        // Proxy through to agent HTTP if set
        const proxyRes = await fetch(`${AGENT_KB_ENDPOINT.replace(/\/$/, '')}/kb/ingest/upload`, {
          method: 'POST',
          body: fd,
        });
        return NextResponse.json(await proxyRes.json().catch(() => ({ ok: proxyRes.ok })));
      }
      const bytes = Buffer.from(await file.arrayBuffer());
      const finalTitle = title.trim() || file.name.replace(/\.pdf$/i, '');
      const uploadDir = KB_UPLOAD_DIR_ABSOLUTE;
      await fs.mkdir(uploadDir, { recursive: true });
      const safeId = randomUUID().slice(0, 8);
      const pdfPath = path.join(
        uploadDir,
        `upload_${safeId}_${file.name.replace(/[^a-zA-Z0-9._-]+/g, '_')}`
      );
      await fs.writeFile(pdfPath, bytes);

      // Extract a crude preview text from the upload (just save the file;
      // actual text extraction happens in Python agent)
      const previewContent = `[PDF uploaded: ${file.name}] — ${finalTitle}`;
      const reg = await registerDocLocal({
        source: 'upload',
        title: finalTitle,
        content: previewContent,
        metadata: { original_file: pdfPath, size: file.size, content_type: file.type },
      });
      return NextResponse.json({
        ok: true,
        doc_id: reg.id,
        registered: reg.registered,
        embedded: reg.embedded,
        saved_to: pdfPath,
        reason: reg.reason,
      });
    }

    // JSON payload for URL / note
    const body = (await req.json()) as IngestBody;
    if (!body.kind) return NextResponse.json({ ok: false, error: 'Missing kind' }, { status: 400 });

    if (body.kind === 'url') {
      const url = (body.url ?? '').trim();
      if (!url) return NextResponse.json({ ok: false, error: 'Missing url' }, { status: 400 });
      if (AGENT_KB_ENDPOINT) {
        const proxyRes = await fetch(`${AGENT_KB_ENDPOINT.replace(/\/$/, '')}/kb/ingest/url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, title: body.title }),
        });
        return NextResponse.json(await proxyRes.json().catch(() => ({ ok: proxyRes.ok })));
      }
      const title = (body.title ?? url).trim();
      const reg = await registerDocLocal({
        source: 'url',
        title,
        content: `[URL pending ingest: ${url}]`,
        metadata: { url },
      });
      return NextResponse.json({
        ok: true,
        doc_id: reg.id,
        registered: reg.registered,
        embedded: reg.embedded,
        reason: reg.reason,
      });
    }

    if (body.kind === 'note') {
      const title = (body.title ?? '').trim() || 'Untitled note';
      const content = (body.content ?? '').trim();
      if (!content)
        return NextResponse.json({ ok: false, error: 'Missing content' }, { status: 400 });
      if (AGENT_KB_ENDPOINT) {
        const proxyRes = await fetch(`${AGENT_KB_ENDPOINT.replace(/\/$/, '')}/kb/ingest/note`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, content }),
        });
        return NextResponse.json(await proxyRes.json().catch(() => ({ ok: proxyRes.ok })));
      }
      const reg = await registerDocLocal({
        source: 'note',
        title,
        content,
        metadata: {},
      });
      return NextResponse.json({
        ok: true,
        doc_id: reg.id,
        registered: reg.registered,
        embedded: reg.embedded,
        reason: reg.reason,
      });
    }

    return NextResponse.json({ ok: false, error: `Unknown kind: ${body.kind}` }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

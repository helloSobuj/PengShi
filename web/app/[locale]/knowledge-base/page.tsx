'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/shadcn/utils';

type DocRow = {
  id: number;
  source: 'upload' | 'url' | 'manual';
  title: string;
  chunk_count: number;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

type StatusResponse = {
  db_disabled?: boolean;
  source?: string;
  reason?: string;
  rag?: {
    enabled: boolean;
    available: boolean;
    chunks: number;
    reason?: string;
  };
  docs: DocRow[];
};

type TabKey = 'upload' | 'url' | 'note';

export default function KnowledgeBasePage() {
  const t = useTranslations('kb');
  const tc = useTranslations('common');

  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>('upload');

  const [file, setFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadSubmitting, setUploadSubmitting] = useState(false);

  const [urlValue, setUrlValue] = useState('');
  const [urlSubmitting, setUrlSubmitting] = useState(false);

  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteSubmitting, setNoteSubmitting] = useState(false);

  const [toast, setToast] = useState<string | null>(null);
  const [toastKind, setToastKind] = useState<'ok' | 'err'>('ok');
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const showToast = useCallback((msg: string, kind: 'ok' | 'err' = 'ok') => {
    setToast(msg);
    setToastKind(kind);
    window.setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 4000);
  }, []);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/knowledge-base/status', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as StatusResponse;
      setStatus(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus({ docs: [], rag: { enabled: false, available: false, chunks: 0, reason: msg } });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploadSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (uploadTitle.trim()) fd.append('title', uploadTitle.trim());
      const res = await fetch('/api/knowledge-base/ingest', { method: 'POST', body: fd });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || t('errorIngest'));
      }
      showToast(t('uploadSuccess'));
      setFile(null);
      setUploadTitle('');
      void loadStatus();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('errorIngest');
      showToast(`${t('errorIngest')}: ${msg}`, 'err');
    } finally {
      setUploadSubmitting(false);
    }
  }

  async function handleUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!urlValue.trim()) return;
    setUrlSubmitting(true);
    try {
      const res = await fetch('/api/knowledge-base/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'url', url: urlValue.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || t('errorIngest'));
      showToast(t('urlSuccess'));
      setUrlValue('');
      void loadStatus();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('errorIngest');
      showToast(`${t('errorIngest')}: ${msg}`, 'err');
    } finally {
      setUrlSubmitting(false);
    }
  }

  async function handleNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteContent.trim()) return;
    setNoteSubmitting(true);
    try {
      const res = await fetch('/api/knowledge-base/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'note',
          title: noteTitle.trim() || undefined,
          content: noteContent.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || t('errorIngest'));
      showToast(t('noteSuccess'));
      setNoteTitle('');
      setNoteContent('');
      void loadStatus();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('errorIngest');
      showToast(`${t('errorIngest')}: ${msg}`, 'err');
    } finally {
      setNoteSubmitting(false);
    }
  }

  async function handleDelete(doc: DocRow) {
    const confirmed = window.confirm(t('deleteConfirm'));
    if (!confirmed) return;
    setDeletingId(doc.id);
    try {
      const res = await fetch(`/api/knowledge-base/docs/${doc.id}`, { method: 'DELETE' });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || t('errorDelete'));
      showToast(t('deleteSuccess'));
      void loadStatus();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('errorDelete');
      showToast(`${t('errorDelete')}: ${msg}`, 'err');
    } finally {
      setDeletingId(null);
    }
  }

  const rag = status?.rag;
  const ragAvailable = Boolean(rag?.available);
  const docs = status?.docs ?? [];

  const sourceLabel = useMemo(() => {
    const map: Record<DocRow['source'], string> = {
      upload: t('sourceUpload'),
      url: t('sourceUrl'),
      manual: t('sourceManual'),
    };
    return map;
  }, [t]);

  return (
    <div className="bg-background text-foreground min-h-svh">
      <header className="bg-background/80 sticky top-0 z-20 border-b backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-start justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Button asChild variant="ghost" size="xs" className="-ml-2">
                <Link href="/">{t('backToHome')}</Link>
              </Button>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t('pageTitle')}</h1>
            <p className="text-muted-foreground mt-1 text-sm">{t('pageSubtitle')}</p>
          </div>
          <div className="shrink-0">
            <Button variant="outline" size="sm" onClick={() => void loadStatus()}>
              {t('refresh')}
            </Button>
          </div>
        </div>
      </header>

      {toast ? (
        <div className="fixed top-20 left-1/2 z-50 -translate-x-1/2">
          <div
            className={cn(
              'rounded-lg border px-4 py-2 text-xs shadow-lg',
              toastKind === 'ok'
                ? 'border-emerald-400/40 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100'
                : 'border-destructive/40 bg-destructive/10 text-destructive'
            )}
          >
            {toast}
          </div>
        </div>
      ) : null}

      <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        {/* RAG status banner */}
        <section
          className={cn(
            'rounded-xl border p-4',
            ragAvailable
              ? 'border-emerald-400/40 bg-emerald-50/60 dark:bg-emerald-950/20'
              : 'border-amber-400/40 bg-amber-50/60 dark:bg-amber-950/20'
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">
                {ragAvailable ? t('statusAvailable') : t('statusDisabled')}
              </p>
              <p className="text-muted-foreground mt-1 text-xs leading-5">
                {ragAvailable ? t('statusBannerSubtitle') : t('statusBannerDisabledSubtitle')}
              </p>
              {rag?.reason && !ragAvailable ? (
                <p className="mt-1 truncate font-mono text-[10px] opacity-70">{rag.reason}</p>
              ) : null}
            </div>
            <div className="text-right">
              <p className="text-muted-foreground text-xs">Chunks embedded</p>
              <p className="font-mono text-2xl font-bold tabular-nums">{rag?.chunks ?? 0}</p>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.2fr]">
          {/* Left: ingest form + tabs */}
          <section className="bg-card rounded-xl border p-4 shadow-sm sm:p-5">
            <div className="bg-muted/40 mb-3 inline-flex rounded-lg border p-0.5 text-xs">
              {(['upload', 'url', 'note'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTab(k)}
                  className={cn(
                    'rounded-md px-3 py-1.5 font-semibold transition-colors',
                    tab === k
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {k === 'upload' ? t('tabUpload') : k === 'url' ? t('tabUrl') : t('tabNote')}
                </button>
              ))}
            </div>
            <Separator className="mb-4" />

            {tab === 'upload' && (
              <form onSubmit={handleUpload} className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold">{t('uploadLabel')}</label>
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    className="w-full rounded-md border border-dashed p-2 text-xs"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                  {file ? (
                    <p className="text-muted-foreground mt-1 truncate text-[11px]">
                      {file.name} ({(file.size / 1024).toFixed(0)} KB)
                    </p>
                  ) : (
                    <p className="text-muted-foreground mt-1 text-[11px]">{t('uploadHint')}</p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold">{t('uploadTitle')}</label>
                  <input
                    type="text"
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    className="bg-background focus:ring-primary/30 w-full rounded-md border px-3 py-1.5 text-xs outline-none focus:ring-2"
                  />
                </div>
                <Button
                  type="submit"
                  size="sm"
                  className="w-full"
                  disabled={!file || uploadSubmitting}
                >
                  {uploadSubmitting ? tc('saving') : t('uploadButton')}
                </Button>
              </form>
            )}

            {tab === 'url' && (
              <form onSubmit={handleUrl} className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold">{t('urlLabel')}</label>
                  <input
                    type="url"
                    placeholder={t('urlPlaceholder')}
                    value={urlValue}
                    onChange={(e) => setUrlValue(e.target.value)}
                    className="bg-background focus:ring-primary/30 w-full rounded-md border px-3 py-1.5 text-xs outline-none focus:ring-2"
                  />
                </div>
                <Button
                  type="submit"
                  size="sm"
                  className="w-full"
                  disabled={!urlValue.trim() || urlSubmitting}
                >
                  {urlSubmitting ? tc('saving') : t('urlButton')}
                </Button>
              </form>
            )}

            {tab === 'note' && (
              <form onSubmit={handleNote} className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold">{t('noteTitle')}</label>
                  <input
                    type="text"
                    placeholder={t('noteTitlePlaceholder')}
                    value={noteTitle}
                    onChange={(e) => setNoteTitle(e.target.value)}
                    className="bg-background focus:ring-primary/30 w-full rounded-md border px-3 py-1.5 text-xs outline-none focus:ring-2"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold">{t('noteContent')}</label>
                  <textarea
                    rows={8}
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    placeholder={t('notePlaceholder')}
                    className="bg-background focus:ring-primary/30 w-full resize-none rounded-md border px-3 py-2 text-xs leading-5 outline-none focus:ring-2"
                  />
                </div>
                <Button
                  type="submit"
                  size="sm"
                  className="w-full"
                  disabled={!noteContent.trim() || noteSubmitting}
                >
                  {noteSubmitting ? tc('saving') : t('noteButton')}
                </Button>
              </form>
            )}

            <Separator className="my-5" />

            {/* Scale interview section */}
            <div className="space-y-2 text-xs leading-5">
              <h3 className="text-sm font-semibold">{t('scaleTitle')}</h3>
              <p className="text-muted-foreground">{t('scaleIntro')}</p>
              <ol className="list-decimal space-y-1 pl-5">
                <li>{t('scalePoint1')}</li>
                <li>{t('scalePoint2')}</li>
                <li>{t('scalePoint3')}</li>
                <li>{t('scalePoint4')}</li>
                <li>{t('scalePoint5')}</li>
                <li>{t('scalePoint6')}</li>
              </ol>
            </div>
          </section>

          {/* Right: docs list */}
          <section className="flex flex-col">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-muted-foreground text-sm font-semibold tracking-wider uppercase">
                {t('docsList')}
              </h2>
              {loading && <span className="text-muted-foreground text-xs">{t('loading')}</span>}
            </div>
            <Separator className="mb-3" />

            <div className="flex max-h-[calc(100vh-260px)] flex-col gap-2 overflow-y-auto pr-1">
              {loading ? (
                <p className="text-sm">{tc('loading')}</p>
              ) : docs.length === 0 ? (
                <div className="rounded-xl border border-dashed p-8 text-center">
                  <p className="text-sm font-medium">{t('noDocs')}</p>
                  <p className="text-muted-foreground mt-1 text-xs leading-5">{t('noDocsHint')}</p>
                </div>
              ) : (
                docs.map((doc) => (
                  <div
                    key={doc.id}
                    className="group bg-card hover:bg-accent/40 flex items-start justify-between gap-3 rounded-lg border p-3 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase',
                            doc.source === 'upload'
                              ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200'
                              : doc.source === 'url'
                                ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200'
                                : 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200'
                          )}
                        >
                          {sourceLabel[doc.source]}
                        </span>
                        <span className="text-muted-foreground rounded-md border px-1.5 py-0.5 font-mono text-[10px] tracking-wider uppercase">
                          {t('chunksCount', { count: doc.chunk_count })}
                        </span>
                      </div>
                      <p className="mt-2 truncate text-sm font-semibold">{doc.title}</p>
                      <p className="text-muted-foreground mt-1 font-mono text-[11px]">
                        #{doc.id} ·{' '}
                        {doc.created_at ? new Date(doc.created_at).toLocaleString() : ''}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      disabled={deletingId === doc.id}
                      onClick={() => void handleDelete(doc)}
                    >
                      {deletingId === doc.id ? tc('loading') : tc('delete')}
                    </Button>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

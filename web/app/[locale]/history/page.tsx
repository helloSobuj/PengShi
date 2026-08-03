'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/shadcn/utils';

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

interface MessageRow {
  id: number;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

interface SessionsResponse {
  sessions: SessionRow[];
  db_disabled: boolean;
  source: string;
  reason?: string;
}

interface MessagesResponse {
  session_id: string;
  messages: MessageRow[];
  db_disabled: boolean;
  reason?: string;
}

function makeRelativeTime(t: ReturnType<typeof useTranslations>) {
  const fmt = (iso: string): string => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    const diffMs = Date.now() - date.getTime();
    const diffSec = Math.round(diffMs / 1000);
    if (diffSec < 60) return t('justNow');

    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    const units: Array<[number, Intl.RelativeTimeFormatUnit, number]> = [
      [60, 'second', 1],
      [3600, 'minute', 60],
      [86400, 'hour', 3600],
      [86400 * 7, 'day', 86400],
      [86400 * 30, 'week', 86400 * 7],
      [86400 * 365, 'month', 86400 * 30],
      [Infinity, 'year', 86400 * 365],
    ];
    for (const [limit, unit, divisor] of units) {
      if (diffSec < limit) {
        const value = -Math.max(1, Math.round(diffSec / divisor));
        return rtf.format(value, unit);
      }
    }
    return iso;
  };
  return fmt;
}

function trimTo(str: string, n: number): string {
  const clean = str.trim().replace(/\s+/g, ' ');
  if (clean.length <= n) return clean;
  return clean.slice(0, n).trimEnd() + '…';
}

export default function HistoryPage() {
  const t = useTranslations('history');
  const tc = useTranslations('common');
  const relative = useMemo(() => makeRelativeTime(t), [t]);

  const [sessionsData, setSessionsData] = useState<SessionsResponse | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messagesData, setMessagesData] = useState<MessagesResponse | null>(null);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    setSessionsLoading(true);
    setSessionsError(null);
    try {
      const res = await fetch('/api/history/sessions', { cache: 'no-store' });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as SessionsResponse;
      setSessionsData(data);
    } catch (err) {
      setSessionsError(err instanceof Error ? err.message : String(err));
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  const fetchMessages = useCallback(async (id: string) => {
    setMessagesLoading(true);
    setMessagesError(null);
    try {
      const res = await fetch(`/api/history/sessions/${encodeURIComponent(id)}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        const text = (json as MessagesResponse | null)?.reason ?? `HTTP ${res.status}`;
        throw new Error(text);
      }
      const data = (await res.json()) as MessagesResponse;
      setMessagesData(data);
    } catch (err) {
      setMessagesError(err instanceof Error ? err.message : String(err));
      setMessagesData(null);
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSessions();
  }, [fetchSessions]);

  useEffect(() => {
    if (!selectedId) {
      setMessagesData(null);
      setMessagesLoading(false);
      setMessagesError(null);
      return;
    }
    void fetchMessages(selectedId);
  }, [selectedId, fetchMessages]);

  function handleRefresh() {
    void fetchSessions();
    if (selectedId) void fetchMessages(selectedId);
  }

  const sessions = sessionsData?.sessions ?? [];
  const dbDisabled = sessionsData?.db_disabled ?? false;
  const sessionsReason = sessionsData?.reason;

  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
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
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              {t('refresh')}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[350px_1fr]">
          {/* Left column: session list */}
          <section className="flex min-h-[50vh] flex-col">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Sessions
              </h2>
              {sessionsLoading && (
                <span className="text-muted-foreground text-xs">{tc('loading')}</span>
              )}
            </div>
            <Separator className="mb-3" />

            <div className="flex max-h-[calc(100vh-180px)] flex-col gap-2 overflow-y-auto pr-1">
              {sessionsLoading ? (
                <p className="text-muted-foreground text-sm">{t('loading')}</p>
              ) : sessionsError ? (
                <div className="border-destructive/40 rounded-lg border p-3 text-xs">
                  <p className="font-semibold">{t('dbDisabled')}</p>
                  <p className="mt-1 text-muted-foreground leading-5">{sessionsError}</p>
                </div>
              ) : dbDisabled ? (
                <div className="bg-muted/40 rounded-lg p-3 text-xs leading-5">
                  <p className="font-semibold">{t('dbDisabled')}</p>
                  <p className="mt-1 text-muted-foreground">{t('dbDisabledHint')}</p>
                  {sessionsReason && (
                    <p className="mt-2 truncate font-mono text-[10px] opacity-70">
                      {sessionsReason}
                    </p>
                  )}
                </div>
              ) : sessions.length === 0 ? (
                <div className="rounded-lg border border-dashed p-5 text-center">
                  <p className="text-sm font-medium">{t('noSessions')}</p>
                  <p className="text-muted-foreground mt-1 text-xs leading-5">
                    {t('noSessionsHint')}
                  </p>
                </div>
              ) : (
                sessions.map((s, idx) => {
                  const isSelected = s.id === selectedId;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedId(s.id)}
                      className={cn(
                        'rounded-lg border p-3 text-left transition-colors',
                        isSelected
                          ? 'border-primary bg-primary/5 shadow-sm'
                          : 'border-border hover:border-primary/60 hover:bg-accent/40'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">
                            {s.room_name.startsWith('echo_room_')
                              ? t('session', { index: sessions.length - idx })
                              : t('sessionRoom', { name: s.room_name })}
                          </p>
                          <p className="text-muted-foreground mt-1 line-clamp-2 text-xs leading-5">
                            {s.first_message
                              ? trimTo(s.first_message, 60)
                              : t('emptyTranscript')}
                          </p>
                        </div>
                        <span
                          className={cn(
                            'mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                            s.ended_at
                              ? 'bg-muted text-muted-foreground'
                              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                          )}
                        >
                          {s.ended_at ? t('ended') : t('active')}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="rounded border px-1.5 py-0.5 font-mono uppercase tracking-wide">
                          {s.model_mode ?? 'auto'}
                        </span>
                        <span>{t('messageCount', { count: s.message_count })}</span>
                        <span className="ml-auto font-mono">{relative(s.started_at)}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          {/* Right column: transcript */}
          <section className="flex min-h-[50vh] flex-col">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Transcript
              </h2>
              {messagesLoading && (
                <span className="text-muted-foreground text-xs">{tc('loading')}</span>
              )}
            </div>
            <Separator className="mb-3" />

            <div className="flex max-h-[calc(100vh-180px)] flex-col overflow-y-auto pr-1">
              {!selectedId ? (
                <div className="mx-auto my-16 max-w-md rounded-xl border border-dashed p-8 text-center">
                  <p className="text-sm font-medium">{t('selectToView')}</p>
                </div>
              ) : messagesLoading ? (
                <div className="mx-auto my-16 text-sm">{tc('loading')}</div>
              ) : messagesError ? (
                <div className="border-destructive/40 mx-auto my-8 max-w-md rounded-lg border p-4 text-xs leading-5">
                  <p className="font-semibold">{t('sessionMissing')}</p>
                  <p className="mt-1 text-muted-foreground">{messagesError}</p>
                </div>
              ) : messagesData?.db_disabled ? (
                <div className="bg-muted/40 mx-auto my-8 max-w-md rounded-lg p-4 text-xs leading-5">
                  <p className="font-semibold">{t('dbDisabled')}</p>
                  <p className="mt-1 text-muted-foreground">{t('dbDisabledHint')}</p>
                  {messagesData?.reason && (
                    <p className="mt-2 truncate font-mono text-[10px] opacity-70">
                      {messagesData.reason}
                    </p>
                  )}
                </div>
              ) : (messagesData?.messages?.length ?? 0) === 0 ? (
                <div className="mx-auto my-16 max-w-md rounded-xl border border-dashed p-8 text-center">
                  <p className="text-sm font-medium">{t('emptyTranscript')}</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3 py-2">
                  {messagesData!.messages.map((m) => {
                    const isUser = m.role === 'user';
                    return (
                      <div
                        key={m.id}
                        className={cn('flex', isUser ? 'justify-end' : 'justify-start')}
                      >
                        <div
                          className={cn(
                            'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-6 shadow-sm',
                            isUser
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-secondary text-secondary-foreground'
                          )}
                        >
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider opacity-75">
                            {isUser ? t('user') : t('assistant')}
                          </p>
                          <p className="whitespace-pre-wrap break-words">
                            {m.content || (
                              <span className="italic opacity-60">
                                {t('emptyTranscript')}
                              </span>
                            )}
                          </p>
                          <p
                            className={cn(
                              'mt-1.5 text-right text-[10px] opacity-60',
                              isUser ? 'text-primary-foreground' : 'text-secondary-foreground'
                            )}
                          >
                            {relative(m.created_at)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  type McpServerConfig,
  loadMcpServersFromStorage,
  sanitizeMcpServers,
  saveMcpServersToStorage,
} from '@/lib/mcp-connectors';

function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `mcp_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `mcp_${Date.now()}`;
}

export function McpConnectorsPanel() {
  const t = useTranslations();
  const tm = useTranslations('mcp');
  const [servers, setServers] = useState<McpServerConfig[]>([]);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [auth, setAuth] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setServers(loadMcpServersFromStorage());
  }, []);

  function persist(next: McpServerConfig[]) {
    try {
      const cleaned = sanitizeMcpServers(next);
      saveMcpServersToStorage(cleaned);
      setServers(cleaned);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    }
  }

  function handleAdd(e: FormEvent) {
    e.preventDefault();
    setError('');
    const headers: Record<string, string> = {};
    if (auth.trim()) {
      headers.Authorization = auth.trim().startsWith('Bearer ')
        ? auth.trim()
        : `Bearer ${auth.trim()}`;
    }
    const entry: McpServerConfig = {
      id: newId(),
      name: name.trim() || 'MCP',
      url: url.trim(),
      enabled: true,
      headers,
    };
    try {
      persist([...servers, entry]);
      setName('');
      setUrl('');
      setAuth('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid connector');
    }
  }

  function toggleEnabled(id: string) {
    persist(servers.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)));
  }

  function removeServer(id: string) {
    persist(servers.filter((s) => s.id !== id));
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">{tm('title')}</h3>
        <p className="text-muted-foreground mt-1 text-xs leading-5">{tm('description')}</p>
      </div>

      {servers.length === 0 ? (
        <p className="text-muted-foreground text-xs leading-5">{tm('empty')}</p>
      ) : (
        <ul className="space-y-2">
          {servers.map((server) => (
            <li
              key={server.id}
              className="border-border flex flex-col gap-2 rounded-lg border p-2 text-xs"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{server.name}</p>
                  <p className="text-muted-foreground truncate font-mono">{server.url}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  onClick={() => removeServer(server.id)}
                >
                  {t('common.delete')}
                </Button>
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={server.enabled}
                  onChange={() => toggleEnabled(server.id)}
                />
                <span>{t('common.enabled')}</span>
              </label>
            </li>
          ))}
        </ul>
      )}

      <Separator />

      <form onSubmit={handleAdd} className="space-y-2">
        <input
          className="border-border bg-background w-full rounded-md border px-2 py-1.5 text-xs"
          placeholder={tm('namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="border-border bg-background w-full rounded-md border px-2 py-1.5 text-xs"
          placeholder={tm('urlPlaceholder')}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
        <input
          className="border-border bg-background w-full rounded-md border px-2 py-1.5 text-xs"
          placeholder={tm('authPlaceholder')}
          value={auth}
          onChange={(e) => setAuth(e.target.value)}
        />
        {error ? <p className="text-destructive text-xs">{error}</p> : null}
        <Button type="submit" size="sm" className="w-full">
          {tm('addButton')}
        </Button>
      </form>
    </div>
  );
}

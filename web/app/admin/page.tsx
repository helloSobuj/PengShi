'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

interface TavilyStatus {
  configured: boolean;
  enabled: boolean;
}

interface McpStatus {
  configured: boolean;
  count: number;
  path: string;
}

interface StorageStatus {
  writable: boolean;
  mode: 'file' | 'readonly';
  path: string;
  hint: string;
}

interface ConfigStatus {
  tavily: TavilyStatus;
  mcp: McpStatus;
  storage: StorageStatus;
  mcp_servers?: unknown[];
}

const MCP_EXAMPLE = `[
  {
    "id": "example",
    "name": "Example",
    "url": "https://example.com/sse",
    "enabled": true,
    "headers": {}
  }
]`;

export default function AdminPage() {
  const [isAuthed, setIsAuthed] = useState(false);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [config, setConfig] = useState<ConfigStatus | null>(null);
  const [tavilyKey, setTavilyKey] = useState('');
  const [tavilyEnabled, setTavilyEnabled] = useState(true);
  const [mcpJson, setMcpJson] = useState('[]');
  const [saving, setSaving] = useState(false);
  const [savingMcp, setSavingMcp] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveOk, setSaveOk] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const res = await fetch('/api/admin/config');
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
        setTavilyEnabled(data.tavily.enabled);
        setMcpJson(JSON.stringify(data.mcp_servers ?? [], null, 2));
        setIsAuthed(true);
      } else if (res.status === 401) {
        setIsAuthed(false);
      }
    } catch {
      setIsAuthed(false);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        setIsAuthed(true);
        await checkAuth();
      } else {
        const data = await res.json();
        setLoginError(data.error || 'Login failed');
      }
    } catch {
      setLoginError('Login failed');
    }
  }

  async function handleLogout() {
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setIsAuthed(false);
    setConfig(null);
    setTavilyKey('');
    setPassword('');
  }

  async function handleSave() {
    setSaving(true);
    setSaveMessage('');
    setSaveOk(false);
    try {
      const payload: { tavily: { enabled: boolean; api_key?: string } } = {
        tavily: { enabled: tavilyEnabled },
      };
      if (tavilyKey.trim()) {
        payload.tavily.api_key = tavilyKey.trim();
      }

      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setConfig(data);
        setSaveOk(true);
        setSaveMessage('Settings saved successfully.');
        if (tavilyKey.trim()) {
          setTavilyKey('');
        }
      } else {
        setSaveOk(false);
        setSaveMessage(typeof data.error === 'string' ? data.error : 'Failed to save settings.');
      }
    } catch {
      setSaveOk(false);
      setSaveMessage('Failed to save settings.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveMcp() {
    setSavingMcp(true);
    setSaveMessage('');
    setSaveOk(false);
    try {
      const parsed = JSON.parse(mcpJson);
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mcp_servers: parsed }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setConfig(data);
        setMcpJson(JSON.stringify(data.mcp_servers ?? [], null, 2));
        setSaveOk(true);
        setSaveMessage('MCP defaults saved to agent/data/mcp_servers.json.');
      } else {
        setSaveOk(false);
        setSaveMessage(
          typeof data.error === 'string' ? data.error : 'Failed to save MCP defaults.'
        );
      }
    } catch {
      setSaveOk(false);
      setSaveMessage('MCP JSON must be a valid array.');
    } finally {
      setSavingMcp(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!isAuthed) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="bg-card w-full max-w-sm space-y-6 rounded-xl border p-8 shadow-sm">
          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">Admin Panel</h1>
            <p className="text-muted-foreground text-sm">
              Enter the administrator password to continue.
            </p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-background focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-md border px-3 py-2 text-sm transition-colors outline-none focus-visible:ring-2"
                placeholder="Enter admin password"
                autoFocus
              />
              {loginError && <p className="text-destructive text-sm">{loginError}</p>}
            </div>
            <Button type="submit" className="w-full">
              Sign In
            </Button>
          </form>
        </div>
      </div>
    );
  }

  const readonly = config?.storage && !config.storage.writable;

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="flex items-center justify-between pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin Panel</h1>
          <p className="text-muted-foreground text-sm">
            Configure API keys and integrations for Echo.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          Sign Out
        </Button>
      </div>

      <Separator className="mb-6" />

      {readonly && (
        <div className="bg-muted/40 mb-6 rounded-xl border p-4 text-sm leading-6">
          <p className="font-medium">Production note</p>
          <p className="text-muted-foreground mt-1">
            This Vercel deployment cannot save keys to disk (read-only filesystem). Configure agent
            secrets instead: <code className="font-mono text-xs">TAVILY_API_KEY</code>,{' '}
            <code className="font-mono text-xs">MCP_SERVERS</code>.
          </p>
          <p className="text-muted-foreground mt-2">
            Example:{' '}
            <code className="font-mono text-xs">
              lk agent update-secrets --overwrite --secrets MCP_SERVERS=&apos;[...]&apos;
            </code>
          </p>
        </div>
      )}

      <div className="space-y-6">
        <section className="bg-card rounded-xl border p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Tavily Web Search</h2>
              <p className="text-muted-foreground text-sm">
                Enable Echo to search the web for current information using Tavily.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex size-2 rounded-full ${
                  config?.tavily.configured || readonly ? 'bg-green-500' : 'bg-muted-foreground/30'
                }`}
              />
              <span className="text-muted-foreground text-sm">
                {readonly
                  ? 'Set on agent secrets'
                  : config?.tavily.configured
                    ? 'Configured'
                    : 'Not set'}
              </span>
            </div>
          </div>

          <Separator className="my-4" />

          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="tavily-key" className="text-sm font-medium">
                API Key
              </label>
              <div className="flex gap-2">
                <input
                  id="tavily-key"
                  type="password"
                  value={tavilyKey}
                  onChange={(e) => setTavilyKey(e.target.value)}
                  disabled={readonly}
                  className="bg-background focus-visible:border-ring focus-visible:ring-ring/50 flex-1 rounded-md border px-3 py-2 text-sm transition-colors outline-none focus-visible:ring-2 disabled:opacity-50"
                  placeholder={
                    readonly
                      ? 'Managed via agent secrets'
                      : config?.tavily.configured
                        ? 'Leave blank to keep existing key'
                        : 'Paste your Tavily API key'
                  }
                />
              </div>
              <p className="text-muted-foreground text-xs">
                Get a free API key from{' '}
                <a
                  href="https://tavily.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground underline underline-offset-4"
                >
                  tavily.com
                </a>
                . Local saves go to <code className="font-mono">agent/data/api_config.json</code>.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Web Search Enabled</p>
                <p className="text-muted-foreground text-xs">
                  When disabled, Echo will not use Tavily even if a key is configured.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTavilyEnabled(!tavilyEnabled)}
                disabled={readonly}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  tavilyEnabled ? 'bg-primary' : 'bg-muted'
                }`}
                role="switch"
                aria-checked={tavilyEnabled}
              >
                <span
                  className={`inline-block size-4 rounded-full bg-white shadow-sm transition-transform ${
                    tavilyEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            {saveMessage && !savingMcp && (
              <span
                className={`max-w-md text-right text-sm ${
                  saveOk ? 'text-green-500' : 'text-destructive'
                }`}
              >
                {saveMessage}
              </span>
            )}
            <Button onClick={handleSave} disabled={saving || readonly}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </section>

        <section className="bg-card rounded-xl border p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">MCP defaults</h2>
              <p className="text-muted-foreground text-sm">
                Admin-default MCP servers for every Echo session. Users can still add personal
                connectors in Settings.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex size-2 rounded-full ${
                  config?.mcp.configured ? 'bg-green-500' : 'bg-muted-foreground/30'
                }`}
              />
              <span className="text-muted-foreground text-sm">
                {config?.mcp.configured ? `${config.mcp.count} configured` : 'None'}
              </span>
            </div>
          </div>

          <Separator className="my-4" />

          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground leading-6">
              In production, set the agent secret{' '}
              <code className="font-mono text-xs">MCP_SERVERS</code> to a JSON array. Locally you
              can save to <code className="font-mono text-xs">agent/data/mcp_servers.json</code>.
            </p>
            <pre className="bg-muted/50 overflow-x-auto rounded-lg border p-3 font-mono text-xs leading-5">
              {MCP_EXAMPLE}
            </pre>
            <textarea
              value={mcpJson}
              onChange={(e) => setMcpJson(e.target.value)}
              disabled={readonly}
              rows={10}
              className="bg-background focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-md border px-3 py-2 font-mono text-xs transition-colors outline-none focus-visible:ring-2 disabled:opacity-50"
            />
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            {saveMessage && savingMcp === false && saveMessage.includes('MCP') && (
              <span
                className={`max-w-md text-right text-sm ${
                  saveOk ? 'text-green-500' : 'text-destructive'
                }`}
              >
                {saveMessage}
              </span>
            )}
            <Button onClick={handleSaveMcp} disabled={savingMcp || readonly}>
              {savingMcp ? 'Saving...' : 'Save MCP defaults'}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}

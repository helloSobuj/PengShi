export const MCP_STORAGE_KEY = 'echo.mcp_servers';
export const MCP_ATTR_KEY = 'echo_mcp_servers';
export const MAX_USER_MCP_SERVERS = 10;
export const MAX_MCP_PAYLOAD_BYTES = 8_000;

export type McpServerConfig = {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  headers?: Record<string, string>;
};

export function sanitizeMcpServers(input: unknown): McpServerConfig[] {
  if (!Array.isArray(input)) {
    throw new Error('mcp_servers must be an array');
  }
  if (input.length > MAX_USER_MCP_SERVERS) {
    throw new Error(`At most ${MAX_USER_MCP_SERVERS} MCP servers allowed`);
  }
  const servers: McpServerConfig[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') {
      throw new Error('invalid MCP server entry');
    }
    const row = item as Record<string, unknown>;
    const id = String(row.id ?? '').trim();
    const name = String(row.name ?? id).trim();
    const url = String(row.url ?? '').trim();
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) {
      throw new Error(`invalid id: ${id}`);
    }
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`invalid url: ${url}`);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('url must be http(s)');
    }
    const enabled = row.enabled !== false;
    const headers: Record<string, string> = {};
    if (row.headers && typeof row.headers === 'object') {
      for (const [k, v] of Object.entries(row.headers as Record<string, unknown>)) {
        if (typeof k === 'string' && typeof v === 'string') {
          headers[k] = v;
        }
      }
    }
    servers.push({ id, name, url, enabled, headers });
  }
  const enabledOnly = servers.filter((s) => s.enabled);
  const payload = JSON.stringify(enabledOnly);
  if (new TextEncoder().encode(payload).length > MAX_MCP_PAYLOAD_BYTES) {
    throw new Error('MCP payload too large');
  }
  return servers;
}

export function loadMcpServersFromStorage(): McpServerConfig[] {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(MCP_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    return sanitizeMcpServers(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveMcpServersToStorage(servers: McpServerConfig[]): void {
  window.localStorage.setItem(MCP_STORAGE_KEY, JSON.stringify(servers));
}

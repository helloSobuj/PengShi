import fs from 'node:fs';
import path from 'node:path';
import { type McpServerConfig, sanitizeMcpServers } from '@/lib/mcp-connectors';

const DEFAULT_CONFIG_PATH = path.resolve(process.cwd(), '..', 'agent', 'data', 'api_config.json');
const DEFAULT_MCP_PATH = path.resolve(process.cwd(), '..', 'agent', 'data', 'mcp_servers.json');

export interface TavilyConfig {
  api_key?: string;
  enabled: boolean;
}

export interface ApiConfig {
  tavily?: TavilyConfig;
}

export interface MaskedTavilyStatus {
  configured: boolean;
  enabled: boolean;
}

export interface MaskedMcpStatus {
  configured: boolean;
  count: number;
  path: string;
}

export interface StorageStatus {
  writable: boolean;
  mode: 'file' | 'readonly';
  path: string;
  hint: string;
}

export interface MaskedConfig {
  tavily: MaskedTavilyStatus;
  mcp: MaskedMcpStatus;
  storage: StorageStatus;
}

export function getConfigPath(): string {
  return process.env.AGENT_CONFIG_PATH || DEFAULT_CONFIG_PATH;
}

export function getMcpConfigPath(): string {
  return process.env.AGENT_MCP_CONFIG_PATH || DEFAULT_MCP_PATH;
}

export function getStorageStatus(): StorageStatus {
  const filePath = getConfigPath();
  const onVercel = Boolean(process.env.VERCEL);

  if (onVercel || process.env.AGENT_CONFIG_READONLY === 'true') {
    return {
      writable: false,
      mode: 'readonly',
      path: filePath,
      hint: 'Production filesystem is read-only. Set agent secrets with lk agent update-secrets (TAVILY_API_KEY, MCP_SERVERS).',
    };
  }

  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.accessSync(dir, fs.constants.W_OK);
    return {
      writable: true,
      mode: 'file',
      path: filePath,
      hint: 'Keys are saved to agent/data for local development.',
    };
  } catch {
    return {
      writable: false,
      mode: 'readonly',
      path: filePath,
      hint: `Cannot write to ${filePath}. For production, set secrets on the LiveKit agent instead.`,
    };
  }
}

export function readConfig(): ApiConfig {
  const filePath = getConfigPath();
  try {
    if (!fs.existsSync(filePath)) {
      return {};
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) {
      return {};
    }
    return data as ApiConfig;
  } catch {
    return {};
  }
}

export function writeConfig(config: ApiConfig): void {
  const storage = getStorageStatus();
  if (!storage.writable) {
    throw new Error(storage.hint);
  }

  const filePath = getConfigPath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8');
}

export function readMcpServers(): McpServerConfig[] {
  const filePath = getMcpConfigPath();
  try {
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    return sanitizeMcpServers(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function writeMcpServers(servers: McpServerConfig[]): void {
  const storage = getStorageStatus();
  if (!storage.writable) {
    throw new Error(storage.hint);
  }
  const cleaned = sanitizeMcpServers(servers);
  const filePath = getMcpConfigPath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(cleaned, null, 2), 'utf-8');
}

export function getMaskedConfig(): MaskedConfig {
  const config = readConfig();
  return getMaskedConfigFrom(config);
}

export interface UpdateConfigPayload {
  tavily?: {
    api_key?: string;
    enabled?: boolean;
  };
  mcp_servers?: McpServerConfig[];
}

export function updateConfig(payload: UpdateConfigPayload): {
  config: ApiConfig;
  masked: MaskedConfig;
} {
  const current = readConfig();
  const next: ApiConfig = { ...current };

  if (payload.tavily) {
    const existing = next.tavily || { enabled: true };
    next.tavily = {
      ...existing,
      ...payload.tavily,
    };
    writeConfig(next);
  }

  if (payload.mcp_servers) {
    writeMcpServers(payload.mcp_servers);
  }

  return { config: next, masked: getMaskedConfigFrom(next) };
}

function getMaskedConfigFrom(config: ApiConfig): MaskedConfig {
  const tavily = config.tavily;
  const mcpServers = readMcpServers();
  return {
    tavily: {
      configured: Boolean(tavily?.api_key),
      enabled: tavily?.enabled ?? true,
    },
    mcp: {
      configured: mcpServers.length > 0,
      count: mcpServers.length,
      path: getMcpConfigPath(),
    },
    storage: getStorageStatus(),
  };
}

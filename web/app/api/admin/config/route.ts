import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/admin-auth';
import { getMaskedConfig, readMcpServers, updateConfig } from '@/lib/agent-config';
import { sanitizeMcpServers } from '@/lib/mcp-connectors';

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const masked = getMaskedConfig();
  const mcp_servers = readMcpServers();
  return NextResponse.json({ ...masked, mcp_servers });
}

export async function POST(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    tavily?: {
      api_key?: string;
      enabled?: boolean;
    };
    mcp_servers?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const errors: string[] = [];

  if (body.tavily) {
    if (body.tavily.enabled !== undefined && typeof body.tavily.enabled !== 'boolean') {
      errors.push('tavily.enabled must be a boolean');
    }
    if (body.tavily.api_key !== undefined && typeof body.tavily.api_key !== 'string') {
      errors.push('tavily.api_key must be a string');
    }
    if (body.tavily.api_key !== undefined && body.tavily.api_key.length > 500) {
      errors.push('tavily.api_key is too long');
    }
  }

  let mcpServers;
  if (body.mcp_servers !== undefined) {
    try {
      mcpServers = sanitizeMcpServers(body.mcp_servers);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : 'Invalid mcp_servers');
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join('; ') }, { status: 400 });
  }

  try {
    const result = updateConfig({
      tavily: body.tavily,
      mcp_servers: mcpServers,
    });
    return NextResponse.json({
      ...result.masked,
      mcp_servers: readMcpServers(),
    });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : 'Failed to save settings. Production uses LiveKit agent secrets instead of this panel.';
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

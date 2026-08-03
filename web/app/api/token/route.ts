import { NextResponse } from 'next/server';
import { AccessToken, type AccessTokenOptions, type VideoGrant } from 'livekit-server-sdk';
import { RoomConfiguration } from '@livekit/protocol';
import { MCP_ATTR_KEY, sanitizeMcpServers } from '@/lib/mcp-connectors';

type ConnectionDetails = {
  serverUrl: string;
  roomName: string;
  participantName: string;
  participantToken: string;
};

const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;
const AGENT_NAME = process.env.AGENT_NAME ?? 'echo-agent';

// don't cache the results
export const revalidate = 0;

export async function POST(req: Request) {
  // Personal MVP: allow token minting in production when explicitly enabled.
  // For a public multi-user product, replace this with real authentication.
  const allowPublic =
    process.env.NODE_ENV === 'development' ||
    process.env.ALLOW_PUBLIC_TOKEN === 'true' ||
    process.env.IS_VERCEL_PREVIEW === 'true';

  if (!allowPublic) {
    return new NextResponse(
      'Token endpoint locked. Set ALLOW_PUBLIC_TOKEN=true for personal production use, or add auth.',
      { status: 403 }
    );
  }

  try {
    if (LIVEKIT_URL === undefined) {
      throw new Error(
        'LIVEKIT_URL is not set. Configure it in web/.env.local or enable NEXT_PUBLIC_USE_SANDBOX for demos.'
      );
    }
    if (API_KEY === undefined) {
      throw new Error('LIVEKIT_API_KEY is not set. Configure it in web/.env.local.');
    }
    if (API_SECRET === undefined) {
      throw new Error('LIVEKIT_API_SECRET is not set. Configure it in web/.env.local.');
    }

    // Merge client room_config with required agent dispatch for echo-agent.
    let incoming: Record<string, unknown> = {};
    let mcpServersRaw: unknown = [];
    try {
      const body = await req.json();
      if (body?.room_config && typeof body.room_config === 'object') {
        incoming = body.room_config as Record<string, unknown>;
      }
      if (body?.mcp_servers !== undefined) {
        mcpServersRaw = body.mcp_servers;
      }
    } catch {
      // empty body is fine
    }

    let mcpAttributes: Record<string, string> | undefined;
    try {
      const enabled = sanitizeMcpServers(mcpServersRaw).filter((s) => s.enabled);
      if (enabled.length > 0) {
        mcpAttributes = { [MCP_ATTR_KEY]: JSON.stringify(enabled) };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid mcp_servers';
      return new NextResponse(message, { status: 400 });
    }

    const agents = Array.isArray(incoming.agents) ? incoming.agents : [];
    if (agents.length === 0) {
      agents.push({ agent_name: AGENT_NAME });
    }

    const roomConfig = RoomConfiguration.fromJson(
      { ...incoming, agents },
      { ignoreUnknownFields: true }
    );

    const participantName = 'user';
    const participantIdentity = `echo_user_${Math.floor(Math.random() * 10_000)}`;
    const roomName = `echo_room_${Math.floor(Math.random() * 10_000)}`;

    const participantToken = await createParticipantToken(
      {
        identity: participantIdentity,
        name: participantName,
        ...(mcpAttributes ? { attributes: mcpAttributes } : {}),
      },
      roomName,
      roomConfig
    );

    const data: ConnectionDetails = {
      serverUrl: LIVEKIT_URL,
      roomName,
      participantName,
      participantToken,
    };
    const headers = new Headers({
      'Cache-Control': 'no-store',
    });
    return NextResponse.json(data, { headers });
  } catch (error) {
    if (error instanceof Error) {
      console.error(error);
      return new NextResponse(error.message, { status: 500 });
    }
  }
}

function createParticipantToken(
  userInfo: AccessTokenOptions,
  roomName: string,
  roomConfig: RoomConfiguration | undefined
): Promise<string> {
  const at = new AccessToken(API_KEY, API_SECRET, {
    ...userInfo,
    ttl: '15m',
  });
  const grant: VideoGrant = {
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
  };
  at.addGrant(grant);

  if (roomConfig) {
    at.roomConfig = roomConfig;
  }

  return at.toJwt();
}

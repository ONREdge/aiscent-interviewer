import { NextResponse } from 'next/server';
import { AccessToken, type VideoGrant } from 'livekit-server-sdk';
import { RoomConfiguration } from '@livekit/protocol';

const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;

export const revalidate = 0;

export type AiscentConnectionDetails = {
  serverUrl: string;
  roomName: string;
  participantName: string;
  participantToken: string;
};

export async function POST(req: Request) {
  try {
    if (!LIVEKIT_URL) throw new Error('LIVEKIT_URL is not defined');
    if (!API_KEY) throw new Error('LIVEKIT_API_KEY is not defined');
    if (!API_SECRET) throw new Error('LIVEKIT_API_SECRET is not defined');

    const text = await req.text();
    const body = text ? JSON.parse(text) : {};
    const agentName: string | undefined =
      body?.room_config?.agents?.[0]?.agent_name ?? 'aiscent';
    const sessionUUID: string | null = body?.session_uuid || null;

    const participantName = 'aiscent-participant';
    // Embed session_uuid into the identity so the agent can recover both the
    // dispatch type AND the session_uuid from participant.identity even if the
    // JWT metadata payload arrives late (or empty) on cold worker dispatch.
    const identitySuffix = sessionUUID ?? `r${Math.floor(Math.random() * 1_000_000)}`;
    const participantIdentity = `aiscent_user_${identitySuffix}`;
    const roomName = `aiscent_room_${Math.floor(Math.random() * 10_000)}`;

    const metadata: Record<string, string> = {
      aiscent_type: 'true',
      tier: 'tier1',
      timestamp: new Date().toISOString(),
    };

    if (sessionUUID) {
      metadata.session_uuid = sessionUUID;
    }

    const at = new AccessToken(API_KEY, API_SECRET, {
      identity: participantIdentity,
      name: participantName,
      ttl: '20m',
      metadata: JSON.stringify(metadata),
    });

    const grant: VideoGrant = {
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canPublishData: true,
      canSubscribe: true,
      canUpdateOwnMetadata: true,
    };
    at.addGrant(grant);

    if (agentName) {
      at.roomConfig = new RoomConfiguration({
        agents: [{ agentName }],
      });
    }

    const participantToken = await at.toJwt();

    console.log('[AiscentConn] minted', {
      roomName,
      participantIdentity,
      agentName: agentName ?? null,
      sessionUUID,
    });

    return NextResponse.json(
      {
        serverUrl: LIVEKIT_URL,
        roomName,
        participantToken,
        participantName,
      } satisfies AiscentConnectionDetails,
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    if (error instanceof Error) {
      console.error('[Aiscent Connection] Error:', error);
      return new NextResponse(error.message, { status: 500 });
    }
    return new NextResponse('Unknown error', { status: 500 });
  }
}

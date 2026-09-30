import { useCallback, useRef, useState } from 'react';
import { decodeJwt } from 'jose';
import type { AiscentConnectionDetails } from '@/app/api/aiscent-connection-details/route';
import type { AiscentIdentity } from '@/components/aiscent/aiscent-identity-form';

const ONE_MINUTE_IN_MILLISECONDS = 60 * 1000;

function generateSessionId(): string {
  return `aiscent-${Math.floor(Math.random() * 1_000_000)}-${Date.now()}`;
} 

export default function useAiscentConnectionDetails() {
  const [connectionDetails, setConnectionDetails] =
    useState<AiscentConnectionDetails | null>(null);
  const sessionIdRef = useRef<string>(generateSessionId());
  // Keep the last-submitted identity so mid-session reconnects (token expiry,
  // WebSocket drops handled by `existingOrRefreshConnectionDetails`) re-mint
  // the JWT with the same identity metadata. Without this, a reconnect would
  // clobber the participant.metadata the agent relies on.
  const identityRef = useRef<AiscentIdentity | null>(null);

  const fetchConnectionDetails = useCallback(
    async (identity: AiscentIdentity | null) => {
      const sessionId = sessionIdRef.current;
      const url = new URL(
        '/api/aiscent-connection-details',
        window.location.origin,
      );

      console.log('[Aiscent Connection] Fetching connection details for session:', sessionId);

      try {
        const res = await fetch(url.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_uuid: sessionId,
            room_config: { agents: [{ agent_name: 'aiscent' }] },
            identity: identity ?? undefined,
          }),
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`Server returned ${res.status}: ${errorText}`);
        }

        const data: AiscentConnectionDetails = await res.json();
        console.log('[Aiscent Connection] Connection details received:', {
          serverUrl: data.serverUrl,
          roomName: data.roomName,
          sessionId,
          hasToken: !!data.participantToken,
        });
        setConnectionDetails(data);
        return data;
      } catch (error) {
        console.error('[Aiscent Connection] Error fetching connection details:', error);
        throw new Error('Error fetching aiscent connection details');
      }
    },
    [],
  );

  const isConnectionDetailsExpired = useCallback(() => {
    const token = connectionDetails?.participantToken;
    if (!token) return true;

    const jwtPayload = decodeJwt(token);
    if (!jwtPayload.exp) return true;

    const expiresAt = new Date(jwtPayload.exp * 1000 - ONE_MINUTE_IN_MILLISECONDS);
    return expiresAt <= new Date();
  }, [connectionDetails?.participantToken]);

  // Called once when the user submits the identity form. Generates a fresh
  // session id so restarts get a clean UUID + a fresh LiveKit room, and mints
  // the token with the identity payload attached to the JWT metadata.
  const startWithIdentity = useCallback(
    async (identity: AiscentIdentity) => {
      identityRef.current = identity;
      sessionIdRef.current = generateSessionId();
      setConnectionDetails(null);
      return fetchConnectionDetails(identity);
    },
    [fetchConnectionDetails],
  );

  // Used by the LiveKit disconnect handler and the "Start a new interview"
  // restart path. Deliberately does NOT rotate `sessionIdRef` so the
  // aiscent-complete SSE stays subscribed to the current session — this is
  // what lets a late-arriving ascent-position payload (e.g. LiveKit drops
  // before the agent's POST /aiscent-complete lands on our SSE) still reach
  // `handleComplete`. A fresh session UUID is minted exclusively in
  // `startWithIdentity`, which fires when the user submits the identity form
  // for a new interview.
  const refreshConnectionDetails = useCallback(async () => {
    identityRef.current = null;
    setConnectionDetails(null);
    return null;
  }, []);

  // Used by the live-connect useEffect in aiscent-app.tsx. If the current
  // token is still valid we hand it back; otherwise we re-mint with whatever
  // identity was last submitted (mid-session reconnect).
  const existingOrRefreshConnectionDetails = useCallback(async () => {
    if (isConnectionDetailsExpired() || !connectionDetails) {
      return fetchConnectionDetails(identityRef.current);
    }
    return connectionDetails;
  }, [connectionDetails, fetchConnectionDetails, isConnectionDetailsExpired]);

  return {
    connectionDetails,
    sessionUUID: sessionIdRef.current,
    startWithIdentity,
    refreshConnectionDetails,
    existingOrRefreshConnectionDetails,
  };
}

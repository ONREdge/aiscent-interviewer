import { useCallback, useEffect, useRef, useState } from 'react';
import { decodeJwt } from 'jose';
import type { AiscentConnectionDetails } from '@/app/api/aiscent-connection-details/route';

const ONE_MINUTE_IN_MILLISECONDS = 60 * 1000;

function generateSessionId(): string {
  return `aiscent-${Math.floor(Math.random() * 1_000_000)}-${Date.now()}`;
}

export default function useAiscentConnectionDetails() {
  const [connectionDetails, setConnectionDetails] =
    useState<AiscentConnectionDetails | null>(null);
  const sessionIdRef = useRef<string>(generateSessionId());

  const fetchConnectionDetails = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    const url = new URL('/api/aiscent-connection-details', window.location.origin);

    console.log('[Aiscent Connection] Fetching connection details for session:', sessionId);

    try {
      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_uuid: sessionId,
          room_config: { agents: [{ agent_name: 'aiscent' }] },
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
  }, []);

  useEffect(() => {
    fetchConnectionDetails();
  }, [fetchConnectionDetails]);

  const isConnectionDetailsExpired = useCallback(() => {
    const token = connectionDetails?.participantToken;
    if (!token) return true;

    const jwtPayload = decodeJwt(token);
    if (!jwtPayload.exp) return true;

    const expiresAt = new Date(jwtPayload.exp * 1000 - ONE_MINUTE_IN_MILLISECONDS);
    return expiresAt <= new Date();
  }, [connectionDetails?.participantToken]);

  const refreshConnectionDetails = useCallback(async () => {
    sessionIdRef.current = generateSessionId();
    setConnectionDetails(null);
    return fetchConnectionDetails();
  }, [fetchConnectionDetails]);

  const existingOrRefreshConnectionDetails = useCallback(async () => {
    if (isConnectionDetailsExpired() || !connectionDetails) {
      return fetchConnectionDetails();
    }
    return connectionDetails;
  }, [connectionDetails, fetchConnectionDetails, isConnectionDetailsExpired]);

  return {
    connectionDetails,
    sessionUUID: sessionIdRef.current,
    refreshConnectionDetails,
    existingOrRefreshConnectionDetails,
  };
}

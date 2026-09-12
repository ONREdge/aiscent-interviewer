import { useEffect, useRef } from 'react';

/**
 * SSE hook that listens for "advance to next camp" events from the
 * AiscentInterviewer agent, relayed through the Express server.
 *
 * The callback is held in a ref so that state changes never cause the SSE
 * connection to reconnect.
 */
export function useAiscentAdvance(
  sessionUUID: string | null,
  onAdvance: (campId: string | null) => void
) {
  const callbackRef = useRef(onAdvance);
  useEffect(() => {
    callbackRef.current = onAdvance;
  });

  useEffect(() => {
    if (!sessionUUID) {
      console.log('[Aiscent Advance] No session_uuid provided, SSE not initialized');
      return;
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
    const streamUrl = `${apiUrl}/api/aiscent-advance/stream?session_uuid=${sessionUUID}`;

    console.log(`[Aiscent Advance] Initializing SSE connection for session ${sessionUUID}`);

    const eventSource = new EventSource(streamUrl);

    eventSource.onopen = () => {
      console.log(`[Aiscent Advance] SSE connected for session ${sessionUUID}`);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'connected') {
          console.log('[Aiscent Advance] SSE connection confirmed');
        } else if (data.type === 'advance') {
          console.log(
            `[Aiscent Advance] Advance event received for session ${data.session_uuid} camp=${data.camp_id ?? 'unknown'}`
          );
          callbackRef.current(data.camp_id ?? null);
        }
      } catch (error) {
        console.error('[Aiscent Advance] Error parsing SSE message:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('[Aiscent Advance] SSE connection error:', error);
    };

    return () => {
      console.log(`[Aiscent Advance] Closing SSE connection for session ${sessionUUID}`);
      eventSource.close();
    };
  }, [sessionUUID]);
}

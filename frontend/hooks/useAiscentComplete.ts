import { useEffect, useRef } from 'react';
import type { AscentPosition } from '@/lib/aiscent-camps';

export type AiscentCompletePayload = {
  session_uuid: string;
  end_reason: string | null;
  ascent_position: AscentPosition | null;
};

/**
 * SSE hook that listens for the "session complete" event from the
 * AiscentInterviewer agent, relayed through the Express server. The payload
 * carries the fully-assembled Ascent Position so the frontend can render the
 * end-of-session view.
 */
export function useAiscentComplete(
  sessionUUID: string | null,
  onComplete: (payload: AiscentCompletePayload) => void
) {
  const callbackRef = useRef(onComplete);
  useEffect(() => {
    callbackRef.current = onComplete;
  });

  useEffect(() => {
    if (!sessionUUID) {
      console.log('[Aiscent Complete] No session_uuid provided, SSE not initialized');
      return;
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
    const streamUrl = `${apiUrl}/api/aiscent-complete/stream?session_uuid=${sessionUUID}`;

    console.log(`[Aiscent Complete] Initializing SSE connection for session ${sessionUUID}`);

    const eventSource = new EventSource(streamUrl);

    eventSource.onopen = () => {
      console.log(`[Aiscent Complete] SSE connected for session ${sessionUUID}`);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'connected') {
          console.log('[Aiscent Complete] SSE connection confirmed');
        } else if (data.type === 'complete') {
          console.log(
            `[Aiscent Complete] Complete event received for session ${data.session_uuid} (end_reason=${data.end_reason})`
          );
          callbackRef.current({
            session_uuid: data.session_uuid,
            end_reason: data.end_reason ?? null,
            ascent_position: data.ascent_position ?? null,
          });
        }
      } catch (error) {
        console.error('[Aiscent Complete] Error parsing SSE message:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('[Aiscent Complete] SSE connection error:', error);
    };

    return () => {
      console.log(`[Aiscent Complete] Closing SSE connection for session ${sessionUUID}`);
      eventSource.close();
    };
  }, [sessionUUID]);
}

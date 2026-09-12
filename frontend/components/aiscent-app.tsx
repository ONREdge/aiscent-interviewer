'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Room, RoomEvent } from 'livekit-client';
import { motion } from 'motion/react';
import { RoomAudioRenderer, RoomContext, StartAudio } from '@livekit/components-react';
import { toastAlert } from '@/components/alert-toast';
import { Toaster } from '@/components/ui/sonner';
import { AiscentWelcome } from '@/components/aiscent/aiscent-welcome';
import { AiscentSessionView } from '@/components/aiscent/aiscent-session-view';
import { AiscentAscentPosition } from '@/components/aiscent/aiscent-ascent-position';
import { AiscentMountainRidges } from '@/components/aiscent/aiscent-mountain-ridges';
import useAiscentConnectionDetails from '@/hooks/useAiscentConnectionDetails';
import { useAiscentAdvance } from '@/hooks/useAiscentAdvance';
import { useAiscentComplete, type AiscentCompletePayload } from '@/hooks/useAiscentComplete';
import {
  AISCENT_CAMP_ORDER,
  nextCampId,
  type AiscentCampId,
  type AscentPosition,
} from '@/lib/aiscent-camps';

const MotionAiscentWelcome = motion.create(AiscentWelcome);

type SessionPhase = 'welcome' | 'live' | 'ascent-position';

export function AiscentApp() {
  const room = useMemo(() => new Room(), []);
  const [phase, setPhase] = useState<SessionPhase>('welcome');
  const [activeCampId, setActiveCampId] = useState<AiscentCampId | null>(null);
  const [completedCampIds, setCompletedCampIds] = useState<AiscentCampId[]>([]);
  const [ascentPosition, setAscentPosition] = useState<AscentPosition | null>(null);
  const [endReason, setEndReason] = useState<string | null>(null);

  const activeCampIdRef = useRef<AiscentCampId | null>(activeCampId);
  useEffect(() => {
    activeCampIdRef.current = activeCampId;
  }, [activeCampId]);

  const {
    connectionDetails,
    sessionUUID,
    refreshConnectionDetails,
    existingOrRefreshConnectionDetails,
  } = useAiscentConnectionDetails();

  const handleAdvance = useCallback((incomingCampId: string | null) => {
    // `camp_id` from the SSE is the camp that was JUST scored (the source of
    // the advance). We move activeCamp to the next one after that. If for some
    // reason the id doesn't parse, fall back to advancing from whatever we
    // currently think is active.
    const scored =
      incomingCampId && (AISCENT_CAMP_ORDER as string[]).includes(incomingCampId)
        ? (incomingCampId as AiscentCampId)
        : activeCampIdRef.current;

    if (scored) {
      setCompletedCampIds((prev) =>
        prev.includes(scored) ? prev : [...prev, scored]
      );
    }
    const next = nextCampId(scored);
    setActiveCampId(next ?? scored ?? null);
  }, []);

  const handleComplete = useCallback(
    (payload: AiscentCompletePayload) => {
      setAscentPosition(payload.ascent_position);
      setEndReason(payload.end_reason);
      setPhase('ascent-position');
      // Disconnect from LiveKit — the interview is over.
      try {
        room.disconnect();
      } catch {
        // Ignore — RoomEvent.Disconnected will fire and clean state below.
      }
    },
    [room]
  );

  useAiscentAdvance(sessionUUID, handleAdvance);
  useAiscentComplete(sessionUUID, handleComplete);

  const handleRestart = useCallback(() => {
    setPhase('welcome');
    setActiveCampId(null);
    setCompletedCampIds([]);
    setAscentPosition(null);
    setEndReason(null);
    refreshConnectionDetails();
  }, [refreshConnectionDetails]);

  const handleEndInterview = useCallback(() => {
    try {
      room.disconnect();
    } catch {
      // No-op — Disconnected event drives state below.
    }
  }, [room]);

  useEffect(() => {
    const onDisconnected = () => {
      // If we already surfaced the Ascent Position, stay there.
      setPhase((current) => {
        if (current === 'ascent-position') return current;
        // If we're mid-session and the server hasn't yet emitted a complete,
        // treat the disconnect as an end-of-session and let the SSE complete
        // event (fired from the agent's participant_disconnected handler)
        // deliver the partial payload. Meanwhile, drop back to welcome so the
        // user isn't stuck on the live view.
        return 'welcome';
      });
      setActiveCampId(null);
      setCompletedCampIds([]);
      refreshConnectionDetails();
    };
    const onMediaDevicesError = (error: Error) => {
      toastAlert({
        title:
          'Encountered an error with your media devices. Please check your browser settings and try again.',
        description: `${error.name}: ${error.message}`,
      });
    };
    room.on(RoomEvent.MediaDevicesError, onMediaDevicesError);
    room.on(RoomEvent.Disconnected, onDisconnected);
    return () => {
      room.off(RoomEvent.Disconnected, onDisconnected);
      room.off(RoomEvent.MediaDevicesError, onMediaDevicesError);
    };
  }, [room, refreshConnectionDetails]);

  useEffect(() => {
    let aborted = false;
    if (phase === 'live' && room.state === 'disconnected') {
      Promise.all([
        room.localParticipant.setMicrophoneEnabled(true),
        existingOrRefreshConnectionDetails().then((cd) => {
          if (cd?.serverUrl && cd?.participantToken) {
            return room.connect(cd.serverUrl, cd.participantToken);
          }
          throw new Error('Failed to obtain valid connection details.');
        }),
      ]).catch((error) => {
        if (aborted) return;
        toastAlert({
          title:
            'Sorry, there was an error connecting. Please refresh the page and try again.',
          description: `${error.name}: ${error.message}`,
        });
      });
    }
    return () => {
      aborted = true;
    };
  }, [room, phase, existingOrRefreshConnectionDetails]);

  const handleStart = useCallback(() => {
    setActiveCampId('A');
    setPhase('live');
  }, []);

  if (!connectionDetails && phase !== 'ascent-position') {
    return (
      <main
        className="fixed inset-0 flex items-center justify-center overflow-hidden"
        style={{ background: '#F7F5F1' }}
      >
        <AiscentMountainRidges />
        <div
          className="relative flex flex-col items-center gap-4"
          style={{ color: '#1B3B72' }}
        >
          <div
            className="animate-spin"
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              border: '3px solid rgba(21,101,226,0.18)',
              borderTopColor: '#1565E2',
            }}
          />
          <p
            style={{
              fontFamily: "var(--font-space-grotesk), sans-serif",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 2.4,
              color: '#1B3B72',
            }}
          >
            PREPARING YOUR ROUTE…
          </p>
        </div>
      </main>
    );
  }

  const showWelcome = phase === 'welcome';
  const showLive = phase === 'live';
  const showAscentPosition = phase === 'ascent-position' && ascentPosition !== null;

  return (
    <main className="relative min-h-screen">
      {showAscentPosition && ascentPosition ? (
        <AiscentAscentPosition
          ascentPosition={ascentPosition}
          endReason={endReason}
          onRestart={handleRestart}
        />
      ) : (
        <>
          <MotionAiscentWelcome
            key="aiscent-welcome"
            onStart={handleStart}
            disabled={!showWelcome}
            initial={{ opacity: 1 }}
            animate={{ opacity: showWelcome ? 1 : 0 }}
            transition={{ duration: 0.4, ease: 'linear', delay: showWelcome ? 0 : 0.3 }}
            className={showWelcome ? '' : 'pointer-events-none'}
          />

          <RoomContext.Provider value={room}>
            <RoomAudioRenderer />
            <StartAudio label="Start Audio" />

            <motion.div
              key="aiscent-session"
              initial={{ opacity: 0 }}
              animate={{ opacity: showLive ? 1 : 0 }}
              transition={{ duration: 0.4, ease: 'linear', delay: showLive ? 0.3 : 0 }}
              className={`fixed inset-0 z-20 ${showLive ? '' : 'pointer-events-none'}`}
            >
              {showLive && (
                <AiscentSessionView
                  activeCampId={activeCampId}
                  completedCampIds={completedCampIds}
                  onEndInterview={handleEndInterview}
                />
              )}
            </motion.div>
          </RoomContext.Provider>
        </>
      )}

      <Toaster />
    </main>
  );
}

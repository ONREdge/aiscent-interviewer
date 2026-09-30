'use client';

import { useEffect, useRef } from 'react';
import { useLocalParticipant, useVoiceAssistant } from '@livekit/components-react';

const UNMUTE_DEBOUNCE_MS = 200; 

export function AiscentAutoMute() {
  const { state } = useVoiceAssistant();
  const { localParticipant, microphoneTrack } = useLocalParticipant();
  const userMutedRef = useRef(false);
  const lastAutoMutedRef = useRef(false);

  const micMuted = microphoneTrack?.isMuted ?? false;

  // Latch explicit user mute: if the mic is muted during `listening` and we
  // did NOT auto-mute (i.e. the last auto-toggle was an unmute), the user did
  // it via the control bar. Clear the latch as soon as they unmute themselves.
  useEffect(() => {
    if (state !== 'listening') return;
    if (micMuted && !lastAutoMutedRef.current) {
      userMutedRef.current = true;
    } else if (!micMuted) {
      userMutedRef.current = false;
    }
  }, [state, micMuted]);

  useEffect(() => {
    if (!localParticipant) return;

    if (state === 'speaking' || state === 'thinking') {
      lastAutoMutedRef.current = true;
      localParticipant.setMicrophoneEnabled(false).catch(() => {});
      return;
    }

    if (state === 'listening') {
      // Debounce the unmute so a brief TTS tail-end isn't captured after
      // the 'speaking' -> 'listening' transition.
      let cancelled = false;
      const t = setTimeout(() => {
        if (cancelled) return;
        if (userMutedRef.current) return;
        lastAutoMutedRef.current = false;
        localParticipant.setMicrophoneEnabled(true).catch(() => {});
      }, UNMUTE_DEBOUNCE_MS);
      return () => {
        cancelled = true;
        clearTimeout(t);
      };
    }
  }, [state, localParticipant]);

  return null;
}

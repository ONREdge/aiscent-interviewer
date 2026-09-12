'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Track } from 'livekit-client';
import {
  BarVisualizer,
  useLocalParticipant,
  useTrackToggle,
  useVoiceAssistant,
} from '@livekit/components-react';
import {
  ChatTextIcon,
  DotsSixVerticalIcon,
  MicrophoneIcon,
  MicrophoneSlashIcon,
  SpinnerIcon,
} from '@phosphor-icons/react/dist/ssr';
import { ChatInput } from '@/components/livekit/chat/chat-input';
import useChatAndTranscription from '@/hooks/useChatAndTranscription';

interface Position {
  x: number;
  y: number;
}

const AGENT_STATE_COLOR: Record<string, string> = {
  listening: '#0E8E8C',
  thinking: '#C9A227',
  speaking: '#1565E2',
};

const AGENT_STATE_LABEL: Record<string, string> = {
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
};

export function AiscentControlBar() {
  const { state: agentState } = useVoiceAssistant();
  const { localParticipant, microphoneTrack } = useLocalParticipant();
  const { send } = useChatAndTranscription();
  const [chatOpen, setChatOpen] = useState(false);

  const microphoneToggle = useTrackToggle({ source: Track.Source.Microphone });

  const micTrackRef = useMemo(
    () => ({
      participant: localParticipant,
      source: Track.Source.Microphone,
      publication: microphoneTrack,
    }),
    [localParticipant, microphoneTrack]
  );

  const [pos, setPos] = useState<Position | null>(null);
  const dragState = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest('button, input')) return;
      e.preventDefault();
      const rect = barRef.current?.getBoundingClientRect();
      const currentX = rect?.left ?? pos?.x ?? window.innerWidth / 2 - 120;
      const currentY = rect?.top ?? pos?.y ?? window.innerHeight - 80;
      dragState.current = {
        startX: e.clientX,
        startY: e.clientY,
        originX: currentX,
        originY: currentY,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [pos]
  );

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    const rect = barRef.current?.getBoundingClientRect();
    const barW = rect?.width ?? 240;
    const barH = rect?.height ?? 64;
    setPos({
      x: Math.max(0, Math.min(window.innerWidth - barW, dragState.current.originX + dx)),
      y: Math.max(0, Math.min(window.innerHeight - barH, dragState.current.originY + dy)),
    });
  }, []);

  const onPointerUp = useCallback(() => {
    dragState.current = null;
  }, []);

  useEffect(() => {
    if (!pos) return;
    const handle = () => {
      setPos((prev) => {
        if (!prev) return prev;
        const rect = barRef.current?.getBoundingClientRect();
        const barW = rect?.width ?? 240;
        const barH = rect?.height ?? 64;
        return {
          x: Math.max(0, Math.min(window.innerWidth - barW, prev.x)),
          y: Math.max(0, Math.min(window.innerHeight - barH, prev.y)),
        };
      });
    };
    window.addEventListener('resize', handle);
    return () => window.removeEventListener('resize', handle);
  }, [pos]);

  const handleSendMessage = async (message: string) => {
    await send(message);
  };

  const isAgentActive =
    agentState === 'listening' || agentState === 'thinking' || agentState === 'speaking';

  const positionStyle: React.CSSProperties = pos
    ? { position: 'fixed', left: pos.x, top: pos.y, transform: 'none' }
    : {
        position: 'fixed',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
      };

  const MicIcon = microphoneToggle.pending
    ? SpinnerIcon
    : microphoneToggle.enabled
    ? MicrophoneIcon
    : MicrophoneSlashIcon;

  return (
    <div
      ref={barRef}
      className="z-50"
      style={positionStyle}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div
        className="aiscent-control-bar"
        style={{
          background: 'rgba(255,255,255,0.85)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          border: '1px solid #E4DFD6',
          borderRadius: 999,
          padding: '8px 10px',
          boxShadow: '0 12px 30px rgba(27,59,114,0.16)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          minWidth: 200,
          maxWidth: 'calc(100vw - 24px)',
        }}
      >
        {chatOpen && (
          <div
            style={{
              width: 'min(260px, calc(100vw - 48px))',
              padding: '4px 6px 0',
            }}
          >
            <ChatInput
              onSend={handleSendMessage}
              disabled={!isAgentActive}
              className="w-full"
            />
          </div>
        )}

        <div
          className="aiscent-control-bar-inner"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          {/* Drag handle */}
          <div
            className="cursor-grab active:cursor-grabbing select-none"
            style={{ color: 'rgba(27,59,114,0.35)', padding: '0 2px' }}
            title="Drag to move"
          >
            <DotsSixVerticalIcon weight="bold" size={16} />
          </div>

          {/* Microphone toggle pill */}
          <button
            type="button"
            aria-label={microphoneToggle.enabled ? 'Mute microphone' : 'Unmute microphone'}
            disabled={microphoneToggle.pending}
            onClick={() => microphoneToggle.toggle()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 14px',
              borderRadius: 999,
              border: 'none',
              cursor: microphoneToggle.pending ? 'wait' : 'pointer',
              background: microphoneToggle.enabled ? '#1B3B72' : '#C13020',
              color: '#FFFFFF',
              fontFamily: 'var(--font-space-grotesk), sans-serif',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 0.4,
              boxShadow: microphoneToggle.enabled
                ? '0 6px 16px rgba(27,59,114,0.28)'
                : '0 6px 16px rgba(193,48,32,0.32)',
            }}
          >
            <MicIcon weight="bold" size={16} />
            <BarVisualizer
              barCount={3}
              trackRef={micTrackRef}
              options={{ minHeight: 5 }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 2,
                height: 14,
              }}
            >
              <span
                style={{
                  width: 2,
                  height: '100%',
                  borderRadius: 2,
                  background: microphoneToggle.enabled
                    ? 'rgba(255,255,255,0.9)'
                    : 'rgba(255,255,255,0.6)',
                }}
              />
            </BarVisualizer>
          </button>

          {/* Chat toggle */}
          <button
            type="button"
            aria-label="Toggle chat"
            disabled={!isAgentActive}
            onClick={() => setChatOpen((v) => !v)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 36,
              borderRadius: 999,
              border: '1px solid #E4DFD6',
              background: chatOpen ? '#1B3B72' : '#FFFFFF',
              color: chatOpen ? '#FFFFFF' : '#1B3B72',
              cursor: isAgentActive ? 'pointer' : 'not-allowed',
              opacity: isAgentActive ? 1 : 0.45,
              transition: 'background 0.15s ease, color 0.15s ease',
            }}
          >
            <ChatTextIcon weight="bold" size={16} />
          </button>

          {/* Agent state pill */}
          {isAgentActive && (
            <div
              className="aiscent-agent-state-pill"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 12px 4px 10px',
                borderRadius: 999,
                background: 'rgba(21,101,226,0.06)',
                border: '1px solid rgba(21,101,226,0.18)',
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background:
                    AGENT_STATE_COLOR[agentState as string] ?? '#1B3B72',
                  animation: 'aiscentNodeBreathe 1.6s ease-in-out infinite',
                }}
              />
              <span
                style={{
                  fontFamily: 'var(--font-space-grotesk), sans-serif',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 0.6,
                  color: '#1B3B72',
                }}
              >
                {AGENT_STATE_LABEL[agentState as string] ?? agentState}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

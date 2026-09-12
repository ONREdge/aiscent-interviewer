'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { ConnectionState } from 'livekit-client';
import {
  useConnectionState,
  useVoiceAssistant,
  type AgentState,
} from '@livekit/components-react';
import { AiscentControlBar } from '@/components/aiscent/aiscent-control-bar';
import { AiscentMountainRidges } from '@/components/aiscent/aiscent-mountain-ridges';
import { AiscentRouteMap } from '@/components/aiscent/aiscent-route-map';
import { AISCENT_CAMPS, type AiscentCampId } from '@/lib/aiscent-camps';

function isAgentAvailable(agentState: AgentState) {
  return (
    agentState === 'listening' ||
    agentState === 'thinking' ||
    agentState === 'speaking'
  );
}

const CAMP_COLOR: Record<AiscentCampId, string> = {
  A: '#0E8E8C',
  I: '#1B3B72',
  S: '#1B3B72',
  C: '#C13020',
  E: '#1B3B72',
  N: '#C9A227',
};

interface AiscentSessionViewProps {
  activeCampId: AiscentCampId | null;
  completedCampIds: AiscentCampId[];
  onEndInterview: () => void;
}

export function AiscentSessionView({
  activeCampId,
  completedCampIds,
  onEndInterview,
}: AiscentSessionViewProps) {
  const { state: agentState } = useVoiceAssistant();
  const roomState = useConnectionState();
  const isConnected = roomState === ConnectionState.Connected;
  const [agentReady, setAgentReady] = useState(false);

  useEffect(() => {
    if (isAgentAvailable(agentState) && !agentReady) {
      setAgentReady(true);
    }
  }, [agentState, agentReady]);

  const activeCamp = activeCampId
    ? AISCENT_CAMPS.find((c) => c.id === activeCampId) ?? null
    : null;

  const showConnecting = isConnected && !agentReady;

  const waypointColor = activeCampId ? CAMP_COLOR[activeCampId] : '#1B3B72';
  const isSummitActive = activeCampId === 'N';

  const speakerLabel =
    agentState === 'listening'
      ? 'You'
      : agentState === 'speaking' || agentState === 'thinking'
      ? 'Agent'
      : '…';

  const centerCopy =
    agentState === 'listening'
      ? "I'm listening. Take your time."
      : agentState === 'speaking'
      ? "I'm speaking now."
      : agentState === 'thinking'
      ? 'One moment…'
      : agentReady
      ? 'When you hear the question, respond in your own words.'
      : 'Getting the interviewer ready…';

  return (
    <div
      className="fixed inset-0 flex flex-col overflow-y-auto overflow-x-hidden"
      style={{ background: '#F7F5F1' }}
    >
      <AiscentMountainRidges opacity={0.12} />

      {/* Header */}
      <div
        style={{
          position: 'relative',
          padding: 'clamp(16px, 3vw, 20px) clamp(16px, 3vw, 40px) 12px',
          borderBottom: '1px solid rgba(228,223,214,0.7)',
          background: 'rgba(247,245,241,0.72)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: '0 auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div
            className="aiscent-session-header"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 24,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <Image
                src="/aiscent/ascent-logo.png"
                alt="AiSCENT"
                width={124}
                height={32}
                priority
                style={{ height: 32, width: 'auto', display: 'block' }}
              />
              <div
                style={{
                  paddingLeft: 16,
                  borderLeft: '2px solid #E4DFD6',
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 3,
                    color: '#1B3B72',
                  }}
                >
                  AISCENT · CX MATURITY INTERVIEW
                </div>
                <h2
                  className="aiscent-camp-title"
                  style={{
                    fontFamily: "var(--font-poppins), 'Poppins', sans-serif",
                    fontWeight: 600,
                    fontSize: 'clamp(16px, 2.6vw, 22px)',
                    lineHeight: 1.2,
                    color: '#14181D',
                    margin: '4px 0 0',
                  }}
                >
                  {activeCamp
                    ? `Camp ${activeCamp.id} — ${activeCamp.fullName}`
                    : 'Getting started…'}
                </h2>
                {activeCamp && (
                  <p
                    style={{
                      fontSize: 13,
                      color: '#4A5563',
                      margin: '2px 0 0',
                      maxWidth: 640,
                    }}
                  >
                    {activeCamp.blurb}
                  </p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={onEndInterview}
              className="aiscent-end-btn"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '8px 16px',
                borderRadius: 999,
                border: '1px solid #1B3B72',
                background: 'transparent',
                color: '#1B3B72',
                fontFamily: "var(--font-space-grotesk), sans-serif",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 2,
                cursor: 'pointer',
                textTransform: 'uppercase',
              }}
            >
              End interview
            </button>
          </div>

          <AiscentRouteMap
            activeCampId={activeCampId}
            completedCampIds={completedCampIds}
            compact
          />
        </div>
      </div>

      {/* Connecting shimmer */}
      {showConnecting && (
        <div
          style={{
            position: 'relative',
            padding: '10px 40px 0',
          }}
        >
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <p
              className="animate-text-shimmer inline-block !bg-clip-text text-transparent"
              style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1.6 }}
            >
              CONNECTING TO YOUR INTERVIEWER…
            </p>
          </div>
        </div>
      )}

      {/* Center waypoint marker */}
      <div
        style={{
          position: 'relative',
          flex: '1 1 auto',
          padding: 'clamp(32px, 6vw, 48px) clamp(16px, 4vw, 40px) 120px',
        }}
      >
        <div
          style={{
            maxWidth: 640,
            margin: '0 auto',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: 18,
          }}
        >
          <div
            className="aiscent-waypoint"
            style={{ position: 'relative', width: 140, height: 140 }}
          >
            <div
              style={{
                position: 'absolute',
                inset: '14%',
                borderRadius: '50%',
                background: `${waypointColor}55`,
                animation: 'aiscentGentlePulse 3.4s ease-in-out infinite',
                transformOrigin: 'center',
              }}
            />
            <div
              style={{
                position: 'absolute',
                inset: '27%',
                borderRadius: '50%',
                background: isSummitActive ? 'transparent' : waypointColor,
                border: isSummitActive
                  ? `4px solid ${waypointColor}`
                  : 'none',
                boxShadow: `0 8px 20px ${waypointColor}44`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-poppins), 'Poppins', sans-serif",
                  fontWeight: 700,
                  fontSize: 'clamp(14px, 2vw, 18px)',
                  letterSpacing: 0.4,
                  color: isSummitActive ? waypointColor : '#FFFFFF',
                }}
              >
                {speakerLabel}
              </span>
            </div>
          </div>

          <p
            style={{
              fontFamily: "var(--font-poppins), 'Poppins', sans-serif",
              fontStyle: 'italic',
              fontSize: 'clamp(16px, 2.4vw, 20px)',
              lineHeight: 1.4,
              color: '#1B3B72',
              margin: 0,
              maxWidth: 520,
            }}
          >
            {centerCopy}
          </p>
          <p
            style={{
              fontSize: 13,
              color: '#8A8378',
              margin: 0,
              maxWidth: 480,
            }}
          >
            Speak naturally: One thought at a time. The interview will move
            through six areas of customer experience and finish in about 12–15
            minutes.
          </p>
        </div>
      </div>

      <AiscentControlBar />
    </div>
  );
}

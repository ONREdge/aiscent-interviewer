'use client';

import Image from 'next/image';
import { AiscentMountainRidges } from '@/components/aiscent/aiscent-mountain-ridges';
import { AiscentFrostedCard } from '@/components/aiscent/aiscent-frosted-card';

interface AiscentWelcomeProps {
  onStart: () => void;
  disabled?: boolean;
  className?: string;
}

interface AccentColumn {
  label: string;
  color: string;
  body: string;
}

const COLUMNS: AccentColumn[] = [
  {
    label: 'ANSWER TODAY',
    color: '#0E8E8C',
    body: 'Answer with what exists today, not what is planned or in progress.',
  },
  {
    label: 'NO RIGHT OR WRONG',
    color: '#C13020',
    body: "There are no right or wrong answers! You're mapping where your company stands today.",
  },
  {
    label: 'YOUR ASCENT POSITION',
    color: '#C9A227',
    body: "It's voice-only. You'll receive an on-screen Ascent Position at the end.",
  },
];

export function AiscentWelcome({
  onStart,
  disabled,
  className,
}: AiscentWelcomeProps) {
  return (
    <div
      className={`fixed inset-0 z-10 overflow-y-auto overflow-x-hidden${
        className ? ` ${className}` : ''
      }`}
      style={{ background: '#F7F5F1' }}
    >
      <AiscentMountainRidges />

      <div
        className="relative flex flex-col"
        style={{
          minHeight: '100vh',
          padding:
            'clamp(20px, 5vw, 32px) clamp(16px, 4vw, 48px) clamp(24px, 4vw, 40px)',
        }}
      >
        <header
          className="aiscent-header-row"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 24,
            marginBottom: 24,
          }}
        >
          <Image
            src="/aiscent/ascent-logo.png"
            alt="AiSCENT"
            width={168}
            height={44}
            priority
            style={{ height: 44, width: 'auto', display: 'block' }}
          />
          <div
            className="aiscent-tagline"
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 3,
              color: '#1B3B72',
              whiteSpace: 'nowrap',
            }}
          >
            SEE THE ROUTE. SHAPE WHAT&apos;S NEXT.
          </div>
        </header>

        <div
          style={{
            flex: '1 1 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AiscentFrostedCard
            maxWidth="920px"
            padding="clamp(28px, 5vw, 52px) clamp(20px, 4vw, 56px) clamp(28px, 4vw, 44px)"
            style={{ margin: '0 auto' }}
          >
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 20px',
                borderRadius: 999,
                background: '#1565E2',
                boxShadow: '0 8px 24px rgba(21,101,226,0.28)',
                marginBottom: 28,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: '#C9A227',
                }}
              />
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: 3,
                  color: '#FFFFFF',
                }}
              >
                AISCENT · TIER 1 DIAGNOSTIC
              </span>
            </div>

            <h1
              style={{
                fontFamily: "var(--font-poppins), 'Poppins', sans-serif",
                fontWeight: 600,
                fontSize: 'clamp(30px, 6vw, 52px)',
                lineHeight: 1.08,
                letterSpacing: -1.4,
                color: '#14181D',
                margin: '0 0 22px',
                maxWidth: 780,
              }}
            >
              See where your customer intelligence stands.
            </h1>

            <p
              style={{
                fontSize: 'clamp(15px, 2.2vw, 17px)',
                lineHeight: 1.6,
                color: '#4A5563',
                maxWidth: 700,
                margin: '0 0 14px',
              }}
            >
              A short voice interview across six areas of customer experience —
              <b style={{ color: '#1B3B72', fontWeight: 700 }}>
                {' '}
                leadership, operations, signal, health, experience management,
                and navigation.
              </b>{' '}
              About 12–15 minutes.
            </p>

            <p
              style={{
                fontSize: 15,
                lineHeight: 1.6,
                color: '#4A5563',
                maxWidth: 700,
                margin: '0 0 36px',
              }}
            >
              After finishing the interview, you&apos;ll receive your on-screen{' '}
              <b style={{ color: '#1B3B72', fontWeight: 700 }}>Ascent Position</b>{''}:
              a snapshot of where you stand on the route to customer-led
              growth.
            </p>

            <div
              className="aiscent-accent-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: 0,
                marginBottom: 36,
              }}
            >
              {COLUMNS.map((col, idx) => (
                <div
                  key={col.label}
                  style={{
                    padding:
                      idx === 0
                        ? '18px 28px 0 0'
                        : idx === COLUMNS.length - 1
                        ? '18px 0 0 28px'
                        : '18px 28px 0',
                    borderTop: `2px solid ${col.color}`,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: 1.5,
                      color: col.color,
                      marginBottom: 10,
                    }}
                  >
                    {col.label}
                  </div>
                  <div style={{ fontSize: 14, lineHeight: 1.55, color: '#4A5563' }}>
                    {col.body}
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={onStart}
              disabled={disabled}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                padding: '16px 34px',
                borderRadius: 999,
                border: 'none',
                background: '#1565E2',
                color: '#FFFFFF',
                fontFamily: "var(--font-space-grotesk), sans-serif",
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: 0.5,
                cursor: disabled ? 'not-allowed' : 'pointer',
                boxShadow: '0 12px 28px rgba(21,101,226,0.30)',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease',
                opacity: disabled ? 0.55 : 1,
              }}
              onMouseEnter={(e) => {
                if (disabled) return;
                (e.currentTarget as HTMLButtonElement).style.transform =
                  'translateY(-1px)';
                (e.currentTarget as HTMLButtonElement).style.boxShadow =
                  '0 16px 34px rgba(21,101,226,0.36)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform =
                  'translateY(0)';
                (e.currentTarget as HTMLButtonElement).style.boxShadow =
                  '0 12px 28px rgba(21,101,226,0.30)';
              }}
            >
              Start the interview
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-flex',
                  width: 22,
                  height: 22,
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.18)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                }}
              >
                →
              </span>
            </button>

            <p
              style={{
                fontSize: 12,
                color: '#8A8378',
                marginTop: 22,
                marginBottom: 0,
                maxWidth: 620,
              }}
            >
              Your microphone will be used. Nothing is shared publicly.
            </p>
          </AiscentFrostedCard>
        </div>
      </div>
    </div>
  );
}

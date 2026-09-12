'use client';

import Image from 'next/image';
import { useRef } from 'react';
import { AiscentMountainRidges } from '@/components/aiscent/aiscent-mountain-ridges';
import { AiscentFrostedCard } from '@/components/aiscent/aiscent-frosted-card';
import { AiscentRouteMap } from '@/components/aiscent/aiscent-route-map';
import {
  AISCENT_CAMPS,
  AISCENT_CAMP_ORDER,
  type AiscentCampId,
  type AscentPosition,
  type AscentSnapshotRow,
} from '@/lib/aiscent-camps';

interface AiscentAscentPositionProps {
  ascentPosition: AscentPosition;
  endReason: string | null;
  onRestart: () => void;
}

const CAMP_COLOR: Record<AiscentCampId, string> = {
  A: '#0E8E8C',
  I: '#1B3B72',
  S: '#1B3B72',
  C: '#C13020',
  E: '#1B3B72',
  N: '#C9A227',
};

const LEVEL_STYLE: Record<
  string,
  { bg: string; fg: string; border: string; label: string }
> = {
  L1: {
    bg: 'rgba(193,48,32,0.10)',
    fg: '#C13020',
    border: 'rgba(193,48,32,0.35)',
    label: 'Base',
  },
  L2: {
    bg: 'rgba(246,197,157,0.28)',
    fg: '#8A5A20',
    border: 'rgba(201,162,39,0.35)',
    label: 'Foothills',
  },
  L3: {
    bg: 'rgba(27,59,114,0.10)',
    fg: '#1B3B72',
    border: 'rgba(27,59,114,0.35)',
    label: 'Ridge',
  },
  L4: {
    bg: 'rgba(14,142,140,0.12)',
    fg: '#0E7371',
    border: 'rgba(14,142,140,0.38)',
    label: 'Traverse',
  },
  L5: {
    bg: 'rgba(201,162,39,0.16)',
    fg: '#8A6E10',
    border: 'rgba(201,162,39,0.5)',
    label: 'Summit',
  },
};

function LevelPill({ level, descriptor }: { level: string; descriptor: string }) {
  const style = LEVEL_STYLE[level] ?? {
    bg: 'rgba(74,85,99,0.08)',
    fg: '#4A5563',
    border: 'rgba(74,85,99,0.25)',
    label: '—',
  };
  return (
    <div
      className="aiscent-level-pill"
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 8,
        padding: '6px 12px',
        borderRadius: 999,
        background: style.bg,
        border: `1px solid ${style.border}`,
        color: style.fg,
      }}
    >
      <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: 0.5 }}>
        {level}
      </span>
      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>
        {style.label}
      </span>
      <span style={{ fontSize: 12, fontWeight: 500, color: '#4A5563' }}>
        {descriptor}
      </span>
    </div>
  );
}

export function AiscentAscentPosition({
  ascentPosition,
  endReason,
  onRestart,
}: AiscentAscentPositionProps) {
  const isPreClimb = endReason === 'pre_climb';
  const isDisconnected = endReason === 'disconnected';
  const rows = ascentPosition.camp_snapshot ?? [];

  // Build a quick lookup by camp id so we can render a card per camp in order.
  const rowByCamp: Partial<Record<AiscentCampId, AscentSnapshotRow>> = {};
  for (const row of rows) {
    if (typeof row.camp_id === 'string' && (AISCENT_CAMP_ORDER as string[]).includes(row.camp_id)) {
      rowByCamp[row.camp_id as AiscentCampId] = row;
    }
  }

  const completedCampIds: AiscentCampId[] = AISCENT_CAMP_ORDER.filter((id) => {
    const row = rowByCamp[id];
    return row && row.level_number && row.level_number > 0;
  });

  const campNLevel = rowByCamp.N?.level_number ?? 0;
  const summitReached = !isPreClimb && !isDisconnected && campNLevel >= 3;

  const contentRef = useRef<HTMLDivElement>(null);

  async function handleDownloadPdf() {
    if (!contentRef.current) return;
    const { downloadAiscentPdf } = await import('@/lib/aiscent-pdf');
    await downloadAiscentPdf(contentRef.current);
  }

  return (
    <div
      className="fixed inset-0 overflow-auto"
      style={{ background: '#F7F5F1' }}
    >
      <AiscentMountainRidges opacity={0.14} />

      <div
        ref={contentRef}
        style={{
          position: 'relative',
          maxWidth: 1080,
          margin: '0 auto',
          padding:
            'clamp(24px, 4vw, 40px) clamp(16px, 4vw, 40px) clamp(60px, 8vw, 80px)',
        }}
      >
        <header
          className="aiscent-header-row"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 24,
            marginBottom: 28,
          }}
        >
          <Image
            src="/aiscent/ascent-logo.png"
            alt="AiSCENT"
            width={144}
            height={38}
            priority
            style={{ height: 38, width: 'auto', display: 'block' }}
          />
          <div
            className="aiscent-tagline"
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 3,
              color: '#1B3B72',
            }}
          >
            SEE THE ROUTE. SHAPE WHAT&apos;S NEXT.
          </div>
        </header>

        <AiscentFrostedCard padding="clamp(24px, 4vw, 44px) clamp(20px, 4vw, 48px) clamp(28px, 4vw, 40px)">
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 18px',
              borderRadius: 999,
              background: isPreClimb ? '#C13020' : '#1565E2',
              color: '#FFFFFF',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 2.5,
              marginBottom: 24,
              boxShadow: isPreClimb
                ? '0 8px 22px rgba(193,48,32,0.30)'
                : '0 8px 22px rgba(21,101,226,0.28)',
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
            AISCENT · ASCENT POSITION
          </div>

          <h1
            style={{
              fontFamily: "var(--font-poppins), 'Poppins', sans-serif",
              fontWeight: 600,
              fontSize: 'clamp(28px, 5.5vw, 46px)',
              lineHeight: 1.08,
              letterSpacing: -1.2,
              color: isPreClimb ? '#C13020' : '#14181D',
              margin: '0 0 12px',
              maxWidth: 780,
            }}
          >
            {isPreClimb
              ? 'Pre-Climb — the foundation is not yet in place.'
              : 'Your Ascent Position.'}
          </h1>

          {isDisconnected && !isPreClimb && (
            <p
              style={{
                fontSize: 13,
                color: '#8A5A20',
                background: 'rgba(246,197,157,0.35)',
                border: '1px solid rgba(201,162,39,0.5)',
                padding: '10px 14px',
                borderRadius: 10,
                margin: '0 0 24px',
                maxWidth: 720,
              }}
            >
              This is a partial read — the interview ended before all six areas
              were covered.
            </p>
          )}

          <div style={{ margin: '24px -16px 8px' }}>
            <AiscentRouteMap
              activeCampId={null}
              completedCampIds={completedCampIds}
              summitReached={summitReached}
            />
          </div>
        </AiscentFrostedCard>

        <section style={{ margin: '36px 0 28px' }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 2,
              color: '#1B3B72',
              borderBottom: '3px solid #1565E2',
              display: 'inline-block',
              paddingBottom: 4,
              marginBottom: 14,
            }}
          >
            SUMMARY
          </div>
          <p
            style={{
              fontFamily: "var(--font-poppins), 'Poppins', sans-serif",
              fontStyle: 'italic',
              fontWeight: 500,
              fontSize: 'clamp(16px, 2.6vw, 22px)',
              lineHeight: 1.45,
              color: '#1B3B72',
              margin: 0,
              maxWidth: 900,
              whiteSpace: 'pre-line',
            }}
          >
            {ascentPosition.summary || '—'}
          </p>
        </section>

        <section style={{ margin: '28px 0' }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 2,
              color: '#1B3B72',
              borderBottom: '3px solid #1565E2',
              display: 'inline-block',
              paddingBottom: 4,
              marginBottom: 20,
            }}
          >
            CAMP SNAPSHOT
          </div>

          <div
            className="aiscent-snapshot-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 14,
            }}
          >
            {AISCENT_CAMPS.map((camp) => {
              const row = rowByCamp[camp.id];
              const color = CAMP_COLOR[camp.id];
              const scored = !!row && !!row.level_number;
              return (
                <div
                  key={camp.id}
                  style={{
                    background: '#FFFFFF',
                    borderRadius: 14,
                    border: '1px solid #E4DFD6',
                    padding: '18px 20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    boxShadow: '0 8px 22px rgba(27,59,114,0.06)',
                    opacity: scored ? 1 : 0.55,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 999,
                        background: color,
                        color: '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontFamily: "var(--font-poppins), 'Poppins', sans-serif",
                        fontWeight: 700,
                        fontSize: 18,
                        boxShadow: `0 6px 14px ${color}44`,
                      }}
                    >
                      {camp.id}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: 1.5,
                          color: '#8A8378',
                        }}
                      >
                        CAMP {camp.id}
                      </div>
                      <div
                        style={{
                          fontFamily:
                            "var(--font-poppins), 'Poppins', sans-serif",
                          fontWeight: 600,
                          fontSize: 16,
                          color: '#14181D',
                          lineHeight: 1.2,
                        }}
                      >
                        {camp.fullName}
                      </div>
                    </div>
                  </div>

                  {row ? (
                    <>
                      <LevelPill
                        level={row.level || '—'}
                        descriptor={row.descriptor || ''}
                      />
                      {row.capped_by && (
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            letterSpacing: 1,
                            textTransform: 'uppercase',
                            color: '#C13020',
                            background: 'rgba(193,48,32,0.08)',
                            border: '1px solid rgba(193,48,32,0.25)',
                            padding: '4px 8px',
                            borderRadius: 6,
                            alignSelf: 'flex-start',
                          }}
                        >
                          Capped by {row.capped_by}
                        </div>
                      )}
                      <p
                        style={{
                          fontFamily:
                            "var(--font-poppins), 'Poppins', sans-serif",
                          fontStyle: 'italic',
                          fontSize: 13,
                          lineHeight: 1.5,
                          color: '#4A5563',
                          margin: 0,
                        }}
                      >
                        {row.quote ? `“${row.quote}”` : '—'}
                      </p>
                    </>
                  ) : (
                    <div
                      style={{
                        fontSize: 12,
                        color: '#8A8378',
                        fontStyle: 'italic',
                      }}
                    >
                      Not reached in this interview.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section style={{ margin: '28px 0' }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 2,
              color: '#1B3B72',
              borderBottom: '3px solid #1565E2',
              display: 'inline-block',
              paddingBottom: 4,
              marginBottom: 14,
            }}
          >
            WHAT THIS MEANS
          </div>
          <p
            style={{
              fontSize: 'clamp(14px, 2.1vw, 16px)',
              lineHeight: 1.65,
              color: '#28313E',
              margin: 0,
              maxWidth: 900,
              whiteSpace: 'pre-line',
            }}
          >
            {ascentPosition.what_this_means || '—'}
          </p>
        </section>

        <section
          style={{
            background: 'linear-gradient(160deg, #1B3B72, #28313E)',
            borderRadius: 16,
            padding: 'clamp(22px, 3.5vw, 30px) clamp(20px, 3.5vw, 34px)',
            color: '#F3F7FC',
            margin: '32px 0 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            boxShadow: '0 24px 60px rgba(27,59,114,0.28)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 2,
              color: '#C9A227',
            }}
          >
            <span
              style={{
                width: 28,
                height: 2,
                background: '#C9A227',
                borderRadius: 2,
              }}
            />
            TAKE THIS WITH YOU
          </div>
          <p
            style={{
              fontFamily: "var(--font-poppins), 'Poppins', sans-serif",
              fontWeight: 600,
              fontSize: 'clamp(16px, 2.6vw, 22px)',
              lineHeight: 1.35,
              margin: 0,
              maxWidth: 780,
            }}
          >
            {ascentPosition.cta}
          </p>
        </section>

        <div
          data-pdf-hide="true"
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 12,
            flexWrap: 'wrap',
            paddingTop: 8,
          }}
        >
          <button
            type="button"
            onClick={handleDownloadPdf}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              padding: '14px 30px',
              borderRadius: 999,
              border: '1px solid #1565E2',
              background: '#FFFFFF',
              color: '#1565E2',
              fontFamily: "var(--font-space-grotesk), sans-serif",
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: 0.5,
              cursor: 'pointer',
              boxShadow: '0 8px 20px rgba(21,101,226,0.12)',
              transition:
                'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform =
                'translateY(-1px)';
              (e.currentTarget as HTMLButtonElement).style.boxShadow =
                '0 12px 26px rgba(21,101,226,0.18)';
              (e.currentTarget as HTMLButtonElement).style.borderColor =
                '#0E4FBA';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform =
                'translateY(0)';
              (e.currentTarget as HTMLButtonElement).style.boxShadow =
                '0 8px 20px rgba(21,101,226,0.12)';
              (e.currentTarget as HTMLButtonElement).style.borderColor =
                '#1565E2';
            }}
          >
            Download PDF
            <span
              aria-hidden="true"
              style={{
                display: 'inline-flex',
                width: 22,
                height: 22,
                borderRadius: 999,
                background: 'rgba(21,101,226,0.10)',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                lineHeight: 1,
              }}
            >
              ↓
            </span>
          </button>
          <button
            type="button"
            onClick={onRestart}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              padding: '14px 30px',
              borderRadius: 999,
              border: 'none',
              background: '#1565E2',
              color: '#FFFFFF',
              fontFamily: "var(--font-space-grotesk), sans-serif",
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: 0.5,
              cursor: 'pointer',
              boxShadow: '0 12px 28px rgba(21,101,226,0.30)',
              transition: 'transform 0.15s ease, box-shadow 0.15s ease',
            }}
            onMouseEnter={(e) => {
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
            Start a new interview
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
        </div>
      </div>
    </div>
  );
}

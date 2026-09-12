'use client';

import { useMemo } from 'react';
import { AISCENT_CAMPS, type AiscentCampId } from '@/lib/aiscent-camps';

type CampState = 'future' | 'active' | 'completed';

interface AiscentRouteMapProps {
  activeCampId: AiscentCampId | null;
  completedCampIds: AiscentCampId[];
  /**
   * When rendered on the summit / Ascent Position page, we know whether the
   * participant made it to the top. Controls whether the summit ring is lit.
   */
  summitReached?: boolean;
  /**
   * Compact height mode for the session-view header. Default is the taller
   * hero layout used on the Ascent Position page.
   */
  compact?: boolean;
  className?: string;
}

const CAMP_COLOR: Record<AiscentCampId, string> = {
  A: '#0E8E8C',
  I: '#1B3B72',
  S: '#1B3B72',
  C: '#C13020',
  E: '#1B3B72',
  N: '#C9A227',
};

interface RoutePoint {
  camp: AiscentCampId | null;
  x: number;
  y: number;
}

const POINTS: RoutePoint[] = [
  { camp: null, x: 10,  y: 155 },
  { camp: 'A',  x: 60,  y: 135 },
  { camp: 'I',  x: 216, y: 108 },
  { camp: 'S',  x: 372, y: 90  },
  { camp: 'C',  x: 528, y: 62  },
  { camp: 'E',  x: 684, y: 40  },
  { camp: 'N',  x: 840, y: 20  },
];

const POLYLINE_STRING = POINTS.map((p) => `${p.x},${p.y}`).join(' ');

/**
 * "You are here" tent-and-flag glyph. Rendered inside a `<g>` translated to the
 * active waypoint's center. y=0 sits on the trail line so the tent stands on
 * the path with its flag rising above.
 */
function CampFlagGlyph({
  color,
  isSummit,
  campId,
}: {
  color: string;
  isSummit: boolean;
  campId: AiscentCampId;
}) {
  return (
    <g>
      <title>{`You are here — Camp ${campId}`}</title>
      {isSummit && (
        <circle
          cx={0}
          cy={-4}
          r={11}
          fill="none"
          stroke={color}
          strokeWidth={2}
          opacity={0.7}
        />
      )}
      {/* Tent silhouette */}
      <path d="M -6 5 L 0 -6 L 6 5 Z" fill={color} />
      {/* Tent seam highlight (implies a doorway / center pole) */}
      <path
        d="M 0 -6 L 0 5"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth={0.9}
        strokeLinecap="round"
      />
      {/* Flag pole */}
      <path
        d="M 3 -6 L 3 -14"
        stroke={color}
        strokeWidth={1.2}
        strokeLinecap="round"
      />
      {/* Pennant */}
      <path d="M 3 -14 L 10 -12 L 3 -10 Z" fill={color} />
    </g>
  );
}

export function AiscentRouteMap({
  activeCampId,
  completedCampIds,
  summitReached = false,
  compact = false,
  className,
}: AiscentRouteMapProps) {
  const { totalLen, lengthToDraw } = useMemo(() => {
    const seg: number[] = [0];
    for (let i = 1; i < POINTS.length; i++) {
      const dx = POINTS[i].x - POINTS[i - 1].x;
      const dy = POINTS[i].y - POINTS[i - 1].y;
      seg.push(seg[i - 1] + Math.hypot(dx, dy));
    }
    const total = seg[seg.length - 1];
    const completed = new Set(completedCampIds);
    const activeIdx = activeCampId
      ? POINTS.findIndex((p) => p.camp === activeCampId)
      : -1;

    let drawn = 0;
    for (let i = 1; i < POINTS.length; i++) {
      const camp = POINTS[i].camp;
      if (camp && completed.has(camp)) drawn = seg[i];
    }
    // When we have an active camp but no completions yet, extend the line
    // slightly into the current leg so the user sees forward motion.
    if (activeIdx > 0 && drawn < seg[activeIdx]) {
      const prev = seg[activeIdx - 1];
      const curr = seg[activeIdx];
      const nudged = prev + (curr - prev) * 0.35;
      if (nudged > drawn) drawn = nudged;
    }
    return { totalLen: total, lengthToDraw: drawn };
  }, [activeCampId, completedCampIds]);

  const completedSet = new Set(completedCampIds);
  const svgHeight = compact ? 120 : 180;

  const campState = (id: AiscentCampId): CampState => {
    if (completedSet.has(id)) return 'completed';
    if (activeCampId === id) return 'active';
    return 'future';
  };

  return (
    <div
      className={className}
      style={{ width: '100%', maxWidth: 960, margin: '0 auto' }}
    >
      <svg
        viewBox="0 -30 900 210"
        width="100%"
        height={svgHeight}
        style={{ overflow: 'visible', display: 'block' }}
      >
        {/* Vertical guides for teal / red / gold inflection points, dashed */}
        <g strokeWidth={1.5} strokeDasharray="4 5" opacity={0.4}>
          {POINTS.filter((p) => p.camp && CAMP_COLOR[p.camp] !== '#1B3B72').map(
            (p) => (
              <line
                key={`guide-${p.camp}`}
                x1={p.x}
                y1={p.y + 10}
                x2={p.x}
                y2={175}
                stroke={CAMP_COLOR[p.camp as AiscentCampId]}
              />
            )
          )}
        </g>

        {/* Ghost route (full path, faded) */}
        <polyline
          points={POLYLINE_STRING}
          fill="none"
          stroke="#E4DFD6"
          strokeWidth={7}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Drawn (completed) route in Ascent Blue */}
        <polyline
          points={POLYLINE_STRING}
          fill="none"
          stroke="#1565E2"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={totalLen}
          strokeDashoffset={totalLen - lengthToDraw}
          style={{ transition: 'stroke-dashoffset 0.9s ease-out' }}
        />

        {/* Gold running pulse — only when at least one camp has been drawn */}
        {lengthToDraw > 40 && (
          <polyline
            points={POLYLINE_STRING}
            fill="none"
            stroke="#C9A227"
            strokeWidth={3.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={`60 ${Math.max(60, totalLen)}`}
            style={{
              animation: 'aiscentRoutePulse 4.6s linear infinite',
            }}
          />
        )}

        {/* Waypoints */}
        {POINTS.map((p, idx) => {
          if (!p.camp) {
            return (
              <circle
                key={`base-${idx}`}
                cx={p.x}
                cy={p.y}
                r={4.5}
                fill="#1B3B72"
                opacity={0.6}
              />
            );
          }
          const state = campState(p.camp);
          const color = CAMP_COLOR[p.camp];
          const isSummit = p.camp === 'N';
          const isRing = isSummit && (state === 'completed' ? summitReached : true);

          if (state === 'future') {
            return (
              <g key={`node-${p.camp}`}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={5.5}
                  fill="#E4DFD6"
                  stroke="#C4BEB2"
                  strokeWidth={1.5}
                />
              </g>
            );
          }

          if (state === 'active') {
            return (
              <g key={`node-${p.camp}`}>
                <g transform={`translate(${p.x} ${p.y}) scale(1.5)`}>
                  <CampFlagGlyph
                    color={color}
                    isSummit={isSummit}
                    campId={p.camp}
                  />
                </g>
              </g>
            );
          }

          // completed
          return (
            <g key={`node-${p.camp}`}>
              <circle
                cx={p.x}
                cy={p.y}
                r={13}
                fill={color}
                opacity={0.16}
              />
              {isRing ? (
                <>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={9}
                    fill="none"
                    stroke={color}
                    strokeWidth={3}
                  />
                  <circle cx={p.x} cy={p.y} r={4} fill={color} />
                </>
              ) : (
                <circle cx={p.x} cy={p.y} r={6.5} fill={color} />
              )}
            </g>
          );
        })}

        {/* Camp labels */}
        {AISCENT_CAMPS.map((camp) => {
          const p = POINTS.find((pt) => pt.camp === camp.id);
          if (!p) return null;
          const state = campState(camp.id);
          const fill =
            state === 'active'
              ? '#1B3B72'
              : state === 'completed'
              ? '#4A5563'
              : '#8A8378';
          const fontWeight = state === 'active' ? 700 : 500;
          return (
            <text
              key={`label-${camp.id}`}
              className="aiscent-route-label"
              x={p.x}
              y={p.y + 30}
              textAnchor="middle"
              style={{
                fontFamily: 'var(--font-space-grotesk), sans-serif',
                fontSize: 10,
                letterSpacing: 1.6,
                fontWeight,
                fill,
                textTransform: 'uppercase',
              }}
            >
              {camp.displayName}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

'use client';

interface AiscentMountainRidgesProps {
  className?: string;
  opacity?: number;
}

export function AiscentMountainRidges({
  className,
  opacity = 0.16,
}: AiscentMountainRidgesProps) {
  return (
    <svg
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 h-full w-full ${
        className ?? ''
      }`}
      style={{ opacity }}
    >
      <g fill="none" stroke="#1B3B72" strokeWidth={1}>
        <path d="M-60,760 C220,700 380,820 620,750 C880,674 1060,760 1500,650" />
        <path d="M-60,700 C220,640 380,760 620,690 C880,614 1060,700 1500,590" />
        <path d="M-60,640 C220,580 380,700 620,630 C880,554 1060,640 1500,530" />
        <path d="M-60,580 C240,520 400,630 640,556 C900,478 1080,560 1500,455" />
        <path d="M-60,520 C240,460 400,566 640,492 C900,414 1080,492 1500,386" />
        <path d="M-60,460 C240,402 400,502 640,428 C900,350 1080,424 1500,318" />
        <path d="M-60,400 C240,344 400,438 640,364 C900,286 1080,356 1500,250" />
      </g>
    </svg>
  );
}

'use client';

import type { CSSProperties, ReactNode } from 'react';

interface AiscentFrostedCardProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  padding?: string;
  /**
   * Optional narrow-viewport padding override. When provided, the card sets
   * `--aiscent-mobile-padding` and marks itself with `data-mobile-padding`
   * so the `@media (max-width: 640px)` rule in globals.css picks it up.
   */
  mobilePadding?: string;
  maxWidth?: string;
  as?: 'div' | 'section' | 'article';
}

export function AiscentFrostedCard({
  children,
  className,
  style,
  padding = 'clamp(28px, 5vw, 56px) clamp(20px, 4vw, 60px)',
  mobilePadding,
  maxWidth,
  as: Tag = 'div',
}: AiscentFrostedCardProps) {
  const composedClassName = ['aiscent-frosted', className]
    .filter(Boolean)
    .join(' ');
  const cardStyle: CSSProperties = {
    background: 'rgba(255,255,255,0.55)',
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
    border: '1px solid rgba(255,255,255,0.7)',
    borderRadius: 20,
    boxShadow: '0 24px 60px rgba(27,59,114,0.10)',
    padding,
    maxWidth,
    width: '100%',
    boxSizing: 'border-box',
    ...(mobilePadding
      ? ({
          ['--aiscent-mobile-padding' as never]: mobilePadding,
        } as CSSProperties)
      : {}),
    ...style,
  };
  return (
    <Tag
      className={composedClassName}
      style={cardStyle}
      {...(mobilePadding ? { 'data-mobile-padding': '' } : {})}
    >
      {children}
    </Tag>
  );
}

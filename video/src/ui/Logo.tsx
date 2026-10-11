import type { FC } from 'react';
import { C } from '../theme';

/** Ink on the teal: the chevron and the spark. */
const INK = '#08090A';

/**
 * The app logo (public/logo.svg): a teal tile, Claude Code's chevron, and the spark where the cursor waits.
 * `tile`, `chevron` and `spark` reveal each part (0 to 1, overshoot allowed); `spin` turns the spark, in degrees.
 */
export const Logo: FC<{ size: number; tile?: number; chevron?: number; spark?: number; spin?: number }> = ({
  size,
  tile = 1,
  chevron = 1,
  spark = 1,
  spin = 0,
}) => (
  <svg width={size} height={size} viewBox="0 0 100 100" style={{ overflow: 'visible' }}>
    <rect
      x="8"
      y="8"
      width="84"
      height="84"
      rx="24"
      fill={C.brand}
      opacity={Math.min(1, tile)}
      transform={`translate(50 50) scale(${0.6 + 0.4 * tile}) translate(-50 -50)`}
    />
    <path
      d="M25 33L42 50L25 67"
      fill="none"
      stroke={INK}
      strokeWidth="8.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={Math.min(1, Math.max(0, chevron))}
      transform={`translate(${(1 - chevron) * -10} 0)`}
    />
    <g transform={`translate(65 50) rotate(${(1 - spark) * -120 + spin}) scale(${Math.max(0, spark)})`} stroke={INK} strokeLinecap="round">
      <path d="M0 -12V12M-12 0H12" strokeWidth="5.4" />
      <path d="M-7.1 -7.1L7.1 7.1M-7.1 7.1L7.1 -7.1" strokeWidth="4.4" />
    </g>
  </svg>
);

import type { HTMLAttributes, ReactNode } from 'react';

export type ChipTone =
  | 'neutral'
  | 'accent'
  | 'good'
  | 'warning'
  | 'serious'
  | 'critical';

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  /** Semantic color. Status tones are reserved for limits/verdicts. */
  tone?: ChipTone;
  children: ReactNode;
}

/**
 * Chip — a small pill for status/verdict labels. Supersedes the legacy `.chip`
 * classes. Outlined in `currentColor` so the border tracks the tone; text
 * carries the tone color, matching the existing convention.
 */
export function Chip({ tone = 'neutral', children, className, ...rest }: ChipProps) {
  const cls = ['fd-chip', `fd-chip--${tone}`, className].filter(Boolean).join(' ');
  return (
    <span className={cls} {...rest}>
      {children}
    </span>
  );
}

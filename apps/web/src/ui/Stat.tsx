import type { HTMLAttributes, ReactNode } from 'react';

export interface StatProps extends HTMLAttributes<HTMLDivElement> {
  /** Uppercase caption above the value. */
  label: ReactNode;
  /** The numeric/textual readout (rendered in tabular mono). */
  value: ReactNode;
  /** Optional trailing unit, dimmed and de-emphasized. */
  unit?: ReactNode;
}

/**
 * Stat — a compact label / value / unit readout tile. Supersedes the legacy
 * `.stat` markup. The value uses the mono family with tabular figures so
 * columns of numbers stay aligned.
 */
export function Stat({ label, value, unit, className, ...rest }: StatProps) {
  const cls = className ? `fd-stat ${className}` : 'fd-stat';
  return (
    <div className={cls} {...rest}>
      <span className="fd-stat__label">{label}</span>
      <span className="fd-stat__value">
        {value}
        {unit != null && <span className="fd-stat__unit">{unit}</span>}
      </span>
    </div>
  );
}

import { useId, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { Field, describedBy } from './Field';

export interface NumberFieldProps {
  label: ReactNode;
  value: number;
  onChange: (value: number) => void;
  /** SI unit suffix shown after the value (e.g. "m", "m/s", "kg"). */
  unit?: ReactNode;
  min?: number;
  max?: number;
  /** Increment for arrow keys, scrub, and rounding. Default 1. */
  step?: number;
  /** Pixels of horizontal drag per `step` when scrubbing the label. Default 4. */
  scrubPxPerStep?: number;
  hint?: ReactNode;
  error?: ReactNode;
  id?: string;
  disabled?: boolean;
}

const clamp = (v: number, min?: number, max?: number): number => {
  let r = v;
  if (min != null && r < min) r = min;
  if (max != null && r > max) r = max;
  return r;
};

/** Snap to the step grid to avoid float drift (e.g. 0.1 + 0.2 noise). */
const snap = (v: number, step: number): number => {
  if (!(step > 0)) return v;
  const snapped = Math.round(v / step) * step;
  const decimals = (String(step).split('.')[1] ?? '').length;
  return Number(snapped.toFixed(decimals));
};

/**
 * NumberField — the studio's workhorse numeric input. A committed numeric value
 * with an optional SI unit suffix, clamped to [min, max] and snapped to `step`.
 * Three ways to change it:
 *   - type a value (committed on blur / Enter; reverted on non-finite),
 *   - arrow keys (↑/↓ by step, ×10 with Shift),
 *   - drag the label horizontally to scrub (pointer-captured, ew-resize).
 */
export function NumberField({
  label,
  value,
  onChange,
  unit,
  min,
  max,
  step = 1,
  scrubPxPerStep = 4,
  hint,
  error,
  id,
  disabled,
}: NumberFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const { describedBy: descId } = describedBy(fieldId, hint, error);

  // While focused, the input is free-typed; `draft === null` shows `value`.
  const [draft, setDraft] = useState<string | null>(null);
  const scrub = useRef<{ startX: number; startValue: number } | null>(null);

  const commit = (raw: string) => {
    const n = Number(raw);
    if (raw.trim() !== '' && Number.isFinite(n)) {
      onChange(clamp(snap(n, step), min, max));
    }
    setDraft(null);
  };

  const bump = (dir: 1 | -1, factor: number) => {
    const next = clamp(snap(value + dir * step * factor, step), min, max);
    // Keep the visible draft in step with the value while the input is focused.
    if (draft !== null) setDraft(String(next));
    onChange(next);
  };

  const onLabelPointerDown = (e: ReactPointerEvent<HTMLLabelElement>) => {
    if (disabled) return;
    scrub.current = { startX: e.clientX, startValue: value };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  };
  const onLabelPointerMove = (e: ReactPointerEvent<HTMLLabelElement>) => {
    const s = scrub.current;
    if (!s) return;
    const dx = e.clientX - s.startX;
    const steps = Math.round(dx / scrubPxPerStep);
    onChange(clamp(snap(s.startValue + steps * step, step), min, max));
  };
  const endScrub = (e: ReactPointerEvent<HTMLLabelElement>) => {
    if (!scrub.current) return;
    scrub.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  return (
    <Field
      id={fieldId}
      label={label}
      hint={hint}
      error={error}
      labelProps={{
        className: 'fd-numberfield__label',
        onPointerDown: onLabelPointerDown,
        onPointerMove: onLabelPointerMove,
        onPointerUp: endScrub,
        onPointerCancel: endScrub,
        style: disabled ? undefined : { touchAction: 'none' },
      }}
    >
      <div className="fd-numberfield__control">
        <input
          id={fieldId}
          className="fd-input fd-numberfield__input fd-num"
          type="text"
          inputMode="decimal"
          role="spinbutton"
          aria-valuenow={value}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-describedby={descId}
          aria-invalid={error ? true : undefined}
          disabled={disabled}
          value={draft ?? String(value)}
          onFocus={() => setDraft(String(value))}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              bump(1, e.shiftKey ? 10 : 1);
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              bump(-1, e.shiftKey ? 10 : 1);
            } else if (e.key === 'Enter') {
              commit((e.target as HTMLInputElement).value);
            }
          }}
        />
        {unit != null && <span className="fd-numberfield__unit">{unit}</span>}
      </div>
    </Field>
  );
}

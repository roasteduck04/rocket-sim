import { useId } from 'react';
import type { ReactNode } from 'react';
import { Field, describedBy } from './Field';

export interface SliderProps {
  label: ReactNode;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  /** Optional unit shown next to the live value readout. */
  unit?: ReactNode;
  /** Format the readout; defaults to the raw number. */
  format?: (value: number) => ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  id?: string;
  disabled?: boolean;
}

/**
 * Slider — a labelled range input with a live value readout. Built on the
 * native `<input type="range">` (accent-tinted) for free keyboard + a11y.
 */
export function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  format,
  hint,
  error,
  id,
  disabled,
}: SliderProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const { describedBy: descId } = describedBy(fieldId, hint, error);
  return (
    <Field
      id={fieldId}
      label={label}
      hint={hint}
      error={error}
      className="fd-field--slider"
    >
      <div className="fd-slider">
        <input
          id={fieldId}
          className="fd-slider__range"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          aria-describedby={descId}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span className="fd-slider__value fd-num">
          {format ? format(value) : value}
          {unit != null && <span className="fd-slider__unit">{unit}</span>}
        </span>
      </div>
    </Field>
  );
}

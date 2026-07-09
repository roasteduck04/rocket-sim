import { useId } from 'react';
import type { ReactNode } from 'react';
import { Field, describedBy } from './Field';

export interface SelectOption<T extends string = string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

export interface SelectProps<T extends string = string> {
  label: ReactNode;
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<SelectOption<T>>;
  hint?: ReactNode;
  error?: ReactNode;
  id?: string;
  disabled?: boolean;
}

/**
 * Select — a labelled dropdown built on the native `<select>`, so keyboard
 * navigation, type-ahead, and screen-reader semantics come for free. Styled
 * from tokens to match the rest of the kit.
 */
export function Select<T extends string = string>({
  label,
  value,
  onChange,
  options,
  hint,
  error,
  id,
  disabled,
}: SelectProps<T>) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const { describedBy: descId } = describedBy(fieldId, hint, error);
  return (
    <Field id={fieldId} label={label} hint={hint} error={error}>
      <select
        id={fieldId}
        className="fd-input fd-select"
        value={value}
        disabled={disabled}
        aria-describedby={descId}
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

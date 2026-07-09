import { useId } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { Field, describedBy } from './Field';

export interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'id'> {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  hint?: ReactNode;
  error?: ReactNode;
  id?: string;
}

/**
 * TextField — a single-line text input rendered through Field. Emits the raw
 * string; validation/formatting is the caller's concern.
 */
export function TextField({
  label,
  value,
  onChange,
  hint,
  error,
  id,
  className,
  ...rest
}: TextFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const { describedBy: descId } = describedBy(fieldId, hint, error);
  return (
    <Field id={fieldId} label={label} hint={hint} error={error}>
      <input
        id={fieldId}
        type="text"
        className={['fd-input', className].filter(Boolean).join(' ')}
        value={value}
        aria-describedby={descId}
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
        {...rest}
      />
    </Field>
  );
}

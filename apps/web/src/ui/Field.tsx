import type { HTMLAttributes, LabelHTMLAttributes, ReactNode } from 'react';

export interface FieldProps {
  /** id of the wrapped control (used for label association + describedby). */
  id: string;
  label: ReactNode;
  /** The control element (input/select/etc). */
  children: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Extra props spread onto the <label> — e.g. NumberField's scrub handlers. */
  labelProps?: LabelHTMLAttributes<HTMLLabelElement>;
  className?: string;
  wrapperProps?: HTMLAttributes<HTMLDivElement>;
}

/** Stable ids for a field's hint/error, derived from the control id. */
export function describedBy(id: string, hint?: ReactNode, error?: ReactNode): {
  hintId?: string;
  errorId?: string;
  describedBy?: string;
} {
  const hintId = hint != null ? `${id}-hint` : undefined;
  const errorId = error != null ? `${id}-error` : undefined;
  const ids = [hintId, errorId].filter(Boolean).join(' ');
  return { hintId, errorId, describedBy: ids || undefined };
}

/**
 * Field — label + control + hint/error wrapper. The shared skeleton every form
 * primitive renders through, so labels, hints, and error text look and wire up
 * (for/aria-describedby) identically. Supersedes the legacy `.field` markup.
 */
export function Field({
  id,
  label,
  children,
  hint,
  error,
  labelProps,
  className,
  wrapperProps,
}: FieldProps) {
  const { hintId, errorId } = describedBy(id, hint, error);
  const cls = ['fd-field', error ? 'fd-field--invalid' : '', className]
    .filter(Boolean)
    .join(' ');
  const { className: labelCls, ...restLabel } = labelProps ?? {};
  return (
    <div className={cls} {...wrapperProps}>
      <label
        htmlFor={id}
        className={['fd-field__label', labelCls].filter(Boolean).join(' ')}
        {...restLabel}
      >
        {label}
      </label>
      <div className="fd-field__control">{children}</div>
      {hint != null && (
        <p id={hintId} className="fd-field__hint">
          {hint}
        </p>
      )}
      {error != null && (
        <p id={errorId} className="fd-field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

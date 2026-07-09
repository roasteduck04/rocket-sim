import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /**
   * Show a busy state: disables the control and marks it `aria-busy`, keeping
   * layout stable while an async action runs.
   */
  busy?: boolean;
  children: ReactNode;
}

/**
 * Button — the shared action control. Supersedes the legacy `.btn` classes.
 * Primary = accent fill, secondary = outlined, danger = critical outline.
 * `type` defaults to "button" so a Button in a form never submits by accident.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  busy = false,
  disabled,
  className,
  children,
  type,
  ...rest
}: ButtonProps) {
  const cls = [
    'fd-btn',
    `fd-btn--${variant}`,
    `fd-btn--${size}`,
    busy && 'fd-btn--busy',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type={type ?? 'button'}
      className={cls}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {children}
    </button>
  );
}

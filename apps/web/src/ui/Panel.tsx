import type { HTMLAttributes, ReactNode } from 'react';

export interface PanelProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** Optional uppercase section title rendered as the panel's heading. */
  title?: ReactNode;
  /** Trailing content in the title row (e.g. a status chip or action). */
  action?: ReactNode;
}

/**
 * Panel — the primary titled surface. Supersedes the legacy `.panel` class.
 * A recessive card (surface + hairline) with an optional uppercase heading and
 * a trailing action slot. Pure container; no feature logic.
 */
export function Panel({ title, action, children, className, ...rest }: PanelProps) {
  const cls = className ? `fd-panel ${className}` : 'fd-panel';
  return (
    <section className={cls} {...rest}>
      {(title || action) && (
        <header className="fd-panel__head">
          {title && <h2 className="fd-panel__title">{title}</h2>}
          {action && <div className="fd-panel__action">{action}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

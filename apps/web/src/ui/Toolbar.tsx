import type { HTMLAttributes, ReactNode } from 'react';

export interface ToolbarProps extends HTMLAttributes<HTMLDivElement> {
  'aria-label'?: string;
  children: ReactNode;
}

/**
 * Toolbar — a horizontal `role="toolbar"` container for grouped actions
 * (buttons, selects, a title). Use `Toolbar.Separator` to divide groups and
 * `Toolbar.Spacer` to push trailing items to the right.
 */
export function Toolbar({ children, className, ...rest }: ToolbarProps) {
  return (
    <div
      role="toolbar"
      className={['fd-toolbar', className].filter(Boolean).join(' ')}
      {...rest}
    >
      {children}
    </div>
  );
}

Toolbar.Separator = function ToolbarSeparator() {
  return <span className="fd-toolbar__sep" role="separator" aria-orientation="vertical" />;
};

Toolbar.Spacer = function ToolbarSpacer() {
  return <span className="fd-toolbar__spacer" aria-hidden="true" />;
};

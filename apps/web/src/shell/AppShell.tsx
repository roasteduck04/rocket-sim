import { useState, type ReactNode, type JSX } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import type { ViewId } from './nav';

export interface AppShellProps {
  active: ViewId;
  onNavigate: (view: ViewId) => void;
  /** The single mounted view (the router keeps one view mounted at a time). */
  children: ReactNode;
}

/**
 * AppShell — the application frame: a grouped left `Sidebar` + a slim `Header`
 * over a `<main>` outlet. It owns only presentational chrome state (sidebar
 * collapse); the parent owns the active view and mounts exactly one child, so
 * the one-view-at-a-time router semantics (unmounting stops a view's rAF loop
 * and workers) are unchanged.
 */
export function AppShell({ active, onNavigate, children }: AppShellProps): JSX.Element {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className={['fd-shell', collapsed ? 'fd-shell--collapsed' : ''].filter(Boolean).join(' ')}>
      <Sidebar active={active} onNavigate={onNavigate} collapsed={collapsed} />
      <div className="fd-shell__main">
        <Header collapsed={collapsed} onToggleSidebar={() => setCollapsed((c) => !c)} />
        <main className="fd-shell__content">{children}</main>
      </div>
    </div>
  );
}

import { useState, type ReactNode, type JSX } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { applyTheme, getTheme, type Theme } from '../ui/theme';
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
  const [theme, setTheme] = useState<Theme>(() => getTheme());
  const toggleTheme = (): void =>
    setTheme((t) => {
      const next: Theme = t === 'light' ? 'dark' : 'light';
      applyTheme(next);
      return next;
    });
  return (
    <div className={['fd-shell', collapsed ? 'fd-shell--collapsed' : ''].filter(Boolean).join(' ')}>
      <Sidebar active={active} onNavigate={onNavigate} collapsed={collapsed} />
      <div className="fd-shell__main">
        <Header
          collapsed={collapsed}
          onToggleSidebar={() => setCollapsed((c) => !c)}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
        <main className="fd-shell__content">{children}</main>
      </div>
    </div>
  );
}

import type { JSX } from 'react';
import type { Theme } from '../ui/theme';

export interface HeaderProps {
  collapsed: boolean;
  onToggleSidebar: () => void;
  theme: Theme;
  onToggleTheme: () => void;
}

/**
 * Header — the slim top bar: a sidebar-collapse toggle, the app title, and a
 * trailing light/dark theme switch.
 */
export function Header({ collapsed, onToggleSidebar, theme, onToggleTheme }: HeaderProps): JSX.Element {
  return (
    <header className="fd-header">
      <button
        type="button"
        className="fd-header__toggle"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-pressed={collapsed}
        onClick={onToggleSidebar}
      >
        <span aria-hidden="true">☰</span>
      </button>
      <div className="fd-header__brand">
        <h1 className="fd-header__title">Flight Dynamics &amp; Controls Simulation Suite</h1>
        <span className="fd-header__subtitle">
          6-DOF rocket · reentry corridor · linearized aircraft
        </span>
      </div>
      <div className="fd-header__actions">
        <button
          type="button"
          className="fd-header__toggle"
          aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
          onClick={onToggleTheme}
        >
          <span aria-hidden="true">{theme === 'light' ? '☾' : '☀'}</span>
        </button>
      </div>
    </header>
  );
}

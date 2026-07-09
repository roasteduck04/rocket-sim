import type { JSX } from 'react';

export interface HeaderProps {
  collapsed: boolean;
  onToggleSidebar: () => void;
}

/**
 * Header — the slim top bar: a sidebar-collapse toggle, the app title, and a
 * trailing slot reserved for a future theme toggle (Phase 13 light theme).
 */
export function Header({ collapsed, onToggleSidebar }: HeaderProps): JSX.Element {
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
      <div className="fd-header__actions" aria-hidden="true">
        {/* Reserved: theme toggle (Phase 13). */}
      </div>
    </header>
  );
}

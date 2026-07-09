import type { JSX } from 'react';
import { NAV_GROUPS, type ViewId } from './nav';

export interface SidebarProps {
  active: ViewId;
  onNavigate: (view: ViewId) => void;
  collapsed: boolean;
}

/**
 * Sidebar — the grouped left navigation rail. Renders `NAV_GROUPS`; live items
 * navigate, disabled items show a "soon" badge. When collapsed, labels are
 * hidden and each item's accessible name is preserved via `aria-label`.
 */
export function Sidebar({ active, onNavigate, collapsed }: SidebarProps): JSX.Element {
  return (
    <nav
      className={['fd-sidebar', collapsed ? 'fd-sidebar--collapsed' : ''].filter(Boolean).join(' ')}
      aria-label="Primary"
    >
      {NAV_GROUPS.map((group) => (
        <div key={group.title} className="fd-sidebar__group">
          <div className="fd-sidebar__group-title" aria-hidden={collapsed || undefined}>
            {group.title}
          </div>
          <ul className="fd-sidebar__items">
            {group.items.map((item) => {
              const isActive = item.view === active;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={[
                      'fd-sidebar__item',
                      isActive ? 'fd-sidebar__item--active' : '',
                      item.disabled ? 'fd-sidebar__item--disabled' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    disabled={item.disabled}
                    aria-current={isActive ? 'page' : undefined}
                    aria-label={collapsed ? item.label : undefined}
                    title={collapsed ? item.label : undefined}
                    onClick={item.view ? () => onNavigate(item.view!) : undefined}
                  >
                    <span className="fd-sidebar__dot" aria-hidden="true" />
                    <span className="fd-sidebar__label">{item.label}</span>
                    {item.soon && !collapsed && (
                      <span className="fd-sidebar__soon">{item.soon}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

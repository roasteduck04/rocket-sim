import { useId, useRef } from 'react';
import type { ReactNode } from 'react';

export interface TabItem {
  id: string;
  label: ReactNode;
  content?: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: ReadonlyArray<TabItem>;
  value: string;
  onChange: (id: string) => void;
  /** Render the active tab's `content` in a tabpanel below. Default true. */
  renderPanel?: boolean;
  className?: string;
  'aria-label'?: string;
}

/**
 * Tabs — an ARIA tablist with roving focus. Left/Right move between tabs
 * (wrapping, skipping disabled), Home/End jump to the ends, and selection
 * follows focus. Renders the active tab's `content` in a tabpanel unless
 * `renderPanel` is false (when the caller lays out panels itself).
 */
export function Tabs({
  tabs,
  value,
  onChange,
  renderPanel = true,
  className,
  'aria-label': ariaLabel,
}: TabsProps) {
  const baseId = useId();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const move = (dir: 1 | -1) => {
    const enabled = tabs.filter((t) => !t.disabled);
    const at = enabled.findIndex((t) => t.id === value);
    if (at === -1) return;
    const next = enabled[(at + dir + enabled.length) % enabled.length];
    onChange(next.id);
    refs.current[next.id]?.focus();
  };
  const jump = (which: 'first' | 'last') => {
    const enabled = tabs.filter((t) => !t.disabled);
    const t = which === 'first' ? enabled[0] : enabled[enabled.length - 1];
    if (!t) return;
    onChange(t.id);
    refs.current[t.id]?.focus();
  };

  const active = tabs.find((t) => t.id === value);

  return (
    <div className={['fd-tabs', className].filter(Boolean).join(' ')}>
      <div className="fd-tabs__list" role="tablist" aria-label={ariaLabel}>
        {tabs.map((t) => {
          const selected = t.id === value;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[t.id] = el;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              disabled={t.disabled}
              className={['fd-tab', selected ? 'fd-tab--active' : '']
                .filter(Boolean)
                .join(' ')}
              onClick={() => onChange(t.id)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') {
                  e.preventDefault();
                  move(1);
                } else if (e.key === 'ArrowLeft') {
                  e.preventDefault();
                  move(-1);
                } else if (e.key === 'Home') {
                  e.preventDefault();
                  jump('first');
                } else if (e.key === 'End') {
                  e.preventDefault();
                  jump('last');
                }
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {renderPanel && active && (
        <div
          role="tabpanel"
          id={`${baseId}-panel-${active.id}`}
          aria-labelledby={`${baseId}-tab-${active.id}`}
          className="fd-tabs__panel"
          tabIndex={0}
        >
          {active.content}
        </div>
      )}
    </div>
  );
}

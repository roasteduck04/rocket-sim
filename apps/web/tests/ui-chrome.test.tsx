/**
 * Phase 8 Stage 2 — chrome primitives (Panel / Stat / Chip / Button).
 * Contract tests: correct markup/roles, variant + status classes, and the
 * disabled/busy semantics on Button. No jest-dom matchers (matching the suite).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { Panel } from '../src/ui/Panel';
import { Stat } from '../src/ui/Stat';
import { Chip } from '../src/ui/Chip';
import { Button } from '../src/ui/Button';

afterEach(cleanup);

describe('Panel', () => {
  it('renders a titled section with an action slot and its children', () => {
    render(
      <Panel title="Telemetry" action={<span>live</span>}>
        <p>body</p>
      </Panel>,
    );
    const heading = screen.getByRole('heading', { name: 'Telemetry' });
    expect(heading).toBeTruthy();
    expect(heading.className).toContain('fd-panel__title');
    expect(screen.getByText('live')).toBeTruthy();
    expect(screen.getByText('body')).toBeTruthy();
  });

  it('omits the header when there is no title or action', () => {
    const { container } = render(<Panel>bare</Panel>);
    expect(container.querySelector('.fd-panel__head')).toBeNull();
    expect(container.querySelector('.fd-panel')?.className).toContain('fd-panel');
  });

  it('merges a caller className onto the panel', () => {
    const { container } = render(<Panel className="wide">x</Panel>);
    expect(container.querySelector('.fd-panel')?.className).toContain('wide');
  });
});

describe('Stat', () => {
  it('shows label, value, and optional unit', () => {
    const { container } = render(<Stat label="Apogee" value="1234" unit="m" />);
    expect(screen.getByText('Apogee').className).toContain('fd-stat__label');
    expect(screen.getByText('1234').className).toContain('fd-stat__value');
    expect(container.querySelector('.fd-stat__unit')?.textContent).toBe('m');
  });

  it('renders no unit element when unit is omitted', () => {
    const { container } = render(<Stat label="Mach" value="0.82" />);
    expect(container.querySelector('.fd-stat__unit')).toBeNull();
  });
});

describe('Chip', () => {
  it('defaults to the neutral tone', () => {
    const { container } = render(<Chip>idle</Chip>);
    expect(container.querySelector('.fd-chip')?.className).toContain('fd-chip--neutral');
  });

  it.each(['good', 'warning', 'serious', 'critical', 'accent'] as const)(
    'applies the %s tone class',
    (tone) => {
      const { container } = render(<Chip tone={tone}>{tone}</Chip>);
      expect(container.querySelector('.fd-chip')?.className).toContain(`fd-chip--${tone}`);
    },
  );
});

describe('Button', () => {
  it('defaults to a primary, md, type=button control', () => {
    render(<Button>Run</Button>);
    const btn = screen.getByRole('button', { name: 'Run' }) as HTMLButtonElement;
    expect(btn.type).toBe('button');
    expect(btn.className).toContain('fd-btn--primary');
    expect(btn.className).toContain('fd-btn--md');
  });

  it('fires onClick when enabled', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled and does not fire when busy, and marks aria-busy', () => {
    const onClick = vi.fn();
    render(
      <Button busy onClick={onClick}>
        Saving
      </Button>,
    );
    const btn = screen.getByRole('button', { name: 'Saving' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('honors an explicit disabled prop', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Nope
      </Button>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Nope' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('supports the danger and secondary variants', () => {
    const { container } = render(
      <>
        <Button variant="secondary">A</Button>
        <Button variant="danger" size="sm">
          B
        </Button>
      </>,
    );
    const [a, b] = Array.from(container.querySelectorAll('button'));
    expect(a.className).toContain('fd-btn--secondary');
    expect(b.className).toContain('fd-btn--danger');
    expect(b.className).toContain('fd-btn--sm');
  });
});

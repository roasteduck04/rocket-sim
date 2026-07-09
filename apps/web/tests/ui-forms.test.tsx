/**
 * Phase 8 Stage 3 — form/editor primitives.
 * NumberField (scrub / clamp / keyboard / commit), Select, Slider, Tabs,
 * Tree (expand / select / keyboard), and Modal (focus-trap + Esc). No jest-dom
 * matchers, matching the rest of the suite.
 */

import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { NumberField } from '../src/ui/NumberField';
import { Select } from '../src/ui/Select';
import { Slider } from '../src/ui/Slider';
import { Tabs } from '../src/ui/Tabs';
import { Tree, type TreeNode } from '../src/ui/Tree';
import { Modal } from '../src/ui/Modal';

// jsdom lacks PointerEvent + pointer-capture; polyfill just enough for scrub.
beforeAll(() => {
  if (typeof (globalThis as Record<string, unknown>).PointerEvent !== 'function') {
    class PointerEventFake extends MouseEvent {
      pointerId: number;
      constructor(type: string, props: PointerEventInit = {}) {
        super(type, props);
        this.pointerId = props.pointerId ?? 1;
      }
    }
    (globalThis as Record<string, unknown>).PointerEvent = PointerEventFake;
  }
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
});

afterEach(cleanup);

/** Controlled NumberField harness so onChange feeds value back in. */
function NF(props: Partial<React.ComponentProps<typeof NumberField>> & { initial?: number }) {
  const { initial = 5, ...rest } = props;
  const [v, setV] = useState(initial);
  return (
    <NumberField
      label={rest.label ?? 'Altitude'}
      value={v}
      onChange={setV}
      {...rest}
    />
  );
}

describe('NumberField', () => {
  it('commits a typed value on blur, snapping to step', () => {
    const onChange = vi.fn();
    render(<NumberField label="Rate" value={5} onChange={onChange} step={5} />);
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '23' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(25); // snapped to nearest 5
  });

  it('reverts a non-numeric entry on blur', () => {
    const onChange = vi.fn();
    render(<NumberField label="Rate" value={7} onChange={onChange} />);
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe('7');
  });

  it('increments with ArrowUp and ×10 with Shift', () => {
    render(<NF initial={10} step={2} />);
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input.value).toBe('12');
    fireEvent.keyDown(input, { key: 'ArrowUp', shiftKey: true });
    expect(input.value).toBe('32');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.value).toBe('30');
  });

  it('scrubs the label and clamps to [min, max]', () => {
    render(<NF initial={5} step={1} min={0} max={10} scrubPxPerStep={4} />);
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    const label = screen.getByText('Altitude');
    // dx = +40px @ 4px/step => +10 steps => 15, clamped to max 10.
    fireEvent.pointerDown(label, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(label, { clientX: 140, pointerId: 1 });
    expect(input.getAttribute('aria-valuenow')).toBe('10');
    // Drag back below min => clamps to 0.
    fireEvent.pointerMove(label, { clientX: 40, pointerId: 1 });
    expect(input.getAttribute('aria-valuenow')).toBe('0');
    fireEvent.pointerUp(label, { clientX: 40, pointerId: 1 });
  });

  it('renders the unit suffix', () => {
    render(<NumberField label="Speed" value={3} onChange={() => {}} unit="m/s" />);
    expect(screen.getByText('m/s')).toBeTruthy();
  });
});

describe('Select', () => {
  it('renders options and emits the chosen value', () => {
    const onChange = vi.fn();
    render(
      <Select
        label="Phase"
        value="ascent"
        onChange={onChange}
        options={[
          { value: 'ascent', label: 'Ascent' },
          { value: 'landing', label: 'Landing' },
        ]}
      />,
    );
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(within(select).getAllByRole('option')).toHaveLength(2);
    fireEvent.change(select, { target: { value: 'landing' } });
    expect(onChange).toHaveBeenCalledWith('landing');
  });
});

describe('Slider', () => {
  it('emits a number and shows the readout with unit', () => {
    const onChange = vi.fn();
    render(
      <Slider label="Throttle" value={40} onChange={onChange} min={0} max={100} unit="%" />,
    );
    const range = screen.getByRole('slider') as HTMLInputElement;
    fireEvent.change(range, { target: { value: '60' } });
    expect(onChange).toHaveBeenCalledWith(60);
    expect(screen.getByText('%')).toBeTruthy();
  });
});

describe('Tabs', () => {
  const tabs = [
    { id: 'a', label: 'Alpha', content: <p>panel-a</p> },
    { id: 'b', label: 'Bravo', content: <p>panel-b</p> },
  ];

  it('switches panel on click and via ArrowRight', () => {
    function Harness() {
      const [v, setV] = useState('a');
      return <Tabs tabs={tabs} value={v} onChange={setV} aria-label="views" />;
    }
    render(<Harness />);
    expect(screen.getByText('panel-a')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Bravo' }));
    expect(screen.getByText('panel-b')).toBeTruthy();
    // ArrowLeft wraps focus/selection back to Alpha.
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Bravo' }), { key: 'ArrowLeft' });
    expect(screen.getByText('panel-a')).toBeTruthy();
  });

  it('marks the active tab aria-selected', () => {
    render(<Tabs tabs={tabs} value="b" onChange={() => {}} />);
    expect(screen.getByRole('tab', { name: 'Bravo' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Alpha' }).getAttribute('aria-selected')).toBe('false');
  });
});

describe('Tree', () => {
  const nodes: TreeNode[] = [
    {
      id: 'rocket',
      label: 'Rocket',
      children: [
        { id: 'nose', label: 'Nose cone' },
        { id: 'body', label: 'Body tube' },
      ],
    },
    { id: 'motor', label: 'Motor' },
  ];

  function TreeHarness() {
    const [sel, setSel] = useState('rocket');
    return <Tree nodes={nodes} selectedId={sel} onSelect={setSel} defaultExpandedIds={['rocket']} />;
  }

  it('renders expanded children and selects on click', () => {
    render(<TreeHarness />);
    expect(screen.getByText('Nose cone')).toBeTruthy();
    fireEvent.click(screen.getByText('Body tube'));
    const item = screen.getByText('Body tube').closest('[role="treeitem"]');
    expect(item?.getAttribute('aria-selected')).toBe('true');
  });

  it('collapses with ArrowLeft, hiding the children', () => {
    render(<TreeHarness />);
    const rocket = screen.getByText('Rocket').closest('[role="treeitem"]') as HTMLElement;
    expect(rocket.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(rocket, { key: 'ArrowLeft' });
    expect(screen.queryByText('Nose cone')).toBeNull();
    expect(
      screen.getByText('Rocket').closest('[role="treeitem"]')?.getAttribute('aria-expanded'),
    ).toBe('false');
  });

  it('moves selection down with ArrowDown', () => {
    render(<TreeHarness />);
    const rocket = screen.getByText('Rocket').closest('[role="treeitem"]') as HTMLElement;
    fireEvent.keyDown(rocket, { key: 'ArrowDown' });
    expect(
      screen.getByText('Nose cone').closest('[role="treeitem"]')?.getAttribute('aria-selected'),
    ).toBe('true');
  });
});

describe('Modal', () => {
  function ModalHarness({ onClose }: { onClose: () => void }) {
    return (
      <Modal open onClose={onClose} title="Confirm" footer={<button>OK</button>}>
        <input aria-label="name" />
        <button>Cancel</button>
      </Modal>
    );
  }

  it('renders a labelled dialog and focuses the first control (the close button)', () => {
    render(<ModalHarness onClose={() => {}} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<ModalHarness onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('traps Tab from the last element back to the first', () => {
    render(<ModalHarness onClose={() => {}} />);
    const ok = screen.getByRole('button', { name: 'OK' });
    ok.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
  });

  it('wraps Shift+Tab from the first element to the last', () => {
    render(<ModalHarness onClose={() => {}} />);
    const close = screen.getByRole('button', { name: 'Close' });
    close.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'OK' }));
  });

  it('renders nothing when closed', () => {
    const { container } = render(
      <Modal open={false} onClose={() => {}} title="X">
        body
      </Modal>,
    );
    expect(container.querySelector('.fd-modal')).toBeNull();
    expect(document.querySelector('.fd-modal')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DesignStudioView } from '../src/features/design-studio/DesignStudioView';
import { MOTORS, MOTOR_IDS } from '../src/features/design-studio/motorCatalog';

describe('motorCatalog', () => {
  it('parses all three bundled .eng files to finite stats', () => {
    // Task 14 context note #3: a known upstream `Motor.avgThrustN` NaN risk
    // was flagged for these files. Verified finite for all three motors —
    // see task-14-report.md for the exact parsed values.
    for (const id of MOTOR_IDS) {
      const m = MOTORS[id];
      expect(Number.isFinite(m.totalImpulseNs)).toBeTruthy();
      expect(Number.isFinite(m.avgThrustN)).toBeTruthy();
      expect(Number.isFinite(m.burnTimeS)).toBeTruthy();
    }
  });
});

describe('MotorPicker', () => {
  it('shows motor stats and switches motor', () => {
    render(<DesignStudioView />);
    expect(screen.getByText('Total impulse')).toBeTruthy();
    const select = screen.getByLabelText('Motor') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'Estes_B6' } });
    expect((screen.getByLabelText('Motor') as HTMLSelectElement).value).toBe('Estes_B6');
  });
});

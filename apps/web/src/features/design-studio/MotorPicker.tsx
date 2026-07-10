/**
 * Task 14 — motor picker. Lets the user choose one of the bundled Estes
 * motors and shows its key stats (total impulse, average thrust, burn time).
 */

import type { JSX } from 'react';
import type { RocketDesign } from '@fds/rocket-design';
import { Select, Stat } from '../../ui';
import type { DesignAction } from './designModel';
import { MOTORS, MOTOR_IDS } from './motorCatalog';

export function MotorPicker({
  design,
  dispatch,
}: {
  design: RocketDesign;
  dispatch: (a: DesignAction) => void;
}): JSX.Element {
  const motor = MOTORS[design.motorId] ?? MOTORS[MOTOR_IDS[0]];
  return (
    <div className="ds-motor">
      <Select
        label="Motor"
        value={design.motorId}
        onChange={(v) => dispatch({ type: 'setMotor', motorId: v })}
        options={MOTOR_IDS.map((id) => ({
          value: id,
          label: `${MOTORS[id].designation} (${MOTORS[id].impulseClass})`,
        }))}
      />
      <Stat label="Total impulse" value={motor.totalImpulseNs.toFixed(1)} unit="N·s" />
      <Stat label="Avg thrust" value={motor.avgThrustN.toFixed(1)} unit="N" />
      <Stat label="Burn time" value={motor.burnTimeS.toFixed(2)} unit="s" />
    </div>
  );
}

/**
 * 3D trajectory view (README §9 Module A) — react-three-fiber scene drawing
 * the flight path with event markers (max-Q, apogee / burn ignition, target).
 *
 * Frame mapping: NED telemetry → three.js right-handed y-up scene as
 * (x, y, z) = (East, Up, −North), i.e. x̂×ŷ = ẑ holds with ŷ = −D̂.
 * The whole path is scaled uniformly so the largest extent spans ~8 scene
 * units regardless of whether it's a 5 km ascent or a 2 km landing burn.
 */

import { useEffect, useMemo, type JSX } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import {
  BufferGeometry,
  Line as ThreeLine,
  LineBasicMaterial,
  Vector3,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { RunSummary, TelemetryFrame } from '@fds/rocket-sim';
import { AXIS, GRID, INK_2, SERIES, STATUS } from '../../lib/palette';

const toScene = (f: TelemetryFrame, k: number): Vector3 =>
  new Vector3(f.r.y * k, f.altitude * k, -f.r.x * k);

/** Frame nearest a summary event time (telemetry may be decimated). */
const frameAt = (telemetry: TelemetryFrame[], t: number): TelemetryFrame | undefined => {
  let best: TelemetryFrame | undefined;
  let dBest = Infinity;
  for (const f of telemetry) {
    const d = Math.abs(f.t - t);
    if (d < dBest) {
      dBest = d;
      best = f;
    }
  }
  return best;
};

const PathLine = ({ pts, color }: { pts: Vector3[]; color: string }): JSX.Element => {
  const obj = useMemo(
    () => new ThreeLine(new BufferGeometry().setFromPoints(pts), new LineBasicMaterial({ color })),
    [pts, color],
  );
  useEffect(
    () => () => {
      obj.geometry.dispose();
      (obj.material as LineBasicMaterial).dispose();
    },
    [obj],
  );
  return <primitive object={obj} />;
};

const Marker = ({
  position,
  color,
  size = 0.14,
}: {
  position: Vector3;
  color: string;
  size?: number;
}): JSX.Element => (
  <mesh position={position}>
    <sphereGeometry args={[size, 16, 16]} />
    <meshBasicMaterial color={color} />
  </mesh>
);

const Controls = (): null => {
  const { camera, gl } = useThree();
  useEffect(() => {
    const c = new OrbitControls(camera, gl.domElement);
    c.target.set(0, 2.5, 0);
    c.update();
    return () => c.dispose();
  }, [camera, gl]);
  return null;
};

export const TrajectoryScene = ({
  telemetry,
  summary,
  mode,
}: {
  telemetry: TelemetryFrame[];
  summary: RunSummary | null;
  mode: 'ascent' | 'landing';
}): JSX.Element => {
  const { pts, k } = useMemo(() => {
    if (telemetry.length === 0) return { pts: [] as Vector3[], k: 1 };
    let extent = 1;
    for (const f of telemetry) {
      extent = Math.max(extent, Math.abs(f.r.x), Math.abs(f.r.y), f.altitude);
    }
    const scale = 8 / extent;
    return { pts: telemetry.map((f) => toScene(f, scale)), k: scale };
  }, [telemetry]);

  const maxQ = summary && telemetry.length > 0 ? frameAt(telemetry, summary.maxQbarTime) : undefined;
  const apogee =
    summary && mode === 'ascent' && telemetry.length > 0
      ? frameAt(telemetry, summary.apogeeTime)
      : undefined;
  const ignition =
    summary?.landing?.ignitionTime != null && telemetry.length > 0
      ? frameAt(telemetry, summary.landing.ignitionTime)
      : undefined;

  return (
    <div>
      <div className="scene-canvas">
        <Canvas camera={{ position: [11, 8, 12], fov: 50 }}>
          <Controls />
          <gridHelper args={[20, 20, AXIS, GRID]} />
          {/* launch pad / landing target at the NED origin */}
          <Marker position={new Vector3(0, 0, 0)} color={STATUS.good} size={0.18} />
          {pts.length > 1 && <PathLine pts={pts} color={SERIES.blue} />}
          {pts.length > 0 && <Marker position={pts[pts.length - 1]} color={INK_2} size={0.12} />}
          {maxQ && <Marker position={toScene(maxQ, k)} color={SERIES.yellow} />}
          {apogee && <Marker position={toScene(apogee, k)} color={SERIES.violet} />}
          {ignition && <Marker position={toScene(ignition, k)} color={STATUS.warning} />}
        </Canvas>
      </div>
      <p className="hint">
        Drag to orbit, scroll to zoom. Markers: <span style={{ color: STATUS.good }}>●</span> pad /
        target · <span style={{ color: SERIES.yellow }}>●</span> max-Q
        {mode === 'ascent' ? (
          <>
            {' '}
            · <span style={{ color: SERIES.violet }}>●</span> apogee
          </>
        ) : (
          <>
            {' '}
            · <span style={{ color: STATUS.warning }}>●</span> burn ignition
          </>
        )}{' '}
        · <span style={{ color: INK_2 }}>●</span> final state
      </p>
    </div>
  );
};

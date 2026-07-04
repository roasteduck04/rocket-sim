/**
 * Module C view (README §6.4, §9): real-time stick-and-rudder response of the
 * linearized model, integrated RK4 at a fixed dt = 1/60 s inside the rAF
 * accumulator loop, driving the attitude indicator, scrolling strip charts,
 * the live modal readout, and the doublet mode-excitation buttons.
 *
 * Control sign closure (standard aerospace conventions, §9):
 *  - pull stick (+pitch cmd) → δe < 0 → nose-up (Cm_δe < 0);
 *  - stick right (+roll cmd) → δa > 0 → right-wing-down (Cl_δa > 0);
 *  - right pedal (+rudder cmd) → δr < 0 → nose-right (Cn_δr < 0).
 */

import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { AircraftSim, doubletInput } from '@fds/aircraft-sim';
import { AIRCRAFT_LIBRARY, loadAircraft, type AircraftId } from '../../lib/data';
import { useFixedTimestepLoop } from '../../lib/useFixedTimestepLoop';
import { degToRad, fmt, fmtDeg } from '../../lib/unitsDisplay';
import { AttitudeIndicator } from './AttitudeIndicator';
import { StickWidget } from './StickWidget';
import { StripCharts, type StripSample } from './StripCharts';
import { ModalReadout } from './ModalReadout';
import { DoubletButtons, type DoubletSpec } from './DoubletButtons';

const DT = 1 / 60;
/** Typical surface limits (README §6.4). */
const DE_MAX = degToRad(25);
const DA_MAX = degToRad(20);
const DR_MAX = degToRad(25);
/** Strip-chart window and sampling. */
const SAMPLE_EVERY_TICKS = 3; // 20 Hz
const WINDOW_S = 20;
const MAX_SAMPLES = Math.ceil((WINDOW_S / DT) / SAMPLE_EVERY_TICKS);
const CHART_PUSH_EVERY_FRAMES = 6; // ~10 Hz chart refresh

interface ActiveDoublet {
  channel: DoubletSpec['channel'];
  fn: (t: number) => number;
  until: number;
}

interface Display {
  t: number;
  phi: number;
  theta: number;
  alpha: number;
  beta: number;
  q: number;
  roll: number;
  pitch: number;
  rudder: number;
}

const ZERO_DISPLAY: Display = {
  t: 0,
  phi: 0,
  theta: 0,
  alpha: 0,
  beta: 0,
  q: 0,
  roll: 0,
  pitch: 0,
  rudder: 0,
};

const Stat = ({ label, value, unit }: { label: string; value: string; unit: string }): JSX.Element => (
  <div className="stat">
    <span className="label">{label}</span>
    <span className="value">{value}</span>
    <span className="unit">{unit}</span>
  </div>
);

export const AircraftView = (): JSX.Element => {
  const [aircraftId, setAircraftId] = useState<AircraftId>('navion');
  const [u0Override, setU0Override] = useState<number | null>(null);

  const cfg = useMemo(() => {
    const base = loadAircraft(aircraftId);
    return u0Override === null
      ? base
      : { ...base, trim: { ...base.trim, U0Mps: u0Override } };
  }, [aircraftId, u0Override]);

  const sim = useMemo(() => new AircraftSim(cfg), [cfg]);

  const stick = useRef({ roll: 0, pitch: 0, rudder: 0 });
  const keys = useRef(new Set<string>());
  const doublets = useRef<ActiveDoublet[]>([]);
  const buffer = useRef<StripSample[]>([]);
  const tickCount = useRef(0);
  const frameCount = useRef(0);
  const [display, setDisplay] = useState<Display>(ZERO_DISPLAY);
  const [chartData, setChartData] = useState<StripSample[]>([]);

  // New aircraft or trim → restart from trim with clean traces.
  useEffect(() => {
    sim.reset();
    doublets.current = [];
    buffer.current = [];
    tickCount.current = 0;
    setChartData([]);
    setDisplay(ZERO_DISPLAY);
  }, [sim]);

  useEffect(() => {
    const down = (e: KeyboardEvent): void => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
      keys.current.add(e.key.toLowerCase());
    };
    const up = (e: KeyboardEvent): void => {
      keys.current.delete(e.key.toLowerCase());
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const commanded = (): { roll: number; pitch: number; rudder: number } => {
    const k = keys.current;
    const kb = {
      roll: (k.has('arrowright') ? 1 : 0) - (k.has('arrowleft') ? 1 : 0),
      pitch: (k.has('arrowdown') ? 1 : 0) - (k.has('arrowup') ? 1 : 0), // ↓ = pull
      rudder: (k.has('x') ? 1 : 0) - (k.has('z') ? 1 : 0),
    };
    const clamp = (v: number): number => Math.max(-1, Math.min(1, v));
    return {
      roll: clamp(stick.current.roll + kb.roll),
      pitch: clamp(stick.current.pitch + kb.pitch),
      rudder: clamp(stick.current.rudder + kb.rudder),
    };
  };

  useFixedTimestepLoop(
    (dt) => {
      const t = sim.state.t;
      const cmd = commanded();
      doublets.current = doublets.current.filter((d) => t < d.until);
      const extra = (ch: ActiveDoublet['channel']): number =>
        doublets.current.filter((d) => d.channel === ch).reduce((s, d) => s + d.fn(t), 0);

      const de = -cmd.pitch * DE_MAX + extra('elevator');
      const da = cmd.roll * DA_MAX + extra('aileron');
      const dr = -cmd.rudder * DR_MAX + extra('rudder');
      sim.step([de, 0], [da, dr], dt);

      tickCount.current += 1;
      if (tickCount.current % SAMPLE_EVERY_TICKS === 0) {
        const s = sim.state;
        const toDeg = 180 / Math.PI;
        buffer.current.push({
          t: s.t,
          alphaDeg: s.lon[1] * toDeg,
          betaDeg: s.lat[0] * toDeg,
          pDeg: s.lat[1] * toDeg,
          qDeg: s.lon[2] * toDeg,
          rDeg: s.lat[2] * toDeg,
          phiDeg: s.lat[3] * toDeg,
          thetaDeg: s.lon[3] * toDeg,
        });
        if (buffer.current.length > MAX_SAMPLES) {
          buffer.current.splice(0, buffer.current.length - MAX_SAMPLES);
        }
      }
    },
    () => {
      const s = sim.state;
      const cmd = commanded();
      setDisplay({
        t: s.t,
        phi: s.lat[3],
        theta: s.lon[3],
        alpha: s.lon[1],
        beta: s.lat[0],
        q: s.lon[2],
        roll: cmd.roll,
        pitch: cmd.pitch,
        rudder: cmd.rudder,
      });
      frameCount.current += 1;
      if (frameCount.current % CHART_PUSH_EVERY_FRAMES === 0) {
        setChartData([...buffer.current]);
      }
    },
    DT,
    true,
  );

  const fireDoublet = (spec: DoubletSpec): void => {
    const t = sim.state.t;
    doublets.current.push({
      channel: spec.channel,
      fn: doubletInput(t, spec.width, spec.amplitude),
      until: t + 2 * spec.width,
    });
  };

  return (
    <div className="module-grid">
      <aside className="stack">
        <div className="panel">
          <h2>Aircraft &amp; trim</h2>
          <div className="field">
            <label>Aircraft</label>
            <select
              value={aircraftId}
              onChange={(e) => {
                setAircraftId(e.target.value as AircraftId);
                setU0Override(null);
              }}
            >
              {AIRCRAFT_LIBRARY.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Trim U₀ (m/s)</label>
            <input
              type="number"
              value={u0Override ?? cfg.trim.U0Mps}
              step={5}
              min={30}
              max={150}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v) && v > 0) setU0Override(v);
              }}
            />
          </div>
          <div className="btn-row">
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                sim.reset();
                doublets.current = [];
                buffer.current = [];
                setChartData([]);
              }}
            >
              Reset to trim
            </button>
          </div>
          <p className="hint">
            Keys: <span className="kbd">↑</span>
            <span className="kbd">↓</span> elevator · <span className="kbd">←</span>
            <span className="kbd">→</span> aileron · <span className="kbd">Z</span>
            <span className="kbd">X</span> rudder
          </p>
        </div>
        <DoubletButtons onFire={fireDoublet} />
        <ModalReadout cfg={cfg} />
      </aside>
      <section className="stack">
        <div className="panel">
          <h2>Cockpit — {cfg.name}</h2>
          <div className="cockpit-row">
            <AttitudeIndicator phiRad={display.phi} thetaRad={display.theta} />
            <StickWidget
              roll={display.roll}
              pitch={display.pitch}
              rudder={display.rudder}
              onStick={(r, p) => {
                stick.current.roll = r;
                stick.current.pitch = p;
              }}
              onRudder={(r) => {
                stick.current.rudder = r;
              }}
            />
            <div className="stat-grid" style={{ flex: 1, minWidth: 200 }}>
              <Stat label="t" value={fmt(display.t, 1)} unit="s" />
              <Stat label="Δα" value={fmtDeg(display.alpha)} unit="deg" />
              <Stat label="β" value={fmtDeg(display.beta)} unit="deg" />
              <Stat label="q" value={fmtDeg(display.q)} unit="deg/s" />
              <Stat label="φ" value={fmtDeg(display.phi)} unit="deg" />
              <Stat label="Δθ" value={fmtDeg(display.theta)} unit="deg" />
            </div>
          </div>
        </div>
        <StripCharts data={chartData} />
      </section>
    </div>
  );
};

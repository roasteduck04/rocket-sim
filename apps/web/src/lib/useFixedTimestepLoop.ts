/**
 * requestAnimationFrame fixed-timestep accumulator (README §7): the physics
 * tick runs at a fixed dt regardless of display refresh rate, so the simulated
 * dynamics are identical on a 60 Hz laptop and a 144 Hz monitor; `render` runs
 * once per animation frame with whatever state the ticks produced.
 */

import { useEffect, useRef } from 'react';

/** Clamp on a single frame's wall-clock delta (tab switches, debugger pauses). */
const MAX_FRAME_S = 0.25;

export const useFixedTimestepLoop = (
  tick: (dt: number) => void,
  render: () => void,
  dt: number,
  running: boolean,
): void => {
  // Latest callbacks without restarting the loop on every parent re-render.
  const fns = useRef({ tick, render });
  fns.current = { tick, render };

  useEffect(() => {
    if (!running) return undefined;
    let raf = 0;
    let last: number | null = null;
    let acc = 0;
    const frame = (now: number): void => {
      if (last !== null) {
        acc += Math.min((now - last) / 1000, MAX_FRAME_S);
        while (acc >= dt) {
          fns.current.tick(dt);
          acc -= dt;
        }
      }
      last = now;
      fns.current.render();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [dt, running]);
};

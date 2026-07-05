/**
 * Playback clock (landing-sim spec §3): a rAF loop maps wall time × warp →
 * sim time; pause, scrub, warp, and replay are operations on the clock only —
 * the physics already ran, once, in the worker.
 */

import { useEffect, useRef, useState } from 'react';
import type { TelemetryFrame } from '@fds/rocket-sim';
import { sampleAt, type PlaybackSample } from './playbackMath';

/** Clamp on a single frame's wall delta (tab switches), same as useFixedTimestepLoop. */
const MAX_FRAME_S = 0.25;

export interface Playback {
  sample: PlaybackSample;
  tSim: number;
  duration: number;
  playing: boolean;
  warp: number;
  /** True once playback has reached the end of the recording. */
  done: boolean;
  play(): void;
  pause(): void;
  seek(t: number): void;
  setWarp(w: number): void;
  replay(): void;
}

export const usePlayback = (frames: TelemetryFrame[], initialWarp = 5): Playback => {
  const duration = frames.length > 0 ? frames[frames.length - 1].t : 0;
  const [tSim, setTSim] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [warp, setWarp] = useState(initialWarp);

  // Mutable clock read by the rAF loop without restarting it (same pattern as
  // useFixedTimestepLoop's fns ref).
  const clock = useRef({ playing: true, warp: initialWarp, t: 0 });
  clock.current.playing = playing;
  clock.current.warp = warp;

  useEffect(() => {
    let raf = 0;
    let last: number | null = null;
    const frame = (now: number): void => {
      if (last !== null && clock.current.playing) {
        const dt = Math.min((now - last) / 1000, MAX_FRAME_S) * clock.current.warp;
        clock.current.t = Math.min(duration, clock.current.t + dt);
        setTSim(clock.current.t);
        if (clock.current.t >= duration) setPlaying(false);
      }
      last = now;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [duration]);

  return {
    sample: sampleAt(frames, tSim),
    tSim,
    duration,
    playing,
    warp,
    done: duration > 0 && tSim >= duration,
    play: () => setPlaying(true),
    pause: () => setPlaying(false),
    seek: (t: number) => {
      clock.current.t = Math.min(duration, Math.max(0, t));
      setTSim(clock.current.t);
    },
    setWarp,
    replay: () => {
      clock.current.t = 0;
      setTSim(0);
      setPlaying(true);
    },
  };
};

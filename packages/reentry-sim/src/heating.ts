/**
 * Stagnation-point heating (README §5.2).
 *
 * Sutton–Graves convective correlation q̇ₛ = k_Q·√(ρ/R_n)·V³ (SI: ρ kg/m³,
 * V m/s, R_n m → W/m²), plus a trapezoidal accumulator for the integrated
 * heat load Q_total = ∫q̇ₛ dt that tolerates the adaptive driver's varying
 * step sizes.
 */

import { K_SUTTON_GRAVES } from '@fds/physics-core';

/** Sutton–Graves stagnation-point convective heat flux, W/m² (README §5.2). */
export const suttonGraves = (rho: number, V: number, Rn: number): number =>
  K_SUTTON_GRAVES * Math.sqrt(rho / Rn) * V * V * V;

/** Trapezoidal ∫q̇ₛ dt accumulator over (possibly uneven) accepted steps. */
export class HeatLoadAccumulator {
  private tPrev = 0;
  private qdotPrev = 0;
  private started = false;
  private total = 0;

  /** Fold in a sample; the first call only sets the starting point. */
  add(t: number, qdotS: number): void {
    if (this.started) {
      this.total += 0.5 * (qdotS + this.qdotPrev) * (t - this.tPrev);
    }
    this.tPrev = t;
    this.qdotPrev = qdotS;
    this.started = true;
  }

  /** Integrated heat load so far, J/m². */
  get totalJm2(): number {
    return this.total;
  }
}

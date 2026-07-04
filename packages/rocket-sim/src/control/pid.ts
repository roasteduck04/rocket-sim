/**
 * PID controller for the TVC attitude loop (README §4.6).
 *
 * The control law, per channel:
 * ```
 * out = Kp·err + Ki·∫err dt + Kd·errRate
 * ```
 * The derivative term is fed by the MEASURED rate, not by differentiating the
 * error (README §4.6: `Kd_θ·(−q)`), so a step change in the commanded attitude
 * produces no derivative kick and no numerical differentiation noise. The caller
 * passes `errRate = −q` (pitch) or `−r` (yaw): for a constant command,
 * d(err)/dt = −θ̇ ≈ −q.
 *
 * Anti-windup: the integral state is clamped so its output contribution
 * `Ki·∫err dt` never exceeds ±`integralLimit` (output units). Without this, a
 * saturated actuator lets the integral accumulate without bound and the loop
 * overshoots badly on recovery.
 */

/** PID gains (README §8.1 `control.pid_*`). */
export interface PidGains {
  kp: number;
  ki: number;
  kd: number;
}

export interface PidOptions {
  /**
   * Clamp on the integral CONTRIBUTION `Ki·∫err dt`, in output units
   * (default Infinity = no clamp). The attitude controller sets this to the
   * gimbal deflection limit so the integral alone can never demand more than
   * full actuator authority.
   */
  integralLimit?: number;
}

export class Pid {
  /** Accumulated ∫err dt, error·s. */
  private integral = 0;
  private readonly integralLimit: number;

  constructor(
    private readonly gains: PidGains,
    opts: PidOptions = {},
  ) {
    this.integralLimit = opts.integralLimit ?? Infinity;
  }

  /** Clear the integral state (e.g. on guidance-mode change). */
  reset(): void {
    this.integral = 0;
  }

  /**
   * Advance the integral by `dt` and return the control output for the current
   * error and measured error rate (−q or −r for attitude channels).
   */
  update(error: number, errorRate: number, dt: number): number {
    const { kp, ki, kd } = this.gains;
    this.integral += error * dt;
    // Anti-windup: keep ki·integral within ±integralLimit.
    if (ki > 0 && Number.isFinite(this.integralLimit)) {
      const cap = this.integralLimit / ki;
      this.integral = Math.min(cap, Math.max(-cap, this.integral));
    }
    return kp * error + ki * this.integral + kd * errorRate;
  }

  /** Current integral contribution `Ki·∫err dt`, output units (for telemetry/tests). */
  get integralTerm(): number {
    return this.gains.ki * this.integral;
  }
}

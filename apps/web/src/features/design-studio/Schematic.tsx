/**
 * Task 13 — live side-view schematic. Draws each part of the current design
 * to scale (nose/tube/fins; `mass` parts are zero-length hardware stand-ins
 * and render nothing), then overlays a CG tick (blue/series-1) and a CP tick
 * (accent teal) with a static-margin caption below.
 *
 * `partStations`/`barrowman`/`dryMassProps`/`staticMarginCal` are the same
 * `@fds/rocket-design` functions the aero/mass tasks already rely on — see
 * `massModel.ts` and `barrowman.ts` for their exact station/CP/CG math.
 */

import type { JSX } from 'react';
import type { RocketDesign } from '@fds/rocket-design';
import { barrowman, dryMassProps, partStations, staticMarginCal } from '@fds/rocket-design';

const VW = 720;
const VH = 160;
const PAD = 24;

export function Schematic({ design }: { design: RocketDesign }): JSX.Element {
  const stations = partStations(design);
  const b = barrowman(design);
  const dm = dryMassProps(design);
  const margin = staticMarginCal(design, dm.cgFromNoseM);
  const length = Math.max(
    ...design.parts.map((p, i) => stations[i] + (p.kind === 'fins' ? p.rootChordM : p.kind === 'mass' ? 0 : p.lengthM)),
    1e-3,
  );
  // Affine station-to-pixel scaler (includes the left PAD offset)...
  const sx = (x: number) => PAD + (x / length) * (VW - 2 * PAD);
  // ...and a plain length-to-pixel scaler (no offset) for span/sweep/chord
  // deltas, so the fin-polygon math below reads as "these are lengths, not
  // stations" instead of relying on sx's affine-ness (sx(a) + sw(b) === sx(a + b)).
  const sw = (len: number) => (len / length) * (VW - 2 * PAD);
  const midY = VH / 2;
  const R = b.refRadiusM;
  const ry = (r: number) => (r / (2 * R || 1)) * 30;

  const stable = margin >= 1;
  return (
    <div className="ds-schematic">
      <svg viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label={`Side view; static margin ${margin.toFixed(2)} calibers`}>
        <rect x={0} y={0} width={VW} height={VH} fill="var(--fd-surface-2)" rx={8} />
        {design.parts.map((p, i) => {
          const x0 = sx(stations[i]);
          if (p.kind === 'tube') {
            return (
              <rect
                key={i}
                x={x0}
                y={midY - ry(p.outerRadiusM)}
                width={sw(p.lengthM)}
                height={2 * ry(p.outerRadiusM)}
                fill="var(--fd-elevated)"
                stroke="var(--fd-border)"
              />
            );
          }
          if (p.kind === 'nose') {
            const xTip = x0 + sw(p.lengthM);
            return (
              <polygon
                key={i}
                points={`${x0},${midY} ${xTip},${midY - ry(p.baseRadiusM)} ${xTip},${midY + ry(p.baseRadiusM)}`}
                fill="var(--fd-elevated)"
                stroke="var(--fd-border)"
              />
            );
          }
          if (p.kind === 'fins') {
            // Trapezoid from the root leading edge (x0, body surface) aft to
            // the root trailing edge, with the tip edge offset outward by
            // the span and aft by the sweep — all four corners built from
            // `sw()` length deltas off x0, never abusing sx() as a scaler.
            const rootLeX = x0;
            const rootTeX = x0 + sw(p.rootChordM);
            const tipLeX = x0 + sw(p.sweepM);
            const tipTeX = tipLeX + sw(p.tipChordM);
            const rootY = midY - ry(R);
            const tipY = rootY - ry(p.semiSpanM);
            return (
              <polygon
                key={i}
                points={`${rootLeX},${rootY} ${tipLeX},${tipY} ${tipTeX},${tipY} ${rootTeX},${rootY}`}
                fill="var(--fd-elevated)"
                stroke="var(--fd-border)"
              />
            );
          }
          return null;
        })}
        <line x1={sx(dm.cgFromNoseM)} y1={midY - 40} x2={sx(dm.cgFromNoseM)} y2={midY + 40} stroke="var(--fd-series-1)" strokeWidth={2} />
        <text x={sx(dm.cgFromNoseM)} y={midY + 54} fill="var(--fd-series-1)" fontSize={11} textAnchor="middle">CG</text>
        <line x1={sx(b.cpFromNoseM)} y1={midY - 40} x2={sx(b.cpFromNoseM)} y2={midY + 40} stroke="var(--fd-accent)" strokeWidth={2} />
        <text x={sx(b.cpFromNoseM)} y={midY - 46} fill="var(--fd-accent)" fontSize={11} textAnchor="middle">CP</text>
      </svg>
      <p className="ds-margin" style={{ color: stable ? 'var(--fd-good)' : 'var(--fd-warning)' }}>
        Static margin: {margin.toFixed(2)} cal {stable ? '· stable' : '· marginal'}
      </p>
    </div>
  );
}

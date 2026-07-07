/**
 * Suite Overview — the app's front door (see plan: flight-envelope front door).
 *
 * Introduces the whole suite and launches into a module. Its identity is the
 * flight envelope: the four modules each own a different altitude-vs-velocity
 * regime, plotted in the hero EnvelopeMap. Hovering a module card lights its
 * envelope waypoint (and vice versa) through the shared `hovered` state, so the
 * card list and the plot read as one instrument. Styling is scoped to `.ov-*`
 * (styles.css); the shared header/tab-bar and A/B/C/D chrome are untouched.
 */

import { useState, type CSSProperties, type JSX } from 'react';
import { MODULES, type LaunchId } from './modules';
import { EnvelopeMap } from './EnvelopeMap';

const CRED: ReadonlyArray<string> = [
  '6-DOF + TVC',
  'RK4 / RK45',
  'US STANDARD ATMOSPHERE 1976',
  'SI · BIT-REPRODUCIBLE',
  '331 VALIDATION TESTS ✓',
];

export const OverviewView = ({ onEnter }: { onEnter(id: LaunchId): void }): JSX.Element => {
  const [hovered, setHovered] = useState<LaunchId | null>(null);

  return (
    <div className="ov">
      <section className="ov-hero">
        <div className="ov-hero-copy">
          <p className="ov-eyebrow">Ascent · Reentry · Cruise · Descent</p>
          <h1 className="ov-headline">
            Four regimes of the flight envelope.
            <span>One shared physics core.</span>
          </h1>
          <p className="ov-deck">
            Powered ascent, atmospheric reentry, cruise dynamics, and a suicide-burn landing — each
            validated against textbook limiting cases before a single pixel was drawn.
          </p>
        </div>

        <figure className="ov-plot">
          <figcaption className="ov-plot-cap">Operating envelope — click a regime to enter</figcaption>
          <EnvelopeMap hovered={hovered} onHover={setHovered} onEnter={onEnter} />
        </figure>
      </section>

      <ul className="ov-cred" aria-label="What the physics core guarantees">
        {CRED.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <section className="ov-cards" aria-label="Modules">
        {MODULES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`ov-card${hovered === m.id ? ' is-lit' : ''}`}
            style={{ '--accent': m.accent } as CSSProperties}
            aria-label={`Enter Module ${m.code} — ${m.name}`}
            onClick={() => onEnter(m.id)}
            onPointerEnter={() => setHovered(m.id)}
            onPointerLeave={() => setHovered(null)}
            onFocus={() => setHovered(m.id)}
            onBlur={() => setHovered(null)}
          >
            <span className="ov-card-head">
              <span className="ov-card-code">{m.code}</span>
              <span className="ov-card-name">{m.name}</span>
            </span>
            <span className="ov-card-tag">{m.tagline}</span>
            <span className="ov-card-chips">
              {m.chips.map((c) => (
                <span key={c} className="ov-chip">
                  {c}
                </span>
              ))}
            </span>
            <span className="ov-card-go" aria-hidden="true">
              Enter →
            </span>
          </button>
        ))}
      </section>

      <footer className="ov-foot">
        <p>
          Built in TypeScript — the same deterministic physics runs in the browser and in the Node
          test suite.
        </p>
        <p className="ov-foot-meta">
          <a href="https://github.com/roasteduck04/rocket-sim" target="_blank" rel="noreferrer">
            github.com/roasteduck04/rocket-sim
          </a>
          <span className="ov-foot-cmd">npm run dev:web</span>
        </p>
      </footer>
    </div>
  );
};

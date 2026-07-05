/**
 * App shell + module tab router (plan Phase 6). One module is mounted at a
 * time; unmounting stops that module's rAF loop and its workers, so the three
 * views never compete for the main thread.
 */

import { useState, type JSX } from 'react';
import { RocketView } from './modules/rocket/RocketView';
import { ReentryView } from './modules/reentry/ReentryView';
import { AircraftView } from './modules/aircraft/AircraftView';
import { LandingSimView } from './features/landing-sim/LandingSimView';

type ModuleId = 'rocket' | 'reentry' | 'aircraft' | 'landing';

const TABS: ReadonlyArray<{ id: ModuleId; label: string }> = [
  { id: 'rocket', label: 'A · Rocket' },
  { id: 'reentry', label: 'B · Reentry' },
  { id: 'aircraft', label: 'C · Aircraft' },
  { id: 'landing', label: 'D · Landing' },
];

export default function App(): JSX.Element {
  const [active, setActive] = useState<ModuleId>('rocket');

  return (
    <div>
      <header className="app-header">
        <h1>Flight Dynamics &amp; Controls Simulation Suite</h1>
        <span className="subtitle">6-DOF rocket · reentry corridor · linearized aircraft</span>
        <nav className="tab-bar" aria-label="Modules">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-pressed={active === tab.id}
              onClick={() => setActive(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="module">
        {active === 'rocket' && <RocketView />}
        {active === 'reentry' && <ReentryView />}
        {active === 'aircraft' && <AircraftView />}
        {active === 'landing' && <LandingSimView />}
      </main>
    </div>
  );
}

/**
 * App shell + view router (plan Phase 6; Phase 8 sidebar shell). One view is
 * mounted at a time; unmounting stops that view's rAF loop and its workers, so
 * the real-time views never compete for the main thread. The chrome (grouped
 * left sidebar + header) lives in `shell/AppShell`; this component owns only the
 * active-view state and the one-view-mounted switch.
 */

import { useState, type JSX } from 'react';
import { AppShell } from './shell/AppShell';
import type { ViewId } from './shell/nav';
import { OverviewView } from './features/overview/OverviewView';
import { RocketView } from './modules/rocket/RocketView';
import { ReentryView } from './modules/reentry/ReentryView';
import { AircraftView } from './modules/aircraft/AircraftView';
import { LandingSimView } from './features/landing-sim/LandingSimView';
import { DesignStudioView } from './features/design-studio/DesignStudioView';

export default function App(): JSX.Element {
  const [active, setActive] = useState<ViewId>('overview');

  return (
    <AppShell active={active} onNavigate={setActive}>
      {active === 'overview' && <OverviewView onEnter={setActive} />}
      {active === 'rocket' && <RocketView />}
      {active === 'reentry' && <ReentryView />}
      {active === 'aircraft' && <AircraftView />}
      {active === 'landing' && <LandingSimView />}
      {active === 'design-studio' && <DesignStudioView />}
    </AppShell>
  );
}

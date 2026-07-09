import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Precision Instrument typography (Phase 8; bundled, offline — no CDN). Inter
// (variable) for prose/UI; JetBrains Mono (variable) for numerics/telemetry.
// unicode-range subsetting means only glyphs in use are fetched.
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import App from './App';
// Design tokens first (values), then the base layer (reset/body/focus) so it
// can reference them, then legacy module styles until each view is converged.
import './ui/tokens.css';
import './ui/base.css';
import './ui/ui.css';
import './shell/shell.css';
import './styles.css';

const el = document.getElementById('root');
if (!el) throw new Error('index.html is missing the #root element');
createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

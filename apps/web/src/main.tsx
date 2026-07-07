import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// D · Landing console typography (bundled, offline — no CDN). Saira Condensed
// for instrument labels; Space Mono for the countdown clock and all telemetry
// numerics. Latin subsets only, to keep the bundle lean.
import '@fontsource/saira-condensed/latin-400.css';
import '@fontsource/saira-condensed/latin-500.css';
import '@fontsource/saira-condensed/latin-600.css';
import '@fontsource/saira-condensed/latin-700.css';
import '@fontsource/space-mono/latin-400.css';
import '@fontsource/space-mono/latin-700.css';
import App from './App';
import './styles.css';

const el = document.getElementById('root');
if (!el) throw new Error('index.html is missing the #root element');
createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

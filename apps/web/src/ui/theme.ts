/**
 * Theme control — the light/dark switch for the Precision Instrument tokens.
 *
 * The active theme is a `data-theme` attribute on <html>; the token layer
 * (`ui/tokens.css`) re-points its semantic aliases per theme. An inline script
 * in `index.html` sets the attribute before first paint (defaulting to light),
 * so this module only reads the current value and persists a user toggle.
 */

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'fd-theme';

/** The active theme, read from <html>. Anything but 'dark' resolves to light. */
export function getTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

/** Apply and persist a theme. Storage failures (private mode) are non-fatal. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* storage disabled — the in-memory attribute still holds for this session */
  }
}

import { useEffect, useState } from 'react';
import { THEME_PRESETS } from '../../content/theme';

// Each viewer's portal look: light/dark/system, accent colour, sidebar colour and a collapsed sidebar.
// Kept in this browser only (localStorage); nothing is sent to the server.
const KEY = 'adram-portal-prefs';
export const DEFAULT_PREFS = { mode: 'light', accent: 'blue', sidebar: 'light', collapsed: false };

// Accent: 'blue' follows the website's colour scheme (set by the admin); any other value is the id of one of the
// site colour schemes (content/theme.js), applied to the portal only for this viewer (see `portalScheme`).
export const WEBSITE_ACCENT = { id: 'blue', label: 'Website colours' };
// Accent ids saved before the schemes existed
const OLD_ACCENTS = { orange: 'sunset' };

/** The scheme to paint the portal in, or null to follow the website colours. */
export const portalScheme = (accent) => THEME_PRESETS.find((p) => p.id === accent) || null;

// Sidebar backgrounds. `dark` marks the ones that need the light logo and light text.
export const SIDEBARS = [
  { id: 'light', label: 'Light', swatch: '#ffffff', dark: false },
  { id: 'tinted', label: 'Tinted', swatch: 'tint', dark: false },
  { id: 'brand', label: 'Accent', swatch: 'accent', dark: true },
  { id: 'navy', label: 'Navy', swatch: '#0b1f5c', dark: true },
  { id: 'midnight', label: 'Midnight', swatch: '#0f172a', dark: true },
  { id: 'charcoal', label: 'Charcoal', swatch: '#1f2329', dark: true },
];

const read = () => {
  try {
    const saved = { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
    const accent = OLD_ACCENTS[saved.accent] || saved.accent;
    return { ...saved, accent: accent === 'blue' || portalScheme(accent) ? accent : 'blue' };
  } catch {
    return DEFAULT_PREFS;
  }
};

const systemDark = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;

/** Returns [prefs, update(patch), resolvedMode]. */
export const usePortalPrefs = () => {
  const [prefs, setPrefs] = useState(read);
  const [prefersDark, setPrefersDark] = useState(systemDark);

  // Follow the operating system's setting live when "System" is chosen.
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!query) return undefined;
    const onChange = (e) => setPrefersDark(e.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const update = (patch) =>
    setPrefs((current) => {
      const next = { ...current, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // private browsing: the choice still applies until the page is closed
      }
      return next;
    });

  const mode = prefs.mode === 'system' ? (prefersDark ? 'dark' : 'light') : prefs.mode;
  return [prefs, update, mode];
};

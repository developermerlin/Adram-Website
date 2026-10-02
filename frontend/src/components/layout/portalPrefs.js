import { useEffect, useState } from 'react';

// Each viewer's portal look: light/dark/system, accent colour, sidebar colour and a collapsed sidebar.
// Kept in this browser only (localStorage); nothing is sent to the server.
const KEY = 'adram-portal-prefs';
export const DEFAULT_PREFS = { mode: 'light', accent: 'blue', sidebar: 'light', collapsed: false };

// Each accent's shades live in dashboard-skin.css / portal.css under .portal[data-accent='<id>'].
export const ACCENTS = [
  { id: 'blue', label: 'Website colours', color: 'var(--t-600, #1454e8)' }, // follows the site colour scheme
  { id: 'indigo', label: 'Indigo', color: '#4f46e5' },
  { id: 'violet', label: 'Violet', color: '#6d4aff' },
  { id: 'fuchsia', label: 'Fuchsia', color: '#c026d3' },
  { id: 'rose', label: 'Rose', color: '#e11d48' },
  { id: 'orange', label: 'Orange', color: '#ea580c' },
  { id: 'emerald', label: 'Emerald', color: '#0f9d58' },
  { id: 'teal', label: 'Teal', color: '#0d9488' },
  { id: 'sky', label: 'Sky', color: '#0284c7' },
  { id: 'graphite', label: 'Graphite', color: '#334155' },
];

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
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
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

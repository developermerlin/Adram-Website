// The website's colour scheme, chosen by the admin in Website → Site content → Contact details & footer → Colours.
// Three colours drive everything: `primary` (buttons, links), `accent` (the bright end of gradients, highlights)
// and `dark` (the navy of the header banners and footer). styles/theme.css works out every other shade from them.
// ADRAM blue is the original design and sets nothing, so the site looks exactly as it was built.

export const THEME_PRESETS = [
  { id: 'adram', label: 'ADRAM blue', primary: '#1454e8', accent: '#16c8f5', dark: '#06123d' },
  { id: 'ocean', label: 'Ocean', primary: '#0369a1', accent: '#22d3ee', dark: '#082f49' },
  { id: 'teal', label: 'Teal', primary: '#0d9488', accent: '#5eead4', dark: '#042f2e' },
  { id: 'emerald', label: 'Emerald', primary: '#059669', accent: '#a3e635', dark: '#052e1c' },
  { id: 'indigo', label: 'Indigo', primary: '#4f46e5', accent: '#38bdf8', dark: '#1e1b4b' },
  { id: 'purple', label: 'Purple', primary: '#7c3aed', accent: '#e879f9', dark: '#1e0b3d' },
  { id: 'crimson', label: 'Crimson', primary: '#dc2626', accent: '#fb923c', dark: '#2a0a0f' },
  { id: 'sunset', label: 'Sunset', primary: '#ea580c', accent: '#facc15', dark: '#2b1206' },
  { id: 'graphite', label: 'Graphite', primary: '#334155', accent: '#38bdf8', dark: '#0f172a' },
];

export const DEFAULT_THEME = THEME_PRESETS[0];
const HEX = /^#[0-9a-f]{6}$/i;
export const isHex = (value) => typeof value === 'string' && HEX.test(value);
const STORE = 'adram-site-theme';

/** The three colours to use, or null for the original ADRAM look. */
export const resolveTheme = (theme) => {
  if (!theme || typeof theme !== 'object') return null;
  const preset = THEME_PRESETS.find((p) => p.id === theme.preset);
  const colours = preset && preset.id !== 'custom' ? preset : {
    primary: isHex(theme.primary) ? theme.primary : DEFAULT_THEME.primary,
    accent: isHex(theme.accent) ? theme.accent : DEFAULT_THEME.accent,
    dark: isHex(theme.dark) ? theme.dark : DEFAULT_THEME.dark,
  };
  const { primary, accent, dark } = colours;
  const same = [primary, accent, dark].join() === [DEFAULT_THEME.primary, DEFAULT_THEME.accent, DEFAULT_THEME.dark].join();
  return same ? null : { primary: primary.toLowerCase(), accent: accent.toLowerCase(), dark: dark.toLowerCase() };
};

/** Puts the colours on <html> (theme.css derives the shades) and remembers them so the next visit paints in them at once. */
export const applyTheme = (colours) => {
  const root = document.documentElement;
  if (colours) {
    root.setAttribute('data-site-theme', '');
    root.style.setProperty('--t-primary', colours.primary);
    root.style.setProperty('--t-accent', colours.accent);
    root.style.setProperty('--t-dark', colours.dark);
  } else {
    root.removeAttribute('data-site-theme');
    ['--t-primary', '--t-accent', '--t-dark'].forEach((name) => root.style.removeProperty(name));
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colours ? colours.dark : DEFAULT_THEME.dark);
  try {
    if (colours) localStorage.setItem(STORE, JSON.stringify(colours));
    else localStorage.removeItem(STORE);
  } catch {
    /* private window: the colours still apply, just after the content loads */
  }
};

/** Called before the first render with the colours from the last visit, to avoid a flash of blue. */
export const applyStoredTheme = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (saved && isHex(saved.primary) && isHex(saved.accent) && isHex(saved.dark)) applyTheme(saved);
  } catch {
    /* nothing saved */
  }
};

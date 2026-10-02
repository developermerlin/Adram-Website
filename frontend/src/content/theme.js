// The website's colour scheme, chosen by the admin in Website → Site content → Contact details & footer → Colours.
// Three colours drive everything: `primary` (buttons, links), `accent` (the bright end of gradients, highlights)
// and `dark` (the navy of the header banners and footer). styles/theme.css works out every other shade from them.
// ADRAM blue is the original design and sets nothing, so the site looks exactly as it was built.

export const THEME_GROUPS = [
  ['blue', 'Blues'],
  ['green', 'Greens & teals'],
  ['purple', 'Purples & pinks'],
  ['warm', 'Reds, oranges & golds'],
  ['neutral', 'Greys & dark'],
];

export const THEME_PRESETS = [
  { id: 'adram', group: 'blue', label: 'ADRAM blue', primary: '#1454e8', accent: '#16c8f5', dark: '#06123d' },
  { id: 'ocean', group: 'blue', label: 'Ocean', primary: '#0369a1', accent: '#22d3ee', dark: '#082f49' },
  { id: 'sky', group: 'blue', label: 'Sky', primary: '#0284c7', accent: '#7dd3fc', dark: '#0c1f33' },
  { id: 'royal', group: 'blue', label: 'Royal gold', primary: '#1d4ed8', accent: '#f59e0b', dark: '#0b1437' },
  { id: 'midnight', group: 'blue', label: 'Midnight', primary: '#1e40af', accent: '#a78bfa', dark: '#020617' },
  { id: 'steel', group: 'blue', label: 'Steel blue', primary: '#3f5a7a', accent: '#7dd3fc', dark: '#111827' },
  { id: 'teal', group: 'green', label: 'Teal', primary: '#0d9488', accent: '#5eead4', dark: '#042f2e' },
  { id: 'emerald', group: 'green', label: 'Emerald', primary: '#059669', accent: '#a3e635', dark: '#052e1c' },
  { id: 'forest', group: 'green', label: 'Forest', primary: '#166534', accent: '#facc15', dark: '#052e16' },
  { id: 'mint', group: 'green', label: 'Mint', primary: '#0f766e', accent: '#86efac', dark: '#022c22' },
  { id: 'lime', group: 'green', label: 'Lime', primary: '#4d7c0f', accent: '#bef264', dark: '#1a2e05' },
  { id: 'turquoise', group: 'green', label: 'Turquoise', primary: '#0891b2', accent: '#2dd4bf', dark: '#083344' },
  { id: 'olive', group: 'green', label: 'Olive', primary: '#556b2f', accent: '#d9f99d', dark: '#1a1f0d' },
  { id: 'indigo', group: 'purple', label: 'Indigo', primary: '#4f46e5', accent: '#38bdf8', dark: '#1e1b4b' },
  { id: 'purple', group: 'purple', label: 'Purple', primary: '#7c3aed', accent: '#e879f9', dark: '#1e0b3d' },
  { id: 'violet', group: 'purple', label: 'Violet & pink', primary: '#6d28d9', accent: '#f472b6', dark: '#2e1065' },
  { id: 'fuchsia', group: 'purple', label: 'Fuchsia', primary: '#c026d3', accent: '#f9a8d4', dark: '#3b0a3f' },
  { id: 'rose', group: 'purple', label: 'Rose', primary: '#e11d48', accent: '#fda4af', dark: '#2a0710' },
  { id: 'berry', group: 'purple', label: 'Berry', primary: '#9d174d', accent: '#f59e0b', dark: '#2a0716' },
  { id: 'crimson', group: 'warm', label: 'Crimson', primary: '#dc2626', accent: '#fb923c', dark: '#2a0a0f' },
  { id: 'sunset', group: 'warm', label: 'Sunset', primary: '#ea580c', accent: '#facc15', dark: '#2b1206' },
  { id: 'coral', group: 'warm', label: 'Coral', primary: '#e04f39', accent: '#ffb199', dark: '#2b0f0a' },
  { id: 'terracotta', group: 'warm', label: 'Terracotta', primary: '#c2410c', accent: '#fdba74', dark: '#2c1208' },
  { id: 'amber', group: 'warm', label: 'Amber', primary: '#b45309', accent: '#fbbf24', dark: '#2a1503' },
  { id: 'gold', group: 'warm', label: 'Gold', primary: '#a16207', accent: '#fde047', dark: '#1f1503' },
  { id: 'chocolate', group: 'warm', label: 'Chocolate', primary: '#7c2d12', accent: '#f59e0b', dark: '#1c0a04' },
  { id: 'graphite', group: 'neutral', label: 'Graphite', primary: '#334155', accent: '#38bdf8', dark: '#0f172a' },
  { id: 'slate', group: 'neutral', label: 'Slate & lime', primary: '#475569', accent: '#a3e635', dark: '#0f172a' },
  { id: 'charcoal', group: 'neutral', label: 'Charcoal red', primary: '#27272a', accent: '#ef4444', dark: '#09090b' },
  { id: 'mono', group: 'neutral', label: 'Monochrome', primary: '#27272a', accent: '#a1a1aa', dark: '#09090b' },
  { id: 'night-gold', group: 'neutral', label: 'Black & gold', primary: '#1c1917', accent: '#eab308', dark: '#0c0a09' },
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

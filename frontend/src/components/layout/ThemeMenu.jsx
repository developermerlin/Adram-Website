import { useEffect, useRef, useState } from 'react';
import { ACCENTS, DEFAULT_PREFS, SIDEBARS } from './portalPrefs';

const MODES = [
  { id: 'light', label: 'Light', icon: 'fa-sun' },
  { id: 'dark', label: 'Dark', icon: 'fa-moon' },
  { id: 'system', label: 'System', icon: 'fa-desktop' },
];

/** Palette button in the portal top bar: light/dark/system, an accent colour and the sidebar colour. */
export const ThemeMenu = ({ prefs, onChange }) => {
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => !box.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="theme-menu" ref={box}>
      <button type="button" className="theme-menu__button" aria-label="Theme settings" aria-expanded={open} aria-haspopup="dialog" title="Theme" onClick={() => setOpen((v) => !v)}>
        <i className="fas fa-palette" />
      </button>
      {open && (
        <div className="theme-menu__panel" role="dialog" aria-label="Theme settings">
          <h3>Appearance</h3>
          <div>
            <p className="theme-menu__label">Mode</p>
            <div className="theme-menu__modes" role="radiogroup" aria-label="Colour mode">
              {MODES.map((m) => (
                <button key={m.id} type="button" role="radio" aria-checked={prefs.mode === m.id} className={prefs.mode === m.id ? 'is-active' : ''} onClick={() => onChange({ mode: m.id })}>
                  <i className={`fas ${m.icon}`} aria-hidden="true" /> {m.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="theme-menu__label">Accent colour</p>
            <div className="theme-menu__accents" role="radiogroup" aria-label="Accent colour">
              {ACCENTS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  role="radio"
                  aria-checked={prefs.accent === a.id}
                  aria-label={a.label}
                  title={a.label}
                  className={`theme-menu__swatch${prefs.accent === a.id ? ' is-active' : ''}`}
                  style={{ background: a.color }}
                  onClick={() => onChange({ accent: a.id })}
                >
                  {prefs.accent === a.id && <i className="fas fa-check" aria-hidden="true" />}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="theme-menu__label">Sidebar</p>
            <div className="theme-menu__sidebars" role="radiogroup" aria-label="Sidebar colour">
              {SIDEBARS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={prefs.sidebar === s.id}
                  className={`theme-menu__sidebar${prefs.sidebar === s.id ? ' is-active' : ''}`}
                  onClick={() => onChange({ sidebar: s.id })}
                >
                  <span className={`theme-menu__sidebar-preview theme-menu__sidebar-preview--${s.id}`} aria-hidden="true">
                    <i /><i /><i />
                  </span>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <button type="button" className="btn btn--text btn--sm theme-menu__reset" onClick={() => onChange({ mode: DEFAULT_PREFS.mode, accent: DEFAULT_PREFS.accent, sidebar: DEFAULT_PREFS.sidebar })}>
            <i className="fas fa-rotate-left" /> Reset to default
          </button>
        </div>
      )}
    </div>
  );
};

export default ThemeMenu;

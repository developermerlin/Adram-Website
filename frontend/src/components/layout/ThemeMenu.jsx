import { useEffect, useRef, useState } from 'react';
import { DEFAULT_THEME, THEME_GROUPS, THEME_PRESETS, resolveTheme } from '../../content/theme';
import { usePageContent } from '../../content/useContent';
import { DEFAULT_PREFS, SIDEBARS, WEBSITE_ACCENT, portalScheme } from './portalPrefs';

const MODES = [
  { id: 'light', label: 'Light', icon: 'fa-sun' },
  { id: 'dark', label: 'Dark', icon: 'fa-moon' },
  { id: 'system', label: 'System', icon: 'fa-desktop' },
];

/** Palette button in the portal top bar: light/dark/system, an accent colour and the sidebar colour. */
export const ThemeMenu = ({ prefs, onChange }) => {
  const [open, setOpen] = useState(false);
  const chosen = portalScheme(prefs.accent);
  const website = resolveTheme(usePageContent('site').theme) || DEFAULT_THEME; // the admin's colours, whatever this viewer picked
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
            <p className="theme-menu__label">Colours <span className="theme-menu__current">{chosen ? chosen.label : WEBSITE_ACCENT.label}</span></p>
            <button type="button" role="radio" aria-checked={!chosen}
              className={`theme-menu__website${chosen ? '' : ' is-active'}`} onClick={() => onChange({ accent: WEBSITE_ACCENT.id })}>
              <span className="theme-menu__swatch" style={{ background: `radial-gradient(circle, transparent 0 57%, ${website.dark} 60%), linear-gradient(135deg, ${website.primary} 0 55%, ${website.accent} 55% 100%)` }} aria-hidden="true">{!chosen && <i className="fas fa-check" />}</span>
              <span>Website colours<small>The colours your organisation chose</small></span>
            </button>
            <div className="theme-menu__schemes">
              {THEME_GROUPS.map(([group, label]) => (
                <div key={group} className="theme-menu__group" role="radiogroup" aria-label={label}>
                  <p>{label}</p>
                  <div className="theme-menu__accents">
                    {THEME_PRESETS.filter((t) => t.group === group).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        role="radio"
                        aria-checked={prefs.accent === t.id}
                        aria-label={t.label}
                        title={t.label}
                        className={`theme-menu__swatch theme-menu__swatch--scheme${prefs.accent === t.id ? ' is-active' : ''}`}
                        style={{ background: `radial-gradient(circle, transparent 0 57%, ${t.dark} 60%), linear-gradient(135deg, ${t.primary} 0 55%, ${t.accent} 55% 100%)` }}
                        onClick={() => onChange({ accent: t.id })}
                      >
                        {prefs.accent === t.id && <i className="fas fa-check" aria-hidden="true" />}
                      </button>
                    ))}
                  </div>
                </div>
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

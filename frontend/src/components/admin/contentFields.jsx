import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { contentAPI, parseApiErrors } from '../../services/api';
import { getPath, setPath } from '../../content/merge';
import { SITE_LIBRARY, TECH_LOGOS } from '../../content/schema';
import { DEFAULT_THEME, THEME_GROUPS, THEME_PRESETS, isHex } from '../../content/theme';
import { assetUrl } from '../../utils/assets';
import BrandIcon, { ICON_NAMES } from '../brand/BrandIcon';
import { ListEditor } from './catalog';

// The controls the content editor is built from (see content/schema.js for how pages describe their fields).

const Hint = ({ id, error, hint }) =>
  error ? <p className="field-error">{error}</p> : hint ? <p className="hint" id={id}>{hint}</p> : null;

// ---------------------------------------------------------------- Images

export const ImageLibrary = ({ current, onPick, onClose }) => {
  const [tab, setTab] = useState('uploads');
  const [uploads, setUploads] = useState(null);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const input = useRef(null);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    contentAPI.media().then(({ data }) => setUploads(data)).catch(() => setUploads([]));
  }, []);

  const upload = async (file) => {
    if (!file) return;
    setError('');
    setProgress(0);
    try {
      const { data } = await contentAPI.upload(file, setProgress);
      toast.success('Image uploaded');
      onPick(data.url);
    } catch (err) {
      const errors = parseApiErrors(err);
      setError(errors.image || errors.form || errors.detail || 'The image could not be uploaded.');
    } finally {
      setProgress(null);
      if (input.current) input.current.value = '';
    }
  };

  const remove = async (image) => {
    if (!window.confirm(`Delete “${image.name || 'this image'}” from the library? Pages still using it will lose the picture.`)) return;
    try {
      await contentAPI.removeMedia(image.id);
      setUploads((list) => list.filter((x) => x.id !== image.id));
    } catch {
      toast.error('Could not delete the image.');
    }
  };

  const groups = SITE_LIBRARY.reduce((acc, img) => ({ ...acc, [img.group]: [...(acc[img.group] || []), img] }), {});

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="library-title">
      <button type="button" className="modal__backdrop" aria-label="Close" onClick={onClose} />
      <div className="modal__card modal__card--wide cf-library">
        <div className="cf-library__head">
          <h2 id="library-title">Choose an image</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><i className="fas fa-xmark" /></button>
        </div>
        <div className="segmented" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'uploads'} className={tab === 'uploads' ? 'is-active' : ''} onClick={() => setTab('uploads')}>Upload &amp; my images</button>
          <button type="button" role="tab" aria-selected={tab === 'site'} className={tab === 'site' ? 'is-active' : ''} onClick={() => setTab('site')}>Website photos</button>
        </div>

        {tab === 'uploads' ? (
          <>
            <label className={`cf-drop${progress !== null ? ' is-busy' : ''}`}>
              <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => upload(e.target.files?.[0])} disabled={progress !== null} />
              <i className="fas fa-cloud-arrow-up" aria-hidden="true" />
              <span>{progress !== null ? `Uploading… ${progress}%` : 'Click to upload a new image'}</span>
              <small>JPG, PNG, WebP or GIF, up to 6 MB. Wide photos (at least 1200 px) look best.</small>
            </label>
            {error && <p className="field-error" role="alert">{error}</p>}
            {uploads === null ? (
              <p className="muted small">Loading your images…</p>
            ) : uploads.length === 0 ? (
              <p className="muted small">You haven’t uploaded any images yet.</p>
            ) : (
              <ul className="cf-library__grid">
                {uploads.map((img) => (
                  <li key={img.id}>
                    <button type="button" className={`cf-thumb${current === img.url ? ' is-active' : ''}`} onClick={() => onPick(img.url)} title={img.name}>
                      <img src={assetUrl(img.url)} alt="" loading="lazy" />
                      <span>{img.name || 'Image'}</span>
                    </button>
                    <button type="button" className="cf-thumb__delete" aria-label={`Delete ${img.name || 'image'}`} onClick={() => remove(img)}>
                      <i className="fas fa-trash-can" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          Object.entries(groups).map(([group, images]) => (
            <section key={group} className="cf-library__group">
              <h3>{group}</h3>
              <ul className="cf-library__grid">
                {images.map((img) => (
                  <li key={img.src}>
                    <button type="button" className={`cf-thumb${current === img.src ? ' is-active' : ''}`} onClick={() => onPick(img.src)} title={img.name}>
                      <img src={img.src} alt="" loading="lazy" />
                      <span>{img.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- Colour scheme

const COLOUR_ROLES = [
  ['primary', 'Main colour', 'Buttons, links and highlights.'],
  ['accent', 'Second colour', 'The bright end of gradients, badges and small accents.'],
  ['dark', 'Dark colour', 'The banners at the top of pages and the footer.'],
];

// Relative luminance (WCAG), to warn when white text on the main colour would be hard to read
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

const ColourInput = ({ id, label, hint, value, onChange }) => {
  const [draft, setDraft] = useState(null); // what is being typed, until it is a full #rrggbb
  return (
    <div className="field cf-colour">
      <label htmlFor={id}>{label}</label>
      <div className="cf-colour__row">
        <input type="color" aria-label={`${label}: pick`} value={value} onChange={(e) => onChange(e.target.value)} />
        <input id={id} className="input" value={draft ?? value} maxLength={7} spellCheck={false}
          onChange={(e) => {
            const text = e.target.value.trim();
            const hex = text.startsWith('#') ? text : `#${text}`;
            if (isHex(hex)) {
              setDraft(null);
              onChange(hex.toLowerCase());
            } else setDraft(text);
          }}
          onBlur={() => setDraft(null)} />
      </div>
      <p className="hint">{hint}</p>
    </div>
  );
};

// The three colours as CSS variables, for the thumbnails and the preview
const mockVars = (c) => ({ '--m-p': c.primary, '--m-a': c.accent, '--m-d': c.dark });

/** A tiny picture of a web page in a scheme's colours. */
const ThemeThumb = ({ colours }) => (
  <span className="cf-thumb" style={mockVars(colours)} aria-hidden="true">
    <span className="cf-thumb__top" />
    <span className="cf-thumb__body">
      <span className="cf-thumb__title" />
      <span className="cf-thumb__line" />
      <span className="cf-thumb__row"><span className="cf-thumb__btn" /><span className="cf-thumb__dot" /></span>
    </span>
    <span className="cf-thumb__foot" />
  </span>
);

/** A small version of the website (top bar, menu, banner, cards, footer) in the chosen colours. */
const ThemePreview = ({ colours, name }) => (
  <div className="cf-mock" style={mockVars(colours)} aria-label={`Preview of ${name}`} role="img">
    <div className="cf-mock__top"><span /><span /><span /></div>
    <div className="cf-mock__nav">
      <span className="cf-mock__logo"><i />ADRAM</span>
      <span className="cf-mock__links"><b>Home</b><span>Services</span><span>Training</span></span>
      <span className="cf-mock__cta">Sign up</span>
    </div>
    <div className="cf-mock__hero">
      <span className="cf-mock__eyebrow"><i className="fas fa-location-dot" /> IT company</span>
      <strong>Building solutions for a <em>better future</em></strong>
      <p>We design, build and support the systems organisations run on.</p>
      <div className="cf-mock__buttons"><span className="cf-mock__btn">Start a project</span><span className="cf-mock__btn cf-mock__btn--ghost">Our services</span></div>
    </div>
    <div className="cf-mock__cards">
      {['fa-code', 'fa-network-wired', 'fa-graduation-cap'].map((icon) => (
        <span key={icon} className="cf-mock__card"><i className={`fas ${icon}`} /><span /><span /></span>
      ))}
    </div>
    <div className="cf-mock__foot"><span className="cf-mock__foot-head" /><span /><span /></div>
  </div>
);

/** Ready-made colour schemes (by colour family) plus the admin's own three colours, with a live preview. */
export const ThemeField = ({ field, value, onChange, id }) => {
  const current = { ...DEFAULT_THEME, preset: 'adram', ...(value || {}) };
  const preset = THEME_PRESETS.find((p) => p.id === current.preset);
  const colours = preset || current;
  const [group, setGroup] = useState(preset ? preset.group : 'all');
  const pick = (p) => onChange({ preset: p.id, primary: p.primary, accent: p.accent, dark: p.dark });
  const setColour = (role) => (hex) => onChange({ ...colours, preset: 'custom', [role]: hex });
  const unreadable = contrast(colours.primary, '#ffffff') < 3;
  const shown = group === 'all' ? THEME_PRESETS : THEME_PRESETS.filter((p) => p.group === group);
  const name = preset ? preset.label : 'Your own colours';
  return (
    <div className="cf-theme">
      <div className="cf-theme__head">
        <div>
          <p className="cf-theme__label">{field.label}</p>
          <p className="hint">Now using: <strong>{name}</strong></p>
        </div>
        {current.preset !== 'adram' && (
          <button type="button" className="btn btn--outline btn--sm" onClick={() => pick(DEFAULT_THEME)}>
            <i className="fas fa-rotate-left" aria-hidden="true" /> Back to ADRAM blue
          </button>
        )}
      </div>

      <div className="cf-theme__filters" role="tablist" aria-label="Colour families">
        {[['all', `All (${THEME_PRESETS.length})`], ...THEME_GROUPS].map(([gid, label]) => (
          <button key={gid} type="button" role="tab" aria-selected={group === gid} className={`cf-theme__filter${group === gid ? ' is-active' : ''}`} onClick={() => setGroup(gid)}>
            {gid !== 'all' && <span className="cf-theme__filter-dots" aria-hidden="true">
              {THEME_PRESETS.filter((p) => p.group === gid).slice(0, 3).map((p) => <i key={p.id} style={{ background: p.primary }} />)}
            </span>}
            {label}
          </button>
        ))}
      </div>

      <div className="cf-theme__presets" role="radiogroup" aria-label={field.label}>
        {shown.map((p) => (
          <button key={p.id} type="button" role="radio" aria-checked={current.preset === p.id}
            className={`cf-theme__preset${current.preset === p.id ? ' is-active' : ''}`} onClick={() => pick(p)}>
            <ThemeThumb colours={p} />
            <span className="cf-theme__name">
              {p.label}
              {current.preset === p.id && <i className="fas fa-circle-check" aria-hidden="true" />}
            </span>
            <span className="cf-theme__chips" aria-hidden="true"><i style={{ background: p.primary }} /><i style={{ background: p.accent }} /><i style={{ background: p.dark }} /></span>
          </button>
        ))}
      </div>

      <div className="cf-theme__studio">
        <div className="cf-theme__custom">
          <p className="cf-theme__sub"><i className="fas fa-palette" aria-hidden="true" /> Your own colours</p>
          <p className="hint">Change any colour to make your own scheme, starting from the one above.</p>
          {COLOUR_ROLES.map(([role, label, hint]) => (
            <ColourInput key={role} id={`${id}-${role}`} label={label} hint={hint} value={colours[role]} onChange={setColour(role)} />
          ))}
          {unreadable && <p className="cf-theme__warn"><i className="fas fa-triangle-exclamation" aria-hidden="true" /> White text on this main colour is hard to read. A darker main colour works better for buttons.</p>}
        </div>
        <div className="cf-theme__preview-wrap">
          <p className="cf-theme__sub"><i className="fas fa-eye" aria-hidden="true" /> Preview</p>
          <ThemePreview colours={colours} name={name} />
          <p className="hint">The whole website and portal change once you save.</p>
        </div>
      </div>
    </div>
  );
};

export const ImageField = ({ field, value, onChange, id }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="field cf-image">
      <span className="field__label" id={`${id}-label`}>{field.label}</span>
      <div className="cf-image__row">
        <div className="cf-image__preview">
          {value ? <img src={assetUrl(value)} alt="" /> : <span><i className="far fa-image" aria-hidden="true" /> No image</span>}
        </div>
        <div className="cf-image__actions">
          <button type="button" className="btn btn--outline btn--sm" onClick={() => setOpen(true)} aria-describedby={`${id}-label`}>
            <i className="fas fa-image" /> {value ? 'Change image' : 'Choose image'}
          </button>
          {value && (
            <button type="button" className="btn btn--text btn--sm text-danger" onClick={() => onChange('')}>
              <i className="fas fa-xmark" /> Remove
            </button>
          )}
        </div>
      </div>
      <Hint hint={field.hint} />
      {open && <ImageLibrary current={value} onClose={() => setOpen(false)} onPick={(src) => { onChange(src); setOpen(false); }} />}
    </div>
  );
};

// ---------------------------------------------------------------- Icons

export const IconField = ({ field, value, onChange, id }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="field cf-icon">
      <span className="field__label" id={`${id}-label`}>{field.label}</span>
      <button type="button" className="cf-icon__current" aria-expanded={open} aria-labelledby={`${id}-label`} onClick={() => setOpen((o) => !o)}>
        {value ? <BrandIcon name={value} size={24} /> : <i className="far fa-circle" aria-hidden="true" />}
        <span>{value || 'Choose an icon'}</span>
        <i className={`fas fa-chevron-${open ? 'up' : 'down'}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="icon-picker" role="radiogroup" aria-label={field.label}>
          {ICON_NAMES.map((name) => (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={value === name}
              aria-label={name}
              title={name}
              className={`icon-picker__option${value === name ? ' is-active' : ''}`}
              onClick={() => { onChange(name); setOpen(false); }}
            >
              <BrandIcon name={name} size={26} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------- Simple inputs

const DAYS = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [0, 'Sun']];

const WeekdaysField = ({ field, value, onChange, id }) => {
  const days = (Array.isArray(value) ? value : []).map(Number);
  const toggle = (day) => onChange(days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => a - b));
  return (
    <fieldset className="field cf-days">
      <legend className="field__label">{field.label}</legend>
      <div className="cf-days__row">
        {DAYS.map(([day, name]) => (
          <button key={day} type="button" id={`${id}-${day}`} className={`cf-days__day${days.includes(day) ? ' is-active' : ''}`} aria-pressed={days.includes(day)} onClick={() => toggle(day)}>
            {name}
          </button>
        ))}
      </div>
    </fieldset>
  );
};

// ---------------------------------------------------------------- Lists of cards

const clone = (v) => JSON.parse(JSON.stringify(v));

const ListField = ({ field, value, onChange, id }) => {
  const items = Array.isArray(value) ? value : [];
  const [open, setOpen] = useState({});
  const max = field.max ?? 60;
  const name = field.itemName || 'item';

  const update = (i, item) => onChange(items.map((x, j) => (j === i ? item : x)));
  const add = () => {
    if (items.length >= max) return;
    onChange([...items, clone(field.blank)]);
    setOpen((o) => ({ ...o, [items.length]: true }));
  };
  const remove = (i) => {
    onChange(items.filter((_, j) => j !== i));
    setOpen({});
  };
  const duplicate = (i) => {
    if (items.length >= max) return;
    onChange([...items.slice(0, i + 1), clone(items[i]), ...items.slice(i + 1)]);
    setOpen((o) => ({ ...o, [i + 1]: true }));
  };
  const move = (i, step) => {
    const next = [...items];
    [next[i], next[i + step]] = [next[i + step], next[i]];
    onChange(next);
    setOpen((o) => ({ ...o, [i]: o[i + step], [i + step]: o[i] }));
  };
  const stop = (fn) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    fn();
  };

  return (
    <div className="cf-list">
      <div className="cf-list__head">
        <span className="field__label">{field.label}</span>
        <span className="muted small">{items.length} {items.length === 1 ? name : `${name}s`}</span>
      </div>
      <Hint hint={field.hint} />
      {items.length === 0 && <p className="cf-list__empty muted small">Nothing here yet.</p>}
      {items.map((item, i) => {
        const title = getPath(item, field.titleField);
        return (
          // Index keys are fine: every field is a controlled input
          <details key={i} className="cf-item" open={Boolean(open[i])} onToggle={(e) => { const isOpen = e.currentTarget.open; setOpen((o) => (o[i] === isOpen ? o : { ...o, [i]: isOpen })); }}>
            <summary>
              <span className="cf-item__num" aria-hidden="true">{i + 1}</span>
              <span className="cf-item__title">{title || `New ${name}`}</span>
              <span className="cf-item__tools">
                <button type="button" className="icon-btn" aria-label={`Move ${name} ${i + 1} up`} disabled={i === 0} onClick={stop(() => move(i, -1))}><i className="fas fa-arrow-up" /></button>
                <button type="button" className="icon-btn" aria-label={`Move ${name} ${i + 1} down`} disabled={i === items.length - 1} onClick={stop(() => move(i, 1))}><i className="fas fa-arrow-down" /></button>
                <button type="button" className="icon-btn" aria-label={`Duplicate ${name} ${i + 1}`} disabled={items.length >= max} onClick={stop(() => duplicate(i))}><i className="far fa-copy" /></button>
                <button type="button" className="icon-btn icon-btn--danger" aria-label={`Remove ${name} ${i + 1}`} onClick={stop(() => remove(i))}><i className="fas fa-trash-can" /></button>
              </span>
              <i className="fas fa-chevron-down cf-item__chevron" aria-hidden="true" />
            </summary>
            <div className="cf-item__body">
              {field.fields.map((f) => (
                <ContentField key={f.path} field={f} id={`${id}-${i}-${f.path}`} value={getPath(item, f.path)} onChange={(v) => update(i, setPath(item, f.path, v))} />
              ))}
            </div>
          </details>
        );
      })}
      <button type="button" className="btn btn--outline btn--sm" onClick={add} disabled={items.length >= max}>
        <i className="fas fa-plus" /> Add {name}
      </button>
    </div>
  );
};

// ---------------------------------------------------------------- One field

export const ContentField = ({ field, value, onChange, id, error }) => {
  const hintId = field.hint ? `${id}-hint` : undefined;
  switch (field.type) {
    case 'image':
      return <ImageField field={field} value={value || ''} onChange={onChange} id={id} />;
    case 'icon':
      return <IconField field={field} value={value || ''} onChange={onChange} id={id} />;
    case 'theme':
      return <ThemeField field={field} value={value} onChange={onChange} id={id} />;
    case 'weekdays':
      return <WeekdaysField field={field} value={value} onChange={onChange} id={id} />;
    case 'list':
      return <ListField field={field} value={value} onChange={onChange} id={id} />;
    case 'heading':
      return (
        <div className="cf-subhead">
          <h4>{field.label}</h4>
          {field.hint && <p className="hint">{field.hint}</p>}
        </div>
      );
    case 'toggle':
      return (
        <div className="field">
          <label className="checkbox">
            <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
            <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span>
            <span>
              {field.label}
              {field.hint && <small>{field.hint}</small>}
            </span>
          </label>
        </div>
      );
    case 'logo':
      return (
        <div className="field cf-logo">
          <label htmlFor={id}>{field.label}</label>
          <div className="cf-logo__row">
            {value && <img src={`/tech/${value}.svg`} alt="" width="36" height="36" />}
            <select id={id} className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
              {!TECH_LOGOS.includes(value) && value && <option value={value}>{value}</option>}
              {TECH_LOGOS.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
        </div>
      );
    case 'strings':
      return (
        <ListEditor id={id} label={field.label} hint={field.hint} items={Array.isArray(value) ? value : []} onChange={onChange} placeholder={field.placeholder} max={field.max ?? 12} maxLength={300} />
      );
    case 'textarea':
      return (
        <div className="field">
          <label htmlFor={id}>{field.label}</label>
          <textarea id={id} className="input" rows={field.rows || 3} value={value ?? ''} aria-invalid={Boolean(error)} aria-describedby={hintId} onChange={(e) => onChange(e.target.value)} />
          <Hint id={hintId} error={error} hint={field.hint} />
        </div>
      );
    case 'select':
      return (
        <div className="field">
          <label htmlFor={id}>{field.label}</label>
          <select id={id} className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
            {field.options.map(([v, label]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
          <Hint id={hintId} error={error} hint={field.hint} />
        </div>
      );
    case 'number':
      return (
        <div className="field">
          <label htmlFor={id}>{field.label}</label>
          <input id={id} type="number" className="input" min={field.min} max={field.max} step="0.5" value={value ?? ''} aria-describedby={hintId} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />
          <Hint id={hintId} error={error} hint={field.hint} />
        </div>
      );
    default: // text, link
      return (
        <div className="field">
          <label htmlFor={id}>{field.label}</label>
          <input
            id={id}
            type={field.inputType || 'text'}
            className="input"
            value={value ?? ''}
            placeholder={field.placeholder}
            maxLength={field.type === 'link' ? 500 : 300}
            aria-invalid={Boolean(error)}
            aria-describedby={hintId}
            onChange={(e) => onChange(e.target.value)}
          />
          <Hint id={hintId} error={error} hint={field.hint} />
        </div>
      );
  }
};

export default ContentField;

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { parseApiErrors } from '../../services/api';
import { ImageField } from '../admin/contentFields';
import { SOCIAL_NETWORKS } from './teamShared';
import '../../styles/team.css';

const EDITABLE = ['display_name', 'job_title', 'department', 'location', 'headline', 'photo', 'cover', 'bio', 'years_experience', 'skills',
  'expertise', 'languages', 'experience', 'education', 'certifications', 'projects', 'achievements', 'testimonials', 'socials',
  'public_email', 'public_phone', 'allow_chat', 'generated_cv', 'cv_visibility', 'is_published', 'featured', 'slug'];

const TABS = [
  ['profile', 'Profile', 'fa-id-card'],
  ['about', 'About', 'fa-align-left'],
  ['skills', 'Skills', 'fa-chart-simple'],
  ['experience', 'Experience', 'fa-briefcase'],
  ['education', 'Education', 'fa-graduation-cap'],
  ['projects', 'Projects', 'fa-diagram-project'],
  ['more', 'Awards & quotes', 'fa-trophy'],
  ['contact', 'Contact & links', 'fa-address-book'],
  ['cv', 'CV & chat', 'fa-file-lines'],
];

// Repeatable entries (experience, education, ...): each field is text, a long text, a tick box, a picture or tags.
const LISTS = {
  experience: { add: 'Add a position', title: (e) => e.title || 'New position', sub: (e) => e.organisation, fields: [
    ['title', 'Job title', 'text', 'e.g. Lead Software Engineer'], ['organisation', 'Organisation', 'text'], ['location', 'Location', 'text'],
    ['start', 'From', 'text', 'e.g. 2021'], ['end', 'To', 'text', 'e.g. 2023'], ['current', 'I work here now', 'check'],
    ['description', 'What they did', 'long', 'Responsibilities and results'],
  ] },
  education: { add: 'Add a qualification', title: (e) => e.qualification || 'New qualification', sub: (e) => e.institution, fields: [
    ['qualification', 'Qualification', 'text', 'e.g. BSc Computer Science'], ['institution', 'School or university', 'text'],
    ['start', 'From', 'text'], ['end', 'To', 'text'], ['description', 'Details', 'long'],
  ] },
  certifications: { add: 'Add a certification', title: (e) => e.name || 'New certification', sub: (e) => e.issuer, fields: [
    ['name', 'Certification', 'text', 'e.g. CCNA'], ['issuer', 'Issued by', 'text', 'e.g. Cisco'], ['year', 'Year', 'text'],
    ['url', 'Link to verify it (optional)', 'text', 'https://'],
  ] },
  projects: { add: 'Add a project', title: (e) => e.title || 'New project', sub: (e) => (e.tags || []).join(', '), fields: [
    ['title', 'Project', 'text'], ['description', 'What it was and their part in it', 'long'], ['image', 'Picture', 'image'],
    ['tags', 'Technologies or tags', 'tags', 'e.g. React, Django'], ['url', 'Link (optional)', 'text', 'https://'],
  ] },
  achievements: { add: 'Add an achievement', title: (e) => e.title || 'New achievement', sub: (e) => e.year, fields: [
    ['title', 'Achievement or award', 'text'], ['year', 'Year', 'text'], ['description', 'Details', 'long'],
  ] },
  testimonials: { add: 'Add a testimonial', title: (e) => e.author || 'New testimonial', sub: (e) => e.role, fields: [
    ['quote', 'What they said', 'long'], ['author', 'Who said it', 'text'], ['role', 'Their role or organisation', 'text'],
  ] },
};

const blank = (kind) => Object.fromEntries(LISTS[kind].fields.map(([key, , type]) => [key, type === 'check' ? false : type === 'tags' ? [] : '']));

/** Words typed with commas (or Enter) become a list of tags. */
const TagsInput = ({ value = [], onChange, placeholder, label }) => {
  const [draft, setDraft] = useState('');
  const add = () => {
    const parts = draft.split(',').map((t) => t.trim()).filter(Boolean);
    if (parts.length) onChange([...value, ...parts.filter((t) => !value.includes(t))]);
    setDraft('');
  };
  return (
    <div className="tpe-tags">
      <ul aria-label={label}>
        {value.map((t) => (
          <li key={t}>{t}<button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}><i className="fas fa-xmark" /></button></li>
        ))}
      </ul>
      <input className="input" value={draft} placeholder={placeholder || 'Type and press Enter'} aria-label={label}
        onChange={(e) => setDraft(e.target.value)} onBlur={add}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }} />
    </div>
  );
};

const ListEditor = ({ kind, items, onChange }) => {
  const spec = LISTS[kind];
  const [open, setOpen] = useState(null);
  const update = (i, patch) => onChange(items.map((e, k) => (k === i ? { ...e, ...patch } : e)));
  const move = (i, step) => {
    const next = [...items];
    [next[i], next[i + step]] = [next[i + step], next[i]];
    onChange(next);
    setOpen(i + step);
  };
  return (
    <div className="tpe-list">
      {items.length === 0 && <p className="muted small">Nothing added yet.</p>}
      {items.map((e, i) => (
        <details key={i} className="tpe-item" open={open === i} onToggle={(ev) => ev.currentTarget.open && setOpen(i)}>
          <summary>
            <span className="tpe-item__num">{i + 1}</span>
            <span className="tpe-item__title"><strong>{spec.title(e)}</strong>{spec.sub(e) && <small>{spec.sub(e)}</small>}</span>
            <span className="tpe-item__tools">
              <button type="button" className="icon-btn" aria-label="Move up" disabled={i === 0} onClick={(ev) => { ev.preventDefault(); move(i, -1); }}><i className="fas fa-arrow-up" /></button>
              <button type="button" className="icon-btn" aria-label="Move down" disabled={i === items.length - 1} onClick={(ev) => { ev.preventDefault(); move(i, 1); }}><i className="fas fa-arrow-down" /></button>
              <button type="button" className="icon-btn icon-btn--danger" aria-label="Remove" onClick={(ev) => { ev.preventDefault(); onChange(items.filter((_, k) => k !== i)); }}><i className="fas fa-trash-can" /></button>
            </span>
          </summary>
          <div className="tpe-item__fields">
            {spec.fields.map(([key, label, type, placeholder]) => {
              const id = `${kind}-${i}-${key}`;
              if (type === 'check') {
                return (
                  <label key={key} className="checkbox tpe-wide">
                    <input type="checkbox" checked={Boolean(e[key])} onChange={(ev) => update(i, { [key]: ev.target.checked })} />
                    <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span><span>{label}</span>
                  </label>
                );
              }
              if (type === 'image') return <div key={key} className="tpe-wide"><ImageField id={id} field={{ label }} value={e[key]} onChange={(v) => update(i, { [key]: v })} /></div>;
              if (type === 'tags') return <div key={key} className="field tpe-wide"><span className="field__label">{label}</span><TagsInput label={label} value={e[key] || []} placeholder={placeholder} onChange={(v) => update(i, { [key]: v })} /></div>;
              return (
                <label key={key} className={`field${type === 'long' ? ' tpe-wide' : ''}`} htmlFor={id}>
                  <span className="field__label">{label}</span>
                  {type === 'long'
                    ? <textarea id={id} className="input" rows={4} value={e[key] || ''} placeholder={placeholder} onChange={(ev) => update(i, { [key]: ev.target.value })} />
                    : <input id={id} className="input" value={e[key] || ''} placeholder={placeholder} disabled={key === 'end' && e.current} onChange={(ev) => update(i, { [key]: ev.target.value })} />}
                </label>
              );
            })}
          </div>
        </details>
      ))}
      <button type="button" className="btn btn--outline btn--sm" onClick={() => { onChange([...items, blank(kind)]); setOpen(items.length); }}>
        <i className="fas fa-plus" /> {spec.add}
      </button>
    </div>
  );
};

/**
 * Edits a team member's portfolio. Used by administrators (Admin → Team → a member: `admin`) and by the team
 * member for their own profile. `api` = { load, save(data), uploadCv(file), removeCv() }.
 */
export const TeamProfileEditor = ({ api, admin = false, header = null }) => {
  const [form, setForm] = useState(null);
  const [meta, setMeta] = useState(null);
  const [saved, setSaved] = useState('');
  const [tab, setTab] = useState('profile');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState([]);
  const cvInput = useRef(null);

  const adopt = (d) => {
    const f = Object.fromEntries(EDITABLE.map((k) => [k, d[k] ?? (k === 'socials' ? {} : '')]));
    f.display_name = f.display_name || '';
    f.years_experience = d.years_experience ?? '';
    setForm(f);
    setSaved(JSON.stringify(f));
    setMeta({ id: d.id, slug: d.slug, name: d.name, cv: d.cv, email: d.email, role_display: d.role_display, is_published: d.is_published });
    setErrors([]);
  };
  useEffect(() => {
    api.load().then(({ data }) => adopt(data)).catch(() => toast.error('The profile couldn’t be loaded.'));
  }, [api]);

  // Warn before leaving with unsaved changes
  const dirty = form && JSON.stringify(form) !== saved;
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (!form) return <div className="card panel"><div className="skeleton skeleton--block" /></div>;
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const text = (key, label, opts = {}) => (
    <label className={`field${opts.wide ? ' tpe-wide' : ''}`} htmlFor={`tpe-${key}`}>
      <span className="field__label">{label}</span>
      {opts.rows
        ? <textarea id={`tpe-${key}`} className="input" rows={opts.rows} maxLength={opts.max} value={form[key] || ''} placeholder={opts.placeholder} onChange={(e) => set(key)(e.target.value)} />
        : <input id={`tpe-${key}`} className="input" type={opts.type || 'text'} maxLength={opts.max} value={form[key] ?? ''} placeholder={opts.placeholder} onChange={(e) => set(key)(e.target.value)} />}
      {opts.hint && <small className="hint">{opts.hint}</small>}
    </label>
  );
  const save = async () => {
    setBusy(true);
    try {
      const { data } = await api.save(form);
      adopt(data);
      toast.success(data.is_published ? 'Saved. The changes are live on the Team page.' : 'Saved.');
    } catch (err) {
      const list = err.response?.data?.errors || [parseApiErrors(err).detail || 'Could not save.'];
      setErrors(list);
      toast.error(list[0]);
    } finally {
      setBusy(false);
    }
  };
  const uploadCv = async (file) => {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name)) { toast.error('Upload the CV as a PDF file.'); return; }
    try {
      const { data } = await api.uploadCv(file);
      setMeta((m) => ({ ...m, cv: data.cv }));
      toast.success('CV uploaded.');
    } catch (err) {
      toast.error(parseApiErrors(err).detail || 'The CV couldn’t be uploaded.');
    }
  };
  const removeCv = async () => {
    if (!window.confirm('Remove the uploaded CV?')) return;
    const { data } = await api.removeCv();
    setMeta((m) => ({ ...m, cv: data.cv }));
    toast.success('CV removed.');
  };

  return (
    <div className="tpe">
      <div className="tpe-bar">
        {header}
        <span className="tpe-bar__spacer" />
        {dirty && <span className="tpe-unsaved"><i className="fas fa-circle" /> Unsaved changes</span>}
        <Link to={`/team/${meta.slug}`} target="_blank" className="btn btn--outline btn--sm"><i className="fas fa-eye" /> {meta.is_published ? 'View page' : 'Preview'}</Link>
        <button type="button" className="btn btn--primary btn--sm" disabled={!dirty || busy} onClick={save}>
          {busy ? <span className="btn-spinner" /> : <i className="fas fa-floppy-disk" />} Save
        </button>
      </div>
      {errors.length > 0 && <div className="afb-errors" role="alert"><strong>Please fix:</strong><ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul></div>}

      <div className="tpe-layout">
        <nav className="tpe-tabs" aria-label="Profile sections">
          {TABS.map(([id, label, icon]) => (
            <button key={id} type="button" className={tab === id ? 'is-active' : ''} aria-pressed={tab === id} onClick={() => setTab(id)}>
              <i className={`fas ${icon}`} aria-hidden="true" /> {label}
            </button>
          ))}
        </nav>

        <section className="card panel tpe-panel">
          {tab === 'profile' && (
            <>
              <h2 className="tpe-h">Profile</h2>
              <div className="tpe-grid">
                {text('display_name', 'Name shown on the page', { max: 150, placeholder: meta.name, hint: 'Leave empty to use the account name.' })}
                {text('job_title', 'Job title', { max: 120, placeholder: 'e.g. Lead Software Engineer' })}
                {text('department', 'Department or team', { max: 120, placeholder: 'e.g. Software' })}
                {text('location', 'Location', { max: 120, placeholder: 'e.g. Freetown, Sierra Leone' })}
                {text('years_experience', 'Years of experience', { type: 'number', placeholder: 'e.g. 8' })}
                {text('headline', 'Headline', { max: 220, wide: true, placeholder: 'One sentence about what they do best', hint: 'Shown under the name and on the Team page card.' })}
                <div className="tpe-wide tpe-images">
                  <ImageField id="tpe-photo" field={{ label: 'Photo (square works best)' }} value={form.photo} onChange={set('photo')} />
                  <ImageField id="tpe-cover" field={{ label: 'Cover picture (optional, wide)' }} value={form.cover} onChange={set('cover')} />
                </div>
              </div>
            </>
          )}

          {tab === 'about' && (
            <>
              <h2 className="tpe-h">About</h2>
              <p className="muted small">The full introduction on their page. Leave a blank line between paragraphs; <code>**bold**</code>, <code>- bullet</code> and links work.</p>
              {text('bio', 'Biography', { rows: 14, max: 8000, wide: true })}
            </>
          )}

          {tab === 'skills' && (
            <>
              <h2 className="tpe-h">Skills</h2>
              <p className="muted small">Each skill shows as a bar; drag the slider to set the level.</p>
              <ul className="tpe-skills">
                {form.skills.map((s, i) => (
                  <li key={i}>
                    <input className="input" value={s.name} placeholder="Skill" aria-label={`Skill ${i + 1}`} maxLength={60}
                      onChange={(e) => set('skills')(form.skills.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} />
                    <input type="range" min={0} max={100} step={5} value={s.level} aria-label={`${s.name || 'Skill'} level`}
                      onChange={(e) => set('skills')(form.skills.map((x, k) => (k === i ? { ...x, level: Number(e.target.value) } : x)))} />
                    <span className="tpe-skills__pct">{s.level}%</span>
                    <button type="button" className="icon-btn icon-btn--danger" aria-label="Remove skill" onClick={() => set('skills')(form.skills.filter((_, k) => k !== i))}><i className="fas fa-trash-can" /></button>
                  </li>
                ))}
              </ul>
              <button type="button" className="btn btn--outline btn--sm" onClick={() => set('skills')([...form.skills, { name: '', level: 70 }])}><i className="fas fa-plus" /> Add a skill</button>
              <div className="tpe-grid tpe-gap">
                <div className="field tpe-wide"><span className="field__label">Areas of expertise</span><TagsInput label="Areas of expertise" value={form.expertise} onChange={set('expertise')} placeholder="e.g. Cloud networking, then Enter" /></div>
                <div className="field tpe-wide"><span className="field__label">Languages</span><TagsInput label="Languages" value={form.languages} onChange={set('languages')} placeholder="e.g. English, Krio" /></div>
              </div>
            </>
          )}

          {tab === 'experience' && <><h2 className="tpe-h">Experience</h2><ListEditor kind="experience" items={form.experience} onChange={set('experience')} /></>}
          {tab === 'education' && (
            <>
              <h2 className="tpe-h">Education</h2><ListEditor kind="education" items={form.education} onChange={set('education')} />
              <h2 className="tpe-h tpe-gap">Certifications</h2><ListEditor kind="certifications" items={form.certifications} onChange={set('certifications')} />
            </>
          )}
          {tab === 'projects' && <><h2 className="tpe-h">Projects</h2><ListEditor kind="projects" items={form.projects} onChange={set('projects')} /></>}
          {tab === 'more' && (
            <>
              <h2 className="tpe-h">Achievements</h2><ListEditor kind="achievements" items={form.achievements} onChange={set('achievements')} />
              <h2 className="tpe-h tpe-gap">Testimonials</h2><ListEditor kind="testimonials" items={form.testimonials} onChange={set('testimonials')} />
            </>
          )}

          {tab === 'contact' && (
            <>
              <h2 className="tpe-h">Contact & links</h2>
              <div className="tpe-grid">
                {text('public_email', 'Public email (optional)', { type: 'email', hint: 'Shown on their page. Leave empty to keep it private.' })}
                {text('public_phone', 'Public phone (optional)', { max: 40 })}
                {SOCIAL_NETWORKS.map((n) => (
                  <label key={n.id} className="field" htmlFor={`tpe-s-${n.id}`}>
                    <span className="field__label"><i className={n.icon} aria-hidden="true" /> {n.label}</span>
                    <input id={`tpe-s-${n.id}`} className="input" value={form.socials[n.id] || ''} placeholder={n.placeholder}
                      onChange={(e) => set('socials')({ ...form.socials, [n.id]: e.target.value })} />
                  </label>
                ))}
              </div>
            </>
          )}

          {tab === 'cv' && (
            <>
              <h2 className="tpe-h">CV</h2>
              <div className="tpe-cv">
                <div>
                  <strong>{meta.cv.file ? meta.cv.file_name : 'No CV uploaded'}</strong>
                  <small className="muted">A PDF people can open from the profile.</small>
                </div>
                <input ref={cvInput} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { uploadCv(e.target.files[0]); e.target.value = ''; }} />
                <button type="button" className="btn btn--outline btn--sm" onClick={() => cvInput.current?.click()}><i className="fas fa-upload" /> {meta.cv.file ? 'Replace PDF' : 'Upload PDF'}</button>
                {meta.cv.file && <button type="button" className="btn btn--text btn--sm text-danger" onClick={removeCv}>Remove</button>}
              </div>
              <label className="checkbox">
                <input type="checkbox" checked={form.generated_cv} onChange={(e) => set('generated_cv')(e.target.checked)} />
                <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span>
                <span>Offer the printable CV made from this profile<small>Always up to date with the profile; people can print it or save it as PDF.</small></span>
              </label>
              <label className="field" htmlFor="tpe-cvvis">
                <span className="field__label">Who can see the CV</span>
                <select id="tpe-cvvis" className="input" value={form.cv_visibility} onChange={(e) => set('cv_visibility')(e.target.value)}>
                  <option value="public">Everyone</option>
                  <option value="members">Signed-in users only</option>
                  <option value="hidden">Nobody (hidden)</option>
                </select>
              </label>
              <h2 className="tpe-h tpe-gap">Chat</h2>
              <label className="checkbox">
                <input type="checkbox" checked={form.allow_chat} onChange={(e) => set('allow_chat')(e.target.checked)} />
                <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span>
                <span>People can message {admin ? 'this team member' : 'me'} from the profile<small>Messages arrive in {admin ? 'their' : 'your'} portal inbox, with an email.</small></span>
              </label>
              {admin && (
                <>
                  <h2 className="tpe-h tpe-gap">Publishing</h2>
                  <label className="checkbox">
                    <input type="checkbox" checked={form.is_published} onChange={(e) => set('is_published')(e.target.checked)} />
                    <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span>
                    <span>Published on the Team page<small>Unpublished profiles can only be previewed by administrators and the member.</small></span>
                  </label>
                  <label className="checkbox">
                    <input type="checkbox" checked={form.featured} onChange={(e) => set('featured')(e.target.checked)} />
                    <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span>
                    <span>Featured<small>Shown first on the Team page.</small></span>
                  </label>
                  {text('slug', 'Page address', { max: 80, hint: `The page is /team/${form.slug || '…'}` })}
                </>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
};

export default TeamProfileEditor;

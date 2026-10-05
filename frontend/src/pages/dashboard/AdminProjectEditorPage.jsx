import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import PortalLayout from '../../components/layout/PortalLayout';
import { ImageField } from '../../components/admin/contentFields';
import Markdown from '../../components/blog/Markdown';
import { useServices } from '../../content/useServices';
import { projectsAPI, parseApiErrors } from '../../services/api';
import { formatDateTime } from '../../utils/format';
import '../../styles/blog-admin.css';
import '../../styles/projects-admin.css';

const BLANK = {
  title: '', slug: '', summary: '', status: 'draft', featured: false, client: '', client_logo: '', sector: '', location: '', service: '',
  completed_on: '', duration: '', live_url: '', cover: '', cover_alt: '', challenge: '', solution: '', outcome: '',
  results: [], gallery: [], technologies: [], quote: '', quote_author: '', quote_role: '',
};
const toForm = (p) => ({ ...BLANK, ...Object.fromEntries(Object.keys(BLANK).map((k) => [k, p[k] ?? BLANK[k]])) });
const slugify = (text) => text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s-]/g, '').trim().replace(/[\s-]+/g, '-').slice(0, 120);
const SECTORS = ['Education', 'Health', 'NGO & development', 'Government', 'Finance', 'Retail & commerce', 'Hospitality', 'Agriculture', 'Technology', 'Media'];
const STORY = [
  ['challenge', 'The challenge', 'What problem did the client have? What was slowing them down?'],
  ['solution', 'What we did', 'How ADRAM solved it: the approach, the features, the work delivered.'],
  ['outcome', 'The outcome', 'What changed for the client afterwards.'],
];

/** One part of the case study: Markdown with a Write / Preview switch. */
const StoryField = ({ id, label, hint, value, onChange }) => {
  const [preview, setPreview] = useState(false);
  return (
    <div className="field pja-story">
      <div className="pja-story__head">
        <label className="field__label" htmlFor={`pj-${id}`}>{label}</label>
        <div className="pja-switch" role="tablist" aria-label={`${label}: write or preview`}>
          <button type="button" role="tab" aria-selected={!preview} className={!preview ? 'is-active' : ''} onClick={() => setPreview(false)}>Write</button>
          <button type="button" role="tab" aria-selected={preview} className={preview ? 'is-active' : ''} onClick={() => setPreview(true)}>Preview</button>
        </div>
      </div>
      {preview
        ? <div className="pja-preview prose">{value.trim() ? <Markdown source={value} /> : <p className="muted">Nothing to preview yet.</p>}</div>
        : <textarea id={`pj-${id}`} className="input" rows={6} maxLength={8000} value={value} placeholder={hint} onChange={(e) => onChange(e.target.value)} />}
      <small className="hint">Use **bold**, lists starting with - and links like [text](https://…).</small>
    </div>
  );
};

/** Admin → Projects → a project: the facts, the story, pictures, results and a client quote. */
export const AdminProjectEditorPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { services } = useServices();
  const isNew = !id || id === 'new';
  const [project, setProject] = useState(isNew ? null : undefined);
  const [form, setForm] = useState(BLANK);
  const [saved, setSaved] = useState(JSON.stringify(BLANK));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState('');
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [techDraft, setTechDraft] = useState('');

  useEffect(() => {
    if (isNew) return;
    projectsAPI.manageOne(id).then(({ data }) => {
      const f = toForm(data);
      setProject(data);
      setForm(f);
      setSaved(JSON.stringify(f));
    }).catch(() => setProject(false));
  }, [id, isNew]);

  const dirty = JSON.stringify(form) !== saved;
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const set = useCallback((key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }, []);
  const setTitle = (value) => {
    setForm((f) => ({ ...f, title: value, ...(slugTouched ? {} : { slug: slugify(value) }) }));
    setErrors((e) => ({ ...e, title: undefined }));
  };
  const setRow = (key, index, patch) => set(key, form[key].map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const dropRow = (key, index) => set(key, form[key].filter((_, i) => i !== index));
  const moveRow = (key, index, by) => {
    const next = [...form[key]];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    set(key, next);
  };
  const addTech = (raw) => {
    const t = raw.replace(/,/g, '').trim();
    if (t && !form.technologies.some((x) => x.toLowerCase() === t.toLowerCase()) && form.technologies.length < 15) set('technologies', [...form.technologies, t]);
    setTechDraft('');
  };

  const save = async (patch = {}, message = 'Saved.') => {
    const payload = { ...form, ...patch, completed_on: (patch.completed_on ?? form.completed_on) || null };
    setBusy(patch.status || 'save');
    try {
      const { data } = project ? await projectsAPI.update(project.id, payload) : await projectsAPI.create(payload);
      const f = toForm(data);
      setProject(data);
      setForm(f);
      setSaved(JSON.stringify(f));
      setSlugTouched(true);
      toast.success(message);
      if (!project) navigate(`/admin/projects/${data.id}`, { replace: true });
    } catch (err) {
      const errs = err.response?.data?.errors || parseApiErrors(err);
      setErrors(errs);
      toast.error(err.response?.data?.detail || Object.values(errs)[0] || 'Please check the highlighted fields.');
    } finally {
      setBusy('');
    }
  };

  if (project === undefined) return <PortalLayout title="Project"><div className="card panel"><p className="muted">Loading…</p></div></PortalLayout>;
  if (project === false) return <PortalLayout title="Project"><div className="card panel"><p>This project doesn’t exist. <Link to="/admin/projects">Back to projects</Link></p></div></PortalLayout>;

  const live = project?.status === 'published';
  const err = (key) => errors[key] && <small className="pja-error">{errors[key]}</small>;
  const input = (key, label, props = {}) => (
    <label className="field"><span className="field__label">{label}</span>
      <input className="input" value={form[key]} aria-invalid={Boolean(errors[key])} onChange={(e) => set(key, e.target.value)} {...props} />
      {props.hint && <small className="hint">{props.hint}</small>}
      {err(key)}
    </label>
  );

  return (
    <PortalLayout title={isNew ? 'New project' : 'Edit project'}>
      <div className="be-top">
        <Link to="/admin/projects" className="btn btn--text btn--sm"><i className="fas fa-arrow-left" /> All projects</Link>
        <span className={`badge ${live ? 'badge--green' : 'badge--gray'}`}>{live ? 'Published' : 'Draft'}</span>
        {dirty && <span className="be-unsaved"><i className="fas fa-circle" /> Unsaved changes</span>}
        <span className="be-top__spacer" />
        {project && (
          <a href={`/projects/${project.slug}`} target="_blank" rel="noreferrer" className="btn btn--outline btn--sm">
            <i className="fas fa-arrow-up-right-from-square" /> {live ? 'View project' : 'Preview'}
          </a>
        )}
      </div>

      <div className="be-grid">
        <div className="be-main">
          <section className="card be-writer">
            <textarea className="be-title" rows={1} placeholder="Project title, e.g. Online admissions portal for St Edward’s" value={form.title} maxLength={160}
              aria-label="Title" aria-invalid={Boolean(errors.title)} onChange={(e) => setTitle(e.target.value)} />
            {err('title')}
            <textarea className="be-excerpt" rows={2} placeholder="A one or two sentence summary, shown on the project card" value={form.summary} maxLength={320}
              aria-label="Summary" aria-invalid={Boolean(errors.summary)} onChange={(e) => set('summary', e.target.value)} />
            {err('summary')}
          </section>

          <section className="card panel be-box">
            <h2 className="be-box__title">The story</h2>
            <p className="muted small pja-lead">Three short parts make a strong case study. Leave any part empty to hide it.</p>
            {STORY.map(([key, label, hint]) => (
              <StoryField key={key} id={key} label={label} hint={hint} value={form[key]} onChange={(v) => set(key, v)} />
            ))}
          </section>

          <section className="card panel be-box">
            <div className="pja-box-head">
              <h2 className="be-box__title">Key results</h2>
              <button type="button" className="btn btn--outline btn--sm" disabled={form.results.length >= 6} onClick={() => set('results', [...form.results, { value: '', label: '' }])}>
                <i className="fas fa-plus" /> Add a result
              </button>
            </div>
            <p className="muted small pja-lead">Numbers stand out on the case study, e.g. “60%” · “less paperwork”, or “1,200” · “pupils enrolled online”.</p>
            {form.results.length > 0 && (
              <ul className="pja-rows">
                {form.results.map((r, i) => (
                  <li key={i} className="pja-result">
                    <input className="input" placeholder="60%" maxLength={24} value={r.value} aria-label={`Result ${i + 1}: number`} onChange={(e) => setRow('results', i, { value: e.target.value })} />
                    <input className="input" placeholder="less paperwork" maxLength={80} value={r.label} aria-label={`Result ${i + 1}: what it measures`} onChange={(e) => setRow('results', i, { label: e.target.value })} />
                    <button type="button" className="icon-btn pja-danger" onClick={() => dropRow('results', i)} aria-label={`Remove result ${i + 1}`}><i className="fas fa-xmark" /></button>
                  </li>
                ))}
              </ul>
            )}
            {err('results')}
          </section>

          <section className="card panel be-box">
            <div className="pja-box-head">
              <h2 className="be-box__title">Gallery</h2>
              <button type="button" className="btn btn--outline btn--sm" disabled={form.gallery.length >= 12} onClick={() => set('gallery', [...form.gallery, { src: '', caption: '' }])}>
                <i className="fas fa-plus" /> Add a picture
              </button>
            </div>
            <p className="muted small pja-lead">Screenshots or photos of the finished work (up to 12). Visitors can open them large.</p>
            {form.gallery.length > 0 && (
              <ul className="pja-rows">
                {form.gallery.map((g, i) => (
                  <li key={i} className="pja-pic">
                    <ImageField field={{ label: `Picture ${i + 1}` }} value={g.src} onChange={(v) => setRow('gallery', i, { src: v })} id={`pj-gallery-${i}`} />
                    <div className="pja-pic__side">
                      <input className="input" placeholder="Caption (optional)" maxLength={160} value={g.caption} aria-label={`Picture ${i + 1} caption`} onChange={(e) => setRow('gallery', i, { caption: e.target.value })} />
                      <span className="pja-pic__tools">
                        <button type="button" className="icon-btn" disabled={i === 0} onClick={() => moveRow('gallery', i, -1)} aria-label={`Move picture ${i + 1} up`}><i className="fas fa-arrow-up" /></button>
                        <button type="button" className="icon-btn" disabled={i === form.gallery.length - 1} onClick={() => moveRow('gallery', i, 1)} aria-label={`Move picture ${i + 1} down`}><i className="fas fa-arrow-down" /></button>
                        <button type="button" className="icon-btn pja-danger" onClick={() => dropRow('gallery', i)} aria-label={`Remove picture ${i + 1}`}><i className="fas fa-trash-can" /></button>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {err('gallery')}
          </section>

          <section className="card panel be-box">
            <h2 className="be-box__title">Client quote</h2>
            <label className="field"><span className="field__label">What the client said (optional)</span>
              <textarea className="input" rows={3} maxLength={800} value={form.quote} onChange={(e) => set('quote', e.target.value)}
                placeholder="“ADRAM understood exactly what we needed…”" /></label>
            {form.quote.trim() && (
              <div className="pja-two">
                {input('quote_author', 'Name', { maxLength: 120, placeholder: 'e.g. Mrs Fatmata Kamara' })}
                {input('quote_role', 'Role', { maxLength: 120, placeholder: 'e.g. Principal, St Edward’s' })}
              </div>
            )}
          </section>
        </div>

        <aside className="be-side">
          <section className="card panel be-box">
            <h2 className="be-box__title">Publish</h2>
            <label className="checkbox">
              <input type="checkbox" checked={form.featured} onChange={(e) => set('featured', e.target.checked)} />
              <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span>
              <span>Feature at the top of the page<small>Shown large, with its key results, above the other projects.</small></span>
            </label>
            <div className="be-actions">
              {!live ? (
                <>
                  <button type="button" className="btn btn--outline btn--sm" disabled={Boolean(busy)} onClick={() => save({ status: 'draft' }, 'Draft saved.')}>
                    {busy === 'draft' && <span className="btn-spinner" />} Save draft
                  </button>
                  <button type="button" className="btn btn--primary btn--sm" disabled={Boolean(busy)} onClick={() => save({ status: 'published' }, 'Project published.')}>
                    {busy === 'published' ? <span className="btn-spinner" /> : <i className="fas fa-paper-plane" />} Publish
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="btn btn--primary btn--sm" disabled={Boolean(busy) || !dirty} onClick={() => save({ status: 'published' }, 'Project updated.')}>
                    {busy === 'published' && <span className="btn-spinner" />} Update
                  </button>
                  <button type="button" className="btn btn--outline btn--sm" disabled={Boolean(busy)} onClick={() => save({ status: 'draft' }, 'Moved back to drafts.')}>Unpublish</button>
                </>
              )}
            </div>
            {project && <p className="be-meta">Created {formatDateTime(project.created_at)} · last saved {formatDateTime(project.updated_at)}</p>}
          </section>

          <section className="card panel be-box">
            <h2 className="be-box__title">Cover picture</h2>
            <ImageField field={{ label: 'Shown on the project card and at the top of the case study' }} value={form.cover} onChange={(v) => set('cover', v)} id="pj-cover" />
            {err('cover')}
            {form.cover && input('cover_alt', 'Describe the picture', { maxLength: 200, placeholder: 'For screen readers and search engines' })}
          </section>

          <section className="card panel be-box">
            <h2 className="be-box__title">Project details</h2>
            <label className="field"><span className="field__label">Service</span>
              <select className="input" value={form.service} onChange={(e) => set('service', e.target.value)}>
                <option value="">Choose a service</option>
                {services.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
              <small className="hint">Visitors can filter the projects by service.</small>
            </label>
            {input('client', 'Client', { maxLength: 150, placeholder: 'e.g. St Edward’s Secondary School' })}
            <ImageField field={{ label: 'Client logo (optional)' }} value={form.client_logo} onChange={(v) => set('client_logo', v)} id="pj-logo" />
            {err('client_logo')}
            {input('sector', 'Sector', { maxLength: 80, list: 'pj-sectors', placeholder: 'e.g. Education' })}
            <datalist id="pj-sectors">{SECTORS.map((s) => <option key={s} value={s} />)}</datalist>
            {input('location', 'Location', { maxLength: 120, placeholder: 'e.g. Freetown, Sierra Leone' })}
            <div className="pja-two">
              {input('completed_on', 'Completed', { type: 'date' })}
              {input('duration', 'Duration', { maxLength: 60, placeholder: 'e.g. 3 months' })}
            </div>
            {input('live_url', 'Live link (optional)', { maxLength: 300, placeholder: 'https://…', hint: 'Adds a “Visit the live project” button.' })}
          </section>

          <section className="card panel be-box">
            <h2 className="be-box__title">Technologies used</h2>
            <div className="field">
              {form.technologies.length > 0 && (
                <ul className="be-tags">{form.technologies.map((t) => (
                  <li key={t}>{t}<button type="button" aria-label={`Remove ${t}`} onClick={() => set('technologies', form.technologies.filter((x) => x !== t))}><i className="fas fa-xmark" /></button></li>
                ))}</ul>
              )}
              <input className="input" aria-label="Add a technology" placeholder="e.g. React, Django, Cisco… then press Enter" value={techDraft} maxLength={40}
                onChange={(e) => (e.target.value.endsWith(',') ? addTech(e.target.value) : setTechDraft(e.target.value))}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTech(techDraft); } }}
                onBlur={() => techDraft && addTech(techDraft)} />
            </div>
          </section>

          <section className="card panel be-box">
            <h2 className="be-box__title">Page address</h2>
            <div className="be-slug"><span>/projects/</span>
              <input className="input" value={form.slug} maxLength={120} aria-label="Page address" aria-invalid={Boolean(errors.slug)}
                onChange={(e) => { setSlugTouched(true); set('slug', slugify(e.target.value)); }} placeholder="made-from-the-title" />
            </div>
            {err('slug')}
          </section>

          {project && (
            <button type="button" className="btn btn--text btn--sm pja-danger be-delete" onClick={async () => {
              if (!window.confirm('Delete this project? This can’t be undone.')) return;
              await projectsAPI.remove(project.id);
              setSaved(JSON.stringify(form));
              toast.success('Project deleted.');
              navigate('/admin/projects');
            }}><i className="fas fa-trash-can" /> Delete project</button>
          )}
        </aside>
      </div>
    </PortalLayout>
  );
};

export default AdminProjectEditorPage;

import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import PortalLayout from '../../components/layout/PortalLayout';
import FormQuestion from '../../components/portal/FormQuestion';
import { staffPortalAPI, parseApiErrors } from '../../services/api';
import { CHOICE_TYPES, FIELD_TYPES, PREFILLS, tempId } from '../../utils/applicationForm';
import { formatDateTime } from '../../utils/format';
import '../../styles/application-form.css';

const typeInfo = (type) => FIELD_TYPES.find((t) => t.type === type) || FIELD_TYPES[0];
const newField = (type) => ({ id: tempId('q'), type, label: '', help: '', required: false, options: CHOICE_TYPES.includes(type) ? ['Option 1', 'Option 2'] : [], width: ['textarea', 'checkboxes', 'radio'].includes(type) ? 'full' : 'half', prefill: '' });
const move = (list, i, step) => {
  const next = [...list];
  [next[i], next[i + step]] = [next[i + step], next[i]];
  return next;
};

const QuestionEditor = ({ field, index, count, onChange, onMove, onRemove, onDuplicate }) => {
  const [open, setOpen] = useState(!field.label);
  const set = (key, value) => onChange({ ...field, [key]: value });
  const info = typeInfo(field.type);
  return (
    <li className={`afb-q${open ? ' is-open' : ''}`}>
      <div className="afb-q__bar">
        <span className="afb-q__type" title={info.label}><i className={`fas ${info.icon}`} aria-hidden="true" /></span>
        <button type="button" className="afb-q__name" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {field.label || <em>Untitled question</em>}{field.required && <span className="afb-q__req">Required</span>}
        </button>
        <span className="afb-q__tools">
          <button type="button" aria-label="Move up" disabled={index === 0} onClick={() => onMove(-1)}><i className="fas fa-arrow-up" /></button>
          <button type="button" aria-label="Move down" disabled={index === count - 1} onClick={() => onMove(1)}><i className="fas fa-arrow-down" /></button>
          <button type="button" aria-label="Duplicate" onClick={onDuplicate}><i className="far fa-copy" /></button>
          <button type="button" aria-label="Delete question" className="afb-danger" onClick={onRemove}><i className="fas fa-trash-can" /></button>
        </span>
      </div>
      {open && (
        <div className="afb-q__body">
          <div className="afb-row">
            <label className="field afb-grow"><span className="field__label">Question</span>
              <input className="input" value={field.label} maxLength={200} placeholder="e.g. Passport number" onChange={(e) => set('label', e.target.value)} autoFocus={!field.label} /></label>
            <label className="field"><span className="field__label">Answer type</span>
              <select className="input" value={field.type} onChange={(e) => {
                const type = e.target.value;
                onChange({ ...field, type, options: CHOICE_TYPES.includes(type) ? (field.options.length ? field.options : ['Option 1', 'Option 2']) : [] });
              }}>
                {FIELD_TYPES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
              </select></label>
          </div>
          <label className="field"><span className="field__label">Help text (optional)</span>
            <input className="input" value={field.help} maxLength={300} placeholder="A short hint shown under the question" onChange={(e) => set('help', e.target.value)} /></label>
          {CHOICE_TYPES.includes(field.type) && (
            <label className="field"><span className="field__label">Options (one per line)</span>
              <textarea className="input" rows={4} value={field.options.join('\n')} onChange={(e) => set('options', e.target.value.split('\n'))} /></label>
          )}
          <div className="afb-row afb-row--checks">
            <label className="checkbox">
              <input type="checkbox" checked={field.required} onChange={(e) => set('required', e.target.checked)} />
              <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span><span>Required</span>
            </label>
            <label className="checkbox">
              <input type="checkbox" checked={field.width === 'full'} disabled={['textarea', 'checkboxes', 'radio'].includes(field.type)} onChange={(e) => set('width', e.target.checked ? 'full' : 'half')} />
              <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span><span>Full width</span>
            </label>
            <label className="field afb-prefill"><span className="field__label">Fill in from the student’s account</span>
              <select className="input" value={field.prefill} onChange={(e) => set('prefill', e.target.value)}>
                {PREFILLS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select></label>
          </div>
        </div>
      )}
    </li>
  );
};

const AddQuestion = ({ onAdd }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="afb-add">
      {open ? (
        <div className="afb-add__menu" role="menu">
          {FIELD_TYPES.map((t) => (
            <button key={t.type} type="button" role="menuitem" onClick={() => { onAdd(newField(t.type)); setOpen(false); }}>
              <i className={`fas ${t.icon}`} aria-hidden="true" /> {t.label}
            </button>
          ))}
          <button type="button" className="afb-add__cancel" onClick={() => setOpen(false)}>Cancel</button>
        </div>
      ) : (
        <button type="button" className="btn btn--outline btn--sm" onClick={() => setOpen(true)}><i className="fas fa-plus" /> Add a question</button>
      )}
    </div>
  );
};

/** The form designer tab. */
const FormDesigner = () => {
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState(null);
  const [meta, setMeta] = useState({});
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(0);

  const adopt = (d) => {
    const f = { title: d.title, intro: d.intro, declaration: d.declaration, sections: d.sections, allow_online: d.allow_online, allow_upload: d.allow_upload };
    setForm(f);
    setSaved(JSON.stringify(f));
    setMeta({ updated_at: d.updated_at, submissions: d.submissions ?? meta.submissions });
    setErrors([]);
  };
  useEffect(() => {
    staffPortalAPI.formTemplate().then(({ data }) => adopt(data)).catch(() => toast.error('Could not load the form.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!form) return <div className="card panel"><p className="muted">Loading…</p></div>;
  const dirty = JSON.stringify(form) !== saved;
  const setSections = (sections) => setForm((f) => ({ ...f, sections }));
  const setSection = (i, patch) => setSections(form.sections.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const questions = form.sections.reduce((n, s) => n + s.fields.length, 0);

  const save = async () => {
    setBusy(true);
    try {
      const { data } = await staffPortalAPI.saveFormTemplate(form);
      adopt(data);
      toast.success('Application form saved.');
    } catch (err) {
      const list = err.response?.data?.errors || [parseApiErrors(err).detail || 'Could not save.'];
      setErrors(list);
      toast.error(list[0]);
    } finally {
      setBusy(false);
    }
  };
  const reset = async () => {
    if (!window.confirm('Replace your form with ADRAM’s original form? Your changes to the questions will be lost.')) return;
    const { data } = await staffPortalAPI.resetFormTemplate();
    adopt(data);
    setPreview(0);
    toast.success('The original form is back.');
  };
  const shown = form.sections[Math.min(preview, form.sections.length - 1)];

  return (
    <>
      <div className="afb-top">
        <span className="muted small">{form.sections.length} sections · {questions} questions{meta.updated_at && <> · Last saved {formatDateTime(meta.updated_at)}</>}</span>
        <span className="afb-top__spacer" />
        {dirty && <span className="afb-unsaved"><i className="fas fa-circle" /> Unsaved changes</span>}
        <button type="button" className="btn btn--text btn--sm" onClick={reset}><i className="fas fa-rotate-left" /> Original form</button>
        <button type="button" className="btn btn--outline btn--sm" disabled={!dirty} onClick={() => adopt({ ...JSON.parse(saved), updated_at: meta.updated_at })}>Discard changes</button>
        <button type="button" className="btn btn--primary btn--sm" disabled={!dirty || busy} onClick={save}>{busy ? <span className="btn-spinner" /> : <i className="fas fa-floppy-disk" />} Save form</button>
      </div>
      {meta.submissions > 0 && <p className="afb-note"><i className="fas fa-circle-info" aria-hidden="true" /> {meta.submissions} student{meta.submissions === 1 ? ' has' : 's have'} already submitted this form. Their copies keep the questions they answered; your changes apply to new and returned forms.</p>}
      {errors.length > 0 && <div className="afb-errors" role="alert"><strong>Please fix:</strong><ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul></div>}

      <div className="afb-layout">
        <div className="afb-edit">
          <section className="card panel afb-card">
            <h2 className="afb-h">Form details</h2>
            <label className="field"><span className="field__label">Title</span>
              <input className="input" value={form.title} maxLength={150} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} /></label>
            <label className="field"><span className="field__label">Introduction</span>
              <textarea className="input" rows={3} maxLength={2000} value={form.intro} onChange={(e) => setForm((f) => ({ ...f, intro: e.target.value }))} /></label>
            <label className="field"><span className="field__label">Declaration students tick before submitting (leave empty for none)</span>
              <textarea className="input" rows={3} maxLength={1000} value={form.declaration} onChange={(e) => setForm((f) => ({ ...f, declaration: e.target.value }))} /></label>
            <div className="afb-ways">
              <span className="field__label">How students can complete it</span>
              <label className="checkbox">
                <input type="checkbox" checked={form.allow_online} onChange={(e) => setForm((f) => ({ ...f, allow_online: e.target.checked }))} />
                <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span>
                <span>Online in the portal<small>Answers are saved as they type; you read them here and download a PDF.</small></span>
              </label>
              <label className="checkbox">
                <input type="checkbox" checked={form.allow_upload} onChange={(e) => setForm((f) => ({ ...f, allow_upload: e.target.checked }))} />
                <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span>
                <span>On paper<small>They download a blank form, fill it in by hand and upload a scan or photos.</small></span>
              </label>
            </div>
          </section>

          {form.sections.map((s, i) => (
            <section key={s.id} className="card panel afb-card afb-section">
              <div className="afb-section__head">
                <span className="afb-section__num">{i + 1}</span>
                <input className="input afb-section__title" aria-label="Section title" value={s.title} maxLength={120} placeholder="Section title" onChange={(e) => setSection(i, { title: e.target.value })} />
                <span className="afb-q__tools">
                  <button type="button" aria-label="Move section up" disabled={i === 0} onClick={() => setSections(move(form.sections, i, -1))}><i className="fas fa-arrow-up" /></button>
                  <button type="button" aria-label="Move section down" disabled={i === form.sections.length - 1} onClick={() => setSections(move(form.sections, i, 1))}><i className="fas fa-arrow-down" /></button>
                  <button type="button" aria-label="Preview section" onClick={() => setPreview(i)}><i className="fas fa-eye" /></button>
                  <button type="button" aria-label="Delete section" className="afb-danger" onClick={() => {
                    if (window.confirm(`Delete the section “${s.title || i + 1}” and its ${s.fields.length} questions?`)) setSections(form.sections.filter((_, k) => k !== i));
                  }}><i className="fas fa-trash-can" /></button>
                </span>
              </div>
              <input className="input afb-section__desc" aria-label="Section description" value={s.description} maxLength={400} placeholder="Short description (optional)" onChange={(e) => setSection(i, { description: e.target.value })} />
              <ul className="afb-qs">
                {s.fields.map((f, k) => (
                  <QuestionEditor key={f.id} field={f} index={k} count={s.fields.length}
                    onChange={(next) => setSection(i, { fields: s.fields.map((x, j) => (j === k ? next : x)) })}
                    onMove={(step) => setSection(i, { fields: move(s.fields, k, step) })}
                    onDuplicate={() => setSection(i, { fields: [...s.fields.slice(0, k + 1), { ...f, id: tempId('q'), label: `${f.label} (copy)` }, ...s.fields.slice(k + 1)] })}
                    onRemove={() => setSection(i, { fields: s.fields.filter((_, j) => j !== k) })} />
                ))}
              </ul>
              <AddQuestion onAdd={(field) => setSection(i, { fields: [...s.fields, field] })} />
            </section>
          ))}
          <button type="button" className="btn btn--outline afb-add-section" onClick={() => { setSections([...form.sections, { id: tempId('s'), title: '', description: '', fields: [] }]); setPreview(form.sections.length); }}>
            <i className="fas fa-layer-group" /> Add a section
          </button>
        </div>

        <aside className="afb-preview">
          <div className="card afb-preview__card">
            <div className="afb-preview__bar">
              <strong>Student’s view</strong>
              <select className="input" aria-label="Section to preview" value={Math.min(preview, form.sections.length - 1)} onChange={(e) => setPreview(Number(e.target.value))}>
                {form.sections.map((s, i) => <option key={s.id} value={i}>{i + 1}. {s.title || 'Untitled section'}</option>)}
              </select>
            </div>
            {shown ? (
              <div className="afb-preview__body">
                <h3>{shown.title || 'Untitled section'}</h3>
                {shown.description && <p className="muted small">{shown.description}</p>}
                <div className="af-grid">
                  {shown.fields.map((f) => <FormQuestion key={f.id} field={{ ...f, label: f.label || 'Untitled question', options: f.options.filter(Boolean) }} value={undefined} onChange={() => {}} disabled />)}
                </div>
                {shown.fields.length === 0 && <p className="muted small">Add questions to see them here.</p>}
              </div>
            ) : <p className="muted afb-preview__body">Add a section to start.</p>}
          </div>
        </aside>
      </div>
    </>
  );
};

const STATES = [
  ['', 'All'],
  ['submitted', 'To review'],
  ['not_started', 'Not started'],
  ['draft', 'In progress'],
  ['returned', 'Returned'],
  ['reviewed', 'Approved'],
];
const STATE_BADGE = {
  not_started: ['badge--gray', 'Not started'], draft: ['badge--gray', 'In progress'], submitted: ['badge--blue', 'To review'],
  returned: ['badge--amber', 'Returned to student'], reviewed: ['badge--green', 'Approved'],
};

/** Every application ADRAM is working on and where its form is: the admin's inbox for application forms. */
const Submissions = () => {
  const [state, setState] = useState('');
  const [method, setMethod] = useState('');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);
  const load = useCallback(() => staffPortalAPI.applicationForms({ state: state || undefined, method: method || undefined, q: search || undefined })
    .then(({ data: d }) => setData(d)).catch(() => toast.error('Could not load the forms.')), [state, method, search]);
  useEffect(() => {
    load();
  }, [load]);

  const remind = async (row) => {
    setBusy(row.application_id);
    try {
      await staffPortalAPI.applicationFormAction(row.application_id, { action: 'remind' });
      toast.success(`Reminder sent to ${row.student.email}.`);
      load();
    } catch (err) {
      toast.error(parseApiErrors(err).detail || 'Could not send the reminder.');
    } finally {
      setBusy(null);
    }
  };
  const total = data ? Object.values(data.counts).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="afs">
      {data && (
        <div className="afs-stats">
          <div className="afs-stat is-blue"><strong>{data.counts.submitted}</strong><span>To review</span></div>
          <div className="afs-stat"><strong>{data.counts.not_started + data.counts.draft}</strong><span>Waiting for the student</span></div>
          <div className="afs-stat is-amber"><strong>{data.counts.returned}</strong><span>Returned for changes</span></div>
          <div className="afs-stat is-green"><strong>{data.counts.reviewed}</strong><span>Approved</span></div>
        </div>
      )}
      <section className="card table-card">
        <div className="afs-toolbar">
          <div className="afs-search">
            <i className="fas fa-magnifying-glass" aria-hidden="true" />
            <input className="input" type="search" placeholder="Search student, scholarship or reference" aria-label="Search forms" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="afs-filters" role="tablist" aria-label="Filter by status">
            {STATES.map(([id, label]) => (
              <button key={id || 'all'} type="button" role="tab" aria-selected={state === id} className={`afs-filter${state === id ? ' is-active' : ''}`} onClick={() => setState(id)}>
                {label}{data && <span>{id ? data.counts[id] : total}</span>}
              </button>
            ))}
          </div>
          <select className="input afs-method" aria-label="How it was filled in" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="">Online and paper</option>
            <option value="online">Filled in online</option>
            <option value="upload">Scanned paper form</option>
          </select>
        </div>
        {!data ? <p className="muted afs-pad">Loading…</p> : data.results.length === 0 ? (
          <div className="afs-empty"><i className="fas fa-file-signature" aria-hidden="true" />
            <p>{state || method || search ? 'No forms match.' : 'No forms yet. A student’s form appears here as soon as you confirm their payment.'}</p></div>
        ) : (
          <div className="table-scroll">
            <table className="table afs-table">
              <thead><tr><th>Student</th><th>Scholarship</th><th>Status</th><th>How</th><th>Dates</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {data.results.map((r) => (
                  <tr key={r.application_id}>
                    <td><strong>{r.student.name}</strong><small>{r.student.email}</small></td>
                    <td><span className="afs-scholarship">{r.scholarship_name}</span><small>{r.reference}</small></td>
                    <td><span className={`badge ${STATE_BADGE[r.state][0]}`}>{STATE_BADGE[r.state][1]}</span>
                      {r.state === 'draft' && <small>{r.progress.answered}/{r.progress.required} answered</small>}</td>
                    <td>{r.method === 'upload' ? <span className="afs-how"><i className="fas fa-file-signature" /> Paper · {r.files} file{r.files === 1 ? '' : 's'}</span>
                      : r.method === 'online' ? <span className="afs-how"><i className="fas fa-laptop" /> Online</span> : <span className="muted">—</span>}</td>
                    <td><small>Paid {formatDateTime(r.paid_at)}</small>
                      {r.submitted_at && <small>Submitted {formatDateTime(r.submitted_at)}</small>}
                      {!r.submitted_at && r.reminded_at && <small>Reminded {formatDateTime(r.reminded_at)}</small>}</td>
                    <td className="afs-actions">
                      {['not_started', 'draft'].includes(r.state) && (
                        <button type="button" className="btn btn--text btn--sm" disabled={busy === r.application_id} onClick={() => remind(r)}><i className="fas fa-bell" /> Remind</button>
                      )}
                      <Link to={`/admin/applications/${r.application_id}/form`} target="_blank" className="btn btn--outline btn--sm">{r.state === 'submitted' ? 'Review' : 'Open'}</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

/** Admin → Application forms: the students' forms (submissions) and the form itself (designer). */
export const AdminApplicationFormPage = () => {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'designer' ? 'designer' : 'submissions';
  return (
    <PortalLayout title="Application forms" subtitle="Students fill in this form, online or on paper, after you confirm their payment for “ADRAM applies for you”.">
      <div className="tabs afs-tabs" role="tablist" aria-label="Application forms">
        <button type="button" role="tab" aria-selected={tab === 'submissions'} className={`tabs__tab${tab === 'submissions' ? ' is-active' : ''}`} onClick={() => setParams({})}>
          <i className="fas fa-inbox" aria-hidden="true" /> Submissions
        </button>
        <button type="button" role="tab" aria-selected={tab === 'designer'} className={`tabs__tab${tab === 'designer' ? ' is-active' : ''}`} onClick={() => setParams({ tab: 'designer' })}>
          <i className="fas fa-pen-ruler" aria-hidden="true" /> Form designer
        </button>
      </div>
      {tab === 'submissions' ? <Submissions /> : <FormDesigner />}
    </PortalLayout>
  );
};

export default AdminApplicationFormPage;

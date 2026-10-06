import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { confirmToast } from '../../components/ui/confirmToast';
import PortalLayout from '../../components/layout/PortalLayout';
import { IconField, ImageField } from '../../components/admin/contentFields';
import { usePageContent } from '../../content/useContent';
import { learningAPI } from '../../services/api';
import { KIND_ICONS, levelList } from '../../components/learning/levels';
import { DownloadPdfButton } from '../../components/learning/DownloadPdfButton';

const slugify = (text) => text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s-]/g, '').trim().replace(/[\s-]+/g, '-').slice(0, 80);
const SETTINGS = ['name', 'slug', 'icon', 'summary', 'description', 'cover', 'is_published'];
const pick = (f) => Object.fromEntries(SETTINGS.map((k) => [k, f[k] ?? '']));

/** One topic in the curriculum: rename it, move it, and manage the notes inside. */
const TopicCard = ({ topic, index, siblings, levels, fieldId, onChanged }) => {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ title: topic.title, summary: topic.summary });
  const save = async (patch) => {
    try { await learningAPI.updateTopic(topic.id, patch); onChanged(); setEditing(false); }
    catch (err) { toast.error(err.response?.data?.detail || 'Could not save.'); }
  };
  const move = async (by) => {
    const ids = siblings.map((t) => t.id);
    [ids[index], ids[index + by]] = [ids[index + by], ids[index]];
    await learningAPI.reorderTopics(ids);
    onChanged();
  };
  const moveNote = async (i, by) => {
    const ids = topic.notes.map((n) => n.id);
    [ids[i], ids[i + by]] = [ids[i + by], ids[i]];
    await learningAPI.reorderNotes(ids);
    onChanged();
  };
  const remove = async () => {
    if (topic.notes.length) { toast.error('Move or delete this topic’s notes first.'); return; }
    if (!window.confirm(`Delete the topic “${topic.title}”?`)) return;
    await learningAPI.removeTopic(topic.id);
    onChanged();
  };
  return (
    <div className="lha-topic">
      <div className="lha-topic__head">
        {editing ? (
          <form className="lha-topic__form" onSubmit={(e) => { e.preventDefault(); save(form); }}>
            <input className="input" value={form.title} maxLength={120} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} aria-label="Topic title" autoFocus />
            <input className="input" value={form.summary} maxLength={300} placeholder="One line about this topic (optional)" onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))} aria-label="Topic summary" />
            <span className="lha-topic__form-actions">
              <button type="submit" className="btn btn--primary btn--sm" disabled={!form.title.trim()}>Save</button>
              <button type="button" className="btn btn--text btn--sm" onClick={() => { setEditing(false); setForm({ title: topic.title, summary: topic.summary }); }}>Cancel</button>
            </span>
          </form>
        ) : (
          <div className="lha-topic__title">
            <strong>{topic.title}</strong>
            {topic.summary && <small>{topic.summary}</small>}
          </div>
        )}
        {!editing && (
          <span className="lha-tools">
            <select className="input lha-level-select" value={topic.level} aria-label={`Level of ${topic.title}`} onChange={(e) => save({ level: Number(e.target.value) })}>
              {levels.map((l) => <option key={l.level} value={l.level}>{l.level}. {l.name}</option>)}
            </select>
            <button type="button" className="icon-btn" disabled={index === 0} onClick={() => move(-1)} aria-label={`Move ${topic.title} up`} title="Move up"><i className="fas fa-arrow-up" /></button>
            <button type="button" className="icon-btn" disabled={index === siblings.length - 1} onClick={() => move(1)} aria-label={`Move ${topic.title} down`} title="Move down"><i className="fas fa-arrow-down" /></button>
            <button type="button" className="icon-btn" onClick={() => setEditing(true)} aria-label={`Rename ${topic.title}`} title="Rename"><i className="fas fa-pen" /></button>
            <button type="button" className="icon-btn lha-danger" onClick={remove} aria-label={`Delete ${topic.title}`} title="Delete"><i className="fas fa-trash-can" /></button>
          </span>
        )}
      </div>
      {topic.notes.length > 0 && (
        <ul className="lha-notes">
          {topic.notes.map((n, i) => (
            <li key={n.id}>
              <Link to={`/admin/learning/notes/${n.id}`} className="lha-note">
                <i className={`fas ${KIND_ICONS[n.kind] || KIND_ICONS.note}`} aria-hidden="true" />
                <span>{n.title}</span>
                <small>{n.minutes} min</small>
                <span className={`badge ${n.is_published ? 'badge--green' : 'badge--gray'}`}>{n.is_published ? 'Published' : 'Draft'}</span>
              </Link>
              <span className="lha-tools">
                <button type="button" className="icon-btn" disabled={i === 0} onClick={() => moveNote(i, -1)} aria-label={`Move ${n.title} up`}><i className="fas fa-arrow-up" /></button>
                <button type="button" className="icon-btn" disabled={i === topic.notes.length - 1} onClick={() => moveNote(i, 1)} aria-label={`Move ${n.title} down`}><i className="fas fa-arrow-down" /></button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="btn btn--text btn--sm lha-add-note" onClick={() => navigate(`/admin/learning/notes/new?field=${fieldId}&topic=${topic.id}`)}>
        <i className="fas fa-plus" /> Add a note to this topic
      </button>
    </div>
  );
};

/** A box at the end of each level to add a topic there. */
const AddTopic = ({ fieldId, level, onChanged }) => {
  const [title, setTitle] = useState('');
  const add = async (e) => {
    e.preventDefault();
    try { await learningAPI.createTopic({ field: fieldId, level, title }); setTitle(''); onChanged(); }
    catch (err) { toast.error(err.response?.data?.detail || 'Could not add the topic.'); }
  };
  return (
    <form className="lha-add-topic" onSubmit={add}>
      <input className="input" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="New topic at this level, e.g. IP addressing & subnetting" aria-label={`New topic at level ${level}`} />
      <button type="submit" className="btn btn--outline btn--sm" disabled={!title.trim()}><i className="fas fa-plus" /> Add topic</button>
    </form>
  );
};

/** Admin → Learning hub → a field: its curriculum, level by level, and its settings. */
export const AdminLearningFieldPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const content = usePageContent('learning');
  const levels = levelList(content);
  const [field, setField] = useState(undefined);
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const adopt = useCallback((data, keepForm = false) => {
    setField(data);
    if (!keepForm) { const f = pick(data); setForm(f); setSaved(JSON.stringify(f)); }
  }, []);
  const load = useCallback(() => learningAPI.manageField(id).then(({ data }) => adopt(data, true)).catch(() => setField(false)), [id, adopt]);
  useEffect(() => { learningAPI.manageField(id).then(({ data }) => adopt(data)).catch(() => setField(false)); }, [id, adopt]);

  if (field === false) return <PortalLayout title="Field"><div className="card panel"><p>This field doesn’t exist. <Link to="/admin/learning">Back to the Learning hub</Link></p></div></PortalLayout>;
  if (!field || !form) return <PortalLayout title="Field"><div className="card panel"><p className="muted">Loading…</p></div></PortalLayout>;

  const dirty = JSON.stringify(form) !== saved;
  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };
  const save = async (patch = {}, message = 'Saved.') => {
    setBusy(true);
    try {
      const { data } = await learningAPI.updateField(field.id, { ...form, ...patch });
      adopt(data);
      if (data.is_published && data.published_notes === 0) toast('Saved. The field will appear once at least one of its notes is published.', { icon: 'ℹ️' });
      else toast.success(message);
    } catch (err) {
      setErrors(err.response?.data?.errors || {});
      toast.error(err.response?.data?.detail || 'Could not save.');
    } finally {
      setBusy(false);
    }
  };
  const byLevel = (level) => field.curriculum.filter((t) => t.level === level);
  const drafts = field.notes - field.published_notes;
  const publishAll = async (publish) => {
    const ok = await confirmToast(
      publish
        ? `Visitors will be able to read all ${drafts} note${drafts === 1 ? '' : 's'} in ${field.name} straight away.`
        : `Visitors will no longer see the ${field.published_notes} published note${field.published_notes === 1 ? '' : 's'} in ${field.name}.`,
      publish
        ? { title: `Publish ${drafts} draft${drafts === 1 ? '' : 's'}?`, confirmLabel: 'Publish', icon: 'fa-paper-plane' }
        : { title: 'Unpublish all notes?', confirmLabel: 'Unpublish', tone: 'danger', icon: 'fa-eye-slash' },
    );
    if (!ok) return;
    try {
      const { data } = await learningAPI.publishNotes(field.id, publish);
      adopt(data, true);
      toast.success(publish ? `${data.changed} note(s) published.` : `${data.changed} note(s) moved to drafts.`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not update the notes.');
    }
  };

  return (
    <PortalLayout title={field.name} subtitle="Build the curriculum level by level: add topics, then write the notes inside each topic.">
      <div className="be-top">
        <Link to="/admin/learning" className="btn btn--text btn--sm"><i className="fas fa-arrow-left" /> All fields</Link>
        <span className={`badge ${field.is_published ? 'badge--green' : 'badge--gray'}`}>{field.is_published ? 'Published' : 'Hidden'}</span>
        <span className="muted small">{field.topics} topics · {field.published_notes} of {field.notes} notes published</span>
        <span className="be-top__spacer" />
        <a href={`/learning/${field.slug}`} target="_blank" rel="noreferrer" className="btn btn--outline btn--sm">
          <i className="fas fa-arrow-up-right-from-square" /> {field.is_published ? 'View field' : 'Preview'}
        </a>
      </div>

      {field.is_published && field.published_notes === 0 && (
        <div className="cba-notice lha-notice" role="alert">
          <i className="fas fa-eye-slash" aria-hidden="true" />
          <div>
            <strong>Visitors can’t see this field yet.</strong>
            <p>The field is published, but none of its notes are. A field only appears on the Learning hub once at least one of its notes is published.</p>
          </div>
        </div>
      )}
      {field.notes > 0 && (
        <div className="lha-bulk">
          <span>{field.published_notes} of {field.notes} notes published{drafts > 0 ? ` · ${drafts} draft${drafts === 1 ? '' : 's'}` : ''}</span>
          {drafts > 0 && <button type="button" className="btn btn--primary btn--sm" onClick={() => publishAll(true)}><i className="fas fa-paper-plane" /> Publish all {drafts} draft{drafts === 1 ? '' : 's'}</button>}
          {field.published_notes > 0 && <button type="button" className="btn btn--text btn--sm" onClick={() => publishAll(false)}>Unpublish all</button>}
          {field.published_notes > 0 && <DownloadPdfButton slug={field.slug} name={field.name} className="btn btn--outline btn--sm" label="PDF" />}
          {drafts > 0 && <DownloadPdfButton slug={field.slug} name={field.name} drafts className="btn btn--outline btn--sm" label="PDF with drafts" />}
        </div>
      )}

      <div className="be-grid">
        <div className="be-main">
          {levels.map((l) => {
            const topics = byLevel(l.level);
            return (
              <section key={l.level} className="card panel lha-level">
                <div className="lha-level__head">
                  <span className="lha-level__num">{l.level}</span>
                  <div>
                    <h2 className="h3">{l.name}</h2>
                    {l.text && <p className="muted small">{l.text}</p>}
                  </div>
                  <span className="lha-level__count">{topics.length} topic{topics.length === 1 ? '' : 's'}</span>
                </div>
                {topics.map((t, i) => (
                  <TopicCard key={`${t.id}-${t.title}-${t.summary}-${t.level}`} topic={t} index={i} siblings={topics} levels={levels} fieldId={field.id} onChanged={load} />
                ))}
                <AddTopic fieldId={field.id} level={l.level} onChanged={load} />
              </section>
            );
          })}
        </div>

        <aside className="be-side">
          <section className="card panel be-box">
            <h2 className="be-box__title">Field settings</h2>
            <label className="field"><span className="field__label">Name</span>
              <input className="input" value={form.name} maxLength={80} aria-invalid={Boolean(errors.name)} onChange={(e) => set('name', e.target.value)} />
              {errors.name && <small className="pja-error">{errors.name}</small>}
            </label>
            <label className="field"><span className="field__label">Summary</span>
              <textarea className="input" rows={3} maxLength={300} value={form.summary} placeholder="One or two sentences for the field card" onChange={(e) => set('summary', e.target.value)} />
            </label>
            <label className="field"><span className="field__label">About this field (optional)</span>
              <textarea className="input" rows={5} maxLength={6000} value={form.description} placeholder="Who it is for, what learners will be able to do, what they need before starting…" onChange={(e) => set('description', e.target.value)} />
              <small className="hint">Shown above the roadmap. **Bold**, lists and links work.</small>
            </label>
            <IconField field={{ label: 'Icon' }} value={form.icon} onChange={(v) => set('icon', v)} id="lha-icon" />
            <ImageField field={{ label: 'Banner photo (optional)' }} value={form.cover} onChange={(v) => set('cover', v)} id="lha-cover" />
            {errors.cover && <small className="pja-error">{errors.cover}</small>}
            <div className="field"><span className="field__label">Page address</span>
              <div className="be-slug"><span>/learning/</span>
                <input className="input" value={form.slug} maxLength={80} aria-label="Page address" onChange={(e) => set('slug', slugify(e.target.value))} />
              </div>
              {errors.slug && <small className="pja-error">{errors.slug}</small>}
            </div>
            <label className="checkbox">
              <input type="checkbox" checked={Boolean(form.is_published)} onChange={(e) => set('is_published', e.target.checked)} />
              <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span>
              <span>Show on the Learning hub<small>Only its published notes are shown. A field with no published notes stays hidden.</small></span>
            </label>
            <div className="be-actions">
              <button type="button" className="btn btn--primary btn--sm" disabled={!dirty || busy} onClick={() => save()}>{busy && <span className="btn-spinner" />} Save settings</button>
            </div>
          </section>
          <button type="button" className="btn btn--text btn--sm pja-danger be-delete" onClick={async () => {
            if (!window.confirm(`Delete “${field.name}” with all its topics and notes? This can’t be undone.`)) return;
            await learningAPI.removeField(field.id);
            toast.success('Field deleted.');
            navigate('/admin/learning');
          }}><i className="fas fa-trash-can" /> Delete field</button>
        </aside>
      </div>
    </PortalLayout>
  );
};

export default AdminLearningFieldPage;

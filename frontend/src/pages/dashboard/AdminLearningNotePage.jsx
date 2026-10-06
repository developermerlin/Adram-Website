import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import PortalLayout from '../../components/layout/PortalLayout';
import { InsertCodeDialog, InsertImageDialog } from '../../components/admin/InsertDialogs';
import { PreviewWithInserts } from '../../components/admin/PreviewWithInserts';
import { insertBlockAt } from '../../utils/markdown';
import { usePageContent } from '../../content/useContent';
import { learningAPI } from '../../services/api';
import { formatDateTime } from '../../utils/format';
import { levelList, RESOURCE_ICONS } from '../../components/learning/levels';

const BLANK = { title: '', slug: '', kind: 'note', summary: '', objectives: [], body: '', resources: [], topic: '', is_published: false };
const toForm = (n) => ({ ...BLANK, ...Object.fromEntries(Object.keys(BLANK).map((k) => [k, n[k] ?? BLANK[k]])) });
const slugify = (text) => text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s-]/g, '').trim().replace(/[\s-]+/g, '-').slice(0, 120);
const readingMinutes = (text) => Math.max(1, Math.round(text.split(/\s+/).filter(Boolean).length / 200));

const TOOLS = [
  ['fa-heading', 'Section heading', { line: '## ' }],
  ['fa-h', 'Smaller heading', { line: '### ' }],
  ['fa-bold', 'Bold', { wrap: ['**', '**', 'bold text'] }],
  ['fa-italic', 'Italic', { wrap: ['*', '*', 'italic text'] }],
  ['fa-terminal', 'Inline code, e.g. a command name', { wrap: ['`', '`', 'ping'] }],
  ['fa-link', 'Link', { wrap: ['[', '](https://)', 'link text'] }],
  ['fa-list-ul', 'Bullet list', { line: '- ' }],
  ['fa-list-ol', 'Numbered list', { line: '1. ' }],
  ['fa-table', 'Table', { insert: '\n| Column | Column |\n|---|---|\n| Value | Value |\n' }],
  ['fa-lightbulb', 'Tip box', { insert: '\n> [!TIP] A helpful tip.\n' }],
  ['fa-circle-info', 'Note box', { insert: '\n> [!NOTE] Something worth knowing.\n' }],
  ['fa-triangle-exclamation', 'Warning box', { insert: '\n> [!WARNING] A common mistake to avoid.\n' }],
  ['fa-quote-left', 'Quote', { line: '> ' }],
  ['fa-minus', 'Divider', { insert: '\n---\n' }],
];

/** Admin → Learning hub → a note: the text, what learners will get from it, and resources to go further. */
export const AdminLearningNotePage = () => {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const levels = levelList(usePageContent('learning'));
  const isNew = !id || id === 'new';
  const [note, setNote] = useState(isNew ? null : undefined);
  const [fieldInfo, setFieldInfo] = useState(null); // the field and its topics, for the topic picker
  const [form, setForm] = useState({ ...BLANK, topic: Number(params.get('topic')) || '' });
  const [saved, setSaved] = useState(JSON.stringify({ ...BLANK, topic: Number(params.get('topic')) || '' }));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState('');
  const [mode, setMode] = useState('write');
  // { kind: 'code' | 'image' | 'diagram', at: position in the text, or null for the cursor } while its window is open
  const [inserting, setInserting] = useState(null);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [uploading, setUploading] = useState(null);
  const body = useRef(null);

  useEffect(() => {
    if (isNew) {
      const fid = params.get('field');
      if (fid) learningAPI.manageField(fid).then(({ data }) => setFieldInfo(data)).catch(() => setFieldInfo(false));
      return;
    }
    learningAPI.manageNote(id).then(({ data }) => {
      const f = toForm(data);
      setNote(data);
      setForm(f);
      setSaved(JSON.stringify(f));
      learningAPI.manageField(data.field.id).then(({ data: fd }) => setFieldInfo(fd)).catch(() => {});
    }).catch(() => setNote(false));
  }, [id, isNew, params]);

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
  const format = ({ wrap, line, insert }) => {
    const el = body.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e, value } = el;
    let next;
    let caret;
    if (wrap) {
      const chosen = value.slice(s, e) || wrap[2];
      next = value.slice(0, s) + wrap[0] + chosen + wrap[1] + value.slice(e);
      caret = [s + wrap[0].length, s + wrap[0].length + chosen.length];
    } else if (line) {
      const start = value.lastIndexOf('\n', s - 1) + 1;
      const block = value.slice(start, e) || '';
      const marked = block.split('\n').map((l, i) => (line === '1. ' ? `${i + 1}. ` : line) + l.replace(/^(#{1,4}\s|[-*]\s|\d+\.\s|>\s?)/, '')).join('\n');
      next = value.slice(0, start) + marked + value.slice(e);
      caret = [start + marked.length, start + marked.length];
    } else {
      next = value.slice(0, s) + insert + value.slice(e);
      caret = [s + insert.length, s + insert.length];
    }
    set('body', next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(...caret); });
  };
  // a picture or code from an insert window: at the + that was clicked in Preview, or at the cursor in Write
  const place = (text) => {
    const at = inserting?.at;
    setInserting(null);
    if (at === null || at === undefined) format({ insert: text });
    else set('body', insertBlockAt(form.body, at, text));
  };
  const setRow = (key, i, patch) => set(key, form[key].map((r, n) => (n === i ? (typeof r === 'string' ? patch : { ...r, ...patch }) : r)));
  const dropRow = (key, i) => set(key, form[key].filter((_, n) => n !== i));
  const upload = async (i, file) => {
    if (!file) return;
    setUploading(i);
    try {
      const { data } = await learningAPI.upload(file);
      setRow('resources', i, { url: data.url, kind: 'file', title: form.resources[i].title || data.name.replace(/\.[^.]+$/, '') });
      toast.success('File uploaded.');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Upload failed.');
    } finally {
      setUploading(null);
    }
  };

  const save = async (patch = {}, message = 'Saved.') => {
    const payload = { ...form, ...patch };
    setBusy(Object.prototype.hasOwnProperty.call(patch, 'is_published') ? (patch.is_published ? 'publish' : 'draft') : 'save');
    try {
      const { data } = note ? await learningAPI.updateNote(note.id, payload) : await learningAPI.createNote(payload);
      const f = toForm(data);
      setNote(data);
      setForm(f);
      setSaved(JSON.stringify(f));
      setSlugTouched(true);
      toast.success(message);
      if (!note) navigate(`/admin/learning/notes/${data.id}`, { replace: true });
    } catch (err) {
      const errs = err.response?.data?.errors || {};
      setErrors(errs);
      toast.error(err.response?.data?.detail || Object.values(errs)[0] || 'Please check the highlighted fields.');
    } finally {
      setBusy('');
    }
  };

  if (note === undefined) return <PortalLayout title="Note"><div className="card panel"><p className="muted">Loading…</p></div></PortalLayout>;
  if (note === false || fieldInfo === false) return <PortalLayout title="Note"><div className="card panel"><p>This note (or its field) doesn’t exist. <Link to="/admin/learning">Back to the Learning hub</Link></p></div></PortalLayout>;

  const live = note?.is_published;
  const fieldId = note?.field.id || fieldInfo?.id;
  const fieldSlug = note?.field.slug || fieldInfo?.slug;
  const words = form.body.split(/\s+/).filter(Boolean).length;
  const err = (k) => errors[k] && <small className="pja-error">{errors[k]}</small>;

  return (
    <PortalLayout title={isNew ? 'New note' : 'Edit note'}>
      <div className="be-top">
        {fieldId && <Link to={`/admin/learning/${fieldId}`} className="btn btn--text btn--sm"><i className="fas fa-arrow-left" /> {fieldInfo?.name || note?.field.name}</Link>}
        <span className={`badge ${live ? 'badge--green' : 'badge--gray'}`}>{live ? 'Published' : 'Draft'}</span>
        {dirty && <span className="be-unsaved"><i className="fas fa-circle" /> Unsaved changes</span>}
        <span className="be-top__spacer" />
        {note && fieldSlug && (
          <a href={`/learning/${fieldSlug}/${note.slug}`} target="_blank" rel="noreferrer" className="btn btn--outline btn--sm">
            <i className="fas fa-arrow-up-right-from-square" /> {live ? 'View note' : 'Preview'}
          </a>
        )}
      </div>

      <div className="be-grid">
        <div className="be-main">
          <section className="card be-writer">
            <textarea className="be-title" rows={1} placeholder="Note title, e.g. What is an IP address?" value={form.title} maxLength={160} aria-label="Title"
              aria-invalid={Boolean(errors.title)} onChange={(e) => setTitle(e.target.value)} />
            {err('title')}
            <textarea className="be-excerpt" rows={2} placeholder="A one or two sentence summary, shown in the roadmap and in search" value={form.summary} maxLength={300}
              aria-label="Summary" onChange={(e) => set('summary', e.target.value)} />
          </section>

          <section className="card panel be-box">
            <div className="pja-box-head">
              <h2 className="be-box__title">What learners will learn</h2>
              <button type="button" className="btn btn--outline btn--sm" disabled={form.objectives.length >= 12} onClick={() => set('objectives', [...form.objectives, ''])}>
                <i className="fas fa-plus" /> Add an objective
              </button>
            </div>
            <p className="muted small pja-lead">Short goals, each starting with a verb: “Explain what an IP address is”, “Configure a static IP on Windows”.</p>
            {form.objectives.length > 0 && (
              <ul className="pja-rows">
                {form.objectives.map((o, i) => (
                  <li key={i} className="lha-objective">
                    <i className="fas fa-bullseye" aria-hidden="true" />
                    <input className="input" value={o} maxLength={200} onChange={(e) => setRow('objectives', i, e.target.value)} aria-label={`Objective ${i + 1}`} />
                    <button type="button" className="icon-btn pja-danger" onClick={() => dropRow('objectives', i)} aria-label={`Remove objective ${i + 1}`}><i className="fas fa-xmark" /></button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card be-writer lha-writer">
            <div className="be-toolbar" role="toolbar" aria-label="Formatting">
              <div className="be-modes" role="tablist">
                <button type="button" role="tab" aria-selected={mode === 'write'} className={mode === 'write' ? 'is-active' : ''} onClick={() => setMode('write')}>Write</button>
                <button type="button" role="tab" aria-selected={mode === 'preview'} className={mode === 'preview' ? 'is-active' : ''} onClick={() => setMode('preview')}>Preview</button>
              </div>
              {mode === 'write' && (
                <div className="be-tools">
                  {TOOLS.map(([icon, label, action]) => (
                    <button key={label} type="button" title={label} aria-label={label} onClick={() => format(action)}><i className={`fas ${icon}`} /></button>
                  ))}
                  <span className="lha-insert">
                    <button type="button" onClick={() => setInserting({ kind: 'code', at: null })}><i className="fas fa-code" /> Insert code</button>
                    <button type="button" onClick={() => setInserting({ kind: 'image', at: null })}><i className="fas fa-image" /> Insert picture</button>
                  </span>
                </div>
              )}
            </div>
            {mode === 'write' ? (
              <textarea ref={body} className="be-body" value={form.body} aria-label="The note" aria-invalid={Boolean(errors.body)} onChange={(e) => set('body', e.target.value)}
                placeholder={'Write the note here.\n\n## A section heading\n\nExplain the idea in plain words, then show it:\n\n```bash\nipconfig /all\n```\n\n> [!TIP] Callout boxes highlight tips, notes and warnings.\n\nA YouTube link on its own line becomes a video.'} />
            ) : (
              <div className="be-preview prose">
                <p className="bi-hint"><i className="fas fa-circle-plus" aria-hidden="true" /> Click <strong>+</strong> between paragraphs to add a picture, a diagram or code exactly there.</p>
                <PreviewWithInserts source={form.body} onPick={(at, kind) => setInserting({ kind, at })} />
              </div>
            )}
            {err('body')}
            <div className="be-stats">{words} words · {readingMinutes(form.body)} min read</div>
          </section>

          <section className="card panel be-box">
            <div className="pja-box-head">
              <h2 className="be-box__title">Resources</h2>
              <button type="button" className="btn btn--outline btn--sm" disabled={form.resources.length >= 20} onClick={() => set('resources', [...form.resources, { kind: 'link', title: '', url: '' }])}>
                <i className="fas fa-plus" /> Add a resource
              </button>
            </div>
            <p className="muted small pja-lead">Links to read further, videos, and files to download (PDF, Word, PowerPoint, Excel, ZIP or Packet Tracer, up to 25 MB).</p>
            {form.resources.length > 0 && (
              <ul className="pja-rows">
                {form.resources.map((r, i) => (
                  <li key={i} className="lha-resource">
                    <span className={`lh-resources__icon lh-resources__icon--${r.kind}`}><i className={`fas ${RESOURCE_ICONS[r.kind] || RESOURCE_ICONS.link}`} aria-hidden="true" /></span>
                    <select className="input" value={r.kind} onChange={(e) => setRow('resources', i, { kind: e.target.value })} aria-label={`Resource ${i + 1} type`}>
                      <option value="link">Link</option><option value="video">Video</option><option value="file">File</option>
                    </select>
                    <input className="input" value={r.title} maxLength={150} placeholder="Title, e.g. Subnetting cheat sheet" onChange={(e) => setRow('resources', i, { title: e.target.value })} aria-label={`Resource ${i + 1} title`} />
                    <input className="input" value={r.url} maxLength={500} placeholder="https://…" onChange={(e) => setRow('resources', i, { url: e.target.value })} aria-label={`Resource ${i + 1} address`} />
                    <span className="lha-resource__tools">
                      <label className="btn btn--outline btn--sm lha-upload" title="Upload a file">
                        {uploading === i ? <span className="btn-spinner" /> : <i className="fas fa-upload" />} Upload
                        <input type="file" className="sr-only" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv,.zip,.pkt,.png,.jpg,.jpeg" onChange={(e) => upload(i, e.target.files?.[0])} />
                      </label>
                      <button type="button" className="icon-btn pja-danger" onClick={() => dropRow('resources', i)} aria-label={`Remove resource ${i + 1}`}><i className="fas fa-trash-can" /></button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {err('resources')}
          </section>
        </div>

        <aside className="be-side">
          <section className="card panel be-box">
            <h2 className="be-box__title">Publish</h2>
            <div className="be-actions">
              {!live ? (
                <>
                  <button type="button" className="btn btn--outline btn--sm" disabled={Boolean(busy)} onClick={() => save({ is_published: false }, 'Draft saved.')}>
                    {busy === 'draft' && <span className="btn-spinner" />} Save draft
                  </button>
                  <button type="button" className="btn btn--primary btn--sm" disabled={Boolean(busy)} onClick={() => save({ is_published: true }, 'Note published.')}>
                    {busy === 'publish' ? <span className="btn-spinner" /> : <i className="fas fa-paper-plane" />} Publish
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="btn btn--primary btn--sm" disabled={Boolean(busy) || !dirty} onClick={() => save({}, 'Note updated.')}>
                    {busy === 'save' && <span className="btn-spinner" />} Update
                  </button>
                  <button type="button" className="btn btn--outline btn--sm" disabled={Boolean(busy)} onClick={() => save({ is_published: false }, 'Moved back to drafts.')}>Unpublish</button>
                </>
              )}
            </div>
            {note && <p className="be-meta">Created {formatDateTime(note.created_at)} · last saved {formatDateTime(note.updated_at)}</p>}
          </section>

          <section className="card panel be-box">
            <h2 className="be-box__title">Where it goes</h2>
            <label className="field"><span className="field__label">Topic</span>
              <select className="input" value={form.topic} aria-invalid={Boolean(errors.topic)} onChange={(e) => set('topic', Number(e.target.value) || '')}>
                <option value="">Choose a topic</option>
                {levels.map((l) => {
                  const topics = (fieldInfo?.curriculum || []).filter((t) => t.level === l.level);
                  return topics.length > 0 && (
                    <optgroup key={l.level} label={`${l.level}. ${l.name}`}>
                      {topics.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                    </optgroup>
                  );
                })}
              </select>
              <small className="hint">The topic decides the level. Add topics on the field’s page.</small>
              {err('topic')}
            </label>
            <label className="field"><span className="field__label">Type</span>
              <select className="input" value={form.kind} onChange={(e) => set('kind', e.target.value)}>
                <option value="note">Note</option>
                <option value="research">Research note</option>
                <option value="lab">Hands-on lab</option>
                <option value="cheatsheet">Cheat sheet</option>
              </select>
            </label>
          </section>

          <section className="card panel be-box">
            <h2 className="be-box__title">Page address</h2>
            <div className="be-slug"><span>/{fieldSlug || 'field'}/</span>
              <input className="input" value={form.slug} maxLength={120} aria-label="Page address" placeholder="made-from-the-title"
                onChange={(e) => { setSlugTouched(true); set('slug', slugify(e.target.value)); }} />
            </div>
            {err('slug')}
          </section>

          {note && (
            <button type="button" className="btn btn--text btn--sm pja-danger be-delete" onClick={async () => {
              if (!window.confirm('Delete this note? This can’t be undone.')) return;
              await learningAPI.removeNote(note.id);
              setSaved(JSON.stringify(form));
              toast.success('Note deleted.');
              navigate(`/admin/learning/${note.field.id}`);
            }}><i className="fas fa-trash-can" /> Delete note</button>
          )}
        </aside>
      </div>
      {inserting?.kind === 'code' && <InsertCodeDialog onClose={() => setInserting(null)} onInsert={place} />}
      {(inserting?.kind === 'image' || inserting?.kind === 'diagram') && (
        <InsertImageDialog diagram={inserting.kind === 'diagram'} onClose={() => setInserting(null)} onInsert={place} />
      )}
    </PortalLayout>
  );
};

export default AdminLearningNotePage;

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { catalogAPI, lmsAdminAPI, parseApiErrors } from '../../services/api';
import { formatDateTime } from '../../utils/format';
import PortalLayout from '../../components/layout/PortalLayout';
import { Alert } from '../../components/ui/Form';
import '../../styles/campaigns.css';

const BLANK = { name: '', subject: '', title: '', body: '', button_label: '', button_link: '', notify_in_app: true, rules: {} };
const TONE = { draft: 'badge--gray', sending: 'badge--amber', sent: 'badge--green' };

/** Picks courses for a rule (a compact list of checkboxes). */
const CoursePick = ({ label, courses, value = [], onChange }) => (
  <details className="cp-pick">
    <summary>{label}{value.length ? ` (${value.length})` : ''}</summary>
    <div className="cp-pick__list">
      {courses.map((c) => (
        <label key={c.slug}><input type="checkbox" checked={value.includes(c.slug)}
          onChange={() => onChange(value.includes(c.slug) ? value.filter((s) => s !== c.slug) : [...value, c.slug])} /> {c.title}</label>
      ))}
    </div>
  </details>
);

/** Who receives it: every rule must match. */
const AudienceBuilder = ({ rules, onChange, courses }) => {
  const set = (key, value) => {
    const next = { ...rules, [key]: value };
    if (value === '' || value === false || value === 0 || (Array.isArray(value) && !value.length)) delete next[key];
    onChange(next);
  };
  const roles = rules.roles || ['STUDENT'];
  return (
    <div className="cp-rules">
      <div className="cp-rules__row">
        <label>Who
          <select className="input" value={roles.join(',')} onChange={(e) => set('roles', e.target.value === 'STUDENT' ? [] : e.target.value.split(','))}>
            <option value="STUDENT">Students</option>
            <option value="INSTRUCTOR">Instructors</option>
            <option value="STUDENT,INSTRUCTOR">Students and instructors</option>
          </select>
        </label>
        <label>Side
          <select className="input" value={rules.track || ''} onChange={(e) => set('track', e.target.value)}>
            <option value="">Any</option><option value="training">Training</option><option value="scholarships">Scholarships</option>
          </select>
        </label>
        <label>Has bought a course
          <select className="input" value={rules.purchased || ''} onChange={(e) => set('purchased', e.target.value)}>
            <option value="">Either</option><option value="yes">Yes</option><option value="no">Not yet</option>
          </select>
        </label>
        <label>Country
          <input className="input" value={rules.country || ''} placeholder="Any" onChange={(e) => set('country', e.target.value)} />
        </label>
      </div>
      <div className="cp-rules__row">
        <label>Inactive for at least (days)
          <input className="input" type="number" min="0" value={rules.inactive_days || ''} placeholder="—" onChange={(e) => set('inactive_days', Number(e.target.value) || 0)} />
        </label>
        <label>Joined in the last (days)
          <input className="input" type="number" min="0" value={rules.joined_within_days || ''} placeholder="—" onChange={(e) => set('joined_within_days', Number(e.target.value) || 0)} />
        </label>
        <label className="cp-check"><input type="checkbox" checked={Boolean(rules.cart_not_empty)} onChange={(e) => set('cart_not_empty', e.target.checked)} /> Courses waiting in their cart</label>
        <label className="cp-check"><input type="checkbox" checked={Boolean(rules.completed_any)} onChange={(e) => set('completed_any', e.target.checked)} /> Finished a course</label>
      </div>
      <div className="cp-rules__row cp-rules__row--picks">
        <CoursePick label="Enrolled in any of" courses={courses} value={rules.enrolled_in} onChange={(v) => set('enrolled_in', v)} />
        <CoursePick label="Not enrolled in" courses={courses} value={rules.not_enrolled_in} onChange={(v) => set('not_enrolled_in', v)} />
        <CoursePick label="Saved to wishlist" courses={courses} value={rules.wishlisted} onChange={(v) => set('wishlisted', v)} />
      </div>
    </div>
  );
};

/** How the email will read (for an example name). */
const EmailPreview = ({ form }) => {
  const name = 'Aminata';
  const fill = (t) => (t || '').replaceAll('{first_name}', name);
  return (
    <div className="cp-preview" aria-label="Email preview">
      <p className="cp-preview__subject"><strong>{fill(form.subject) || 'Subject'}</strong></p>
      <div className="cp-preview__mail">
        <span className="cp-preview__pill">News from ADRAM</span>
        <h3>{fill(form.title || form.subject) || 'Heading'}</h3>
        {(form.body || 'Your message…').split('\n\n').map((p, i) => <p key={i}>{fill(p)}</p>)}
        {form.button_label && <span className="cp-preview__btn">{form.button_label}</span>}
        <small>Unsubscribe from these emails</small>
      </div>
    </div>
  );
};

/** /admin/campaigns: email (and in-app) messages to a chosen audience, with their results. */
export const CampaignsPage = () => {
  const [list, setList] = useState(null);
  const [courses, setCourses] = useState([]);
  const [segments, setSegments] = useState([]);
  const [editing, setEditing] = useState(null); // campaign id or 'new'
  const [form, setForm] = useState(BLANK);
  const [count, setCount] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState('');

  const load = useCallback(() => lmsAdminAPI.campaigns().then(({ data }) => setList(data)).catch(() => setList([])), []);
  useEffect(() => {
    load();
    catalogAPI.manage('courses').list().then(({ data }) => setCourses(data.results || data)).catch(() => {});
    lmsAdminAPI.segments().then(({ data }) => setSegments(data)).catch(() => {});
  }, [load]);

  // the audience size, refreshed as the rules change
  const rulesKey = useMemo(() => JSON.stringify(form.rules), [form.rules]);
  useEffect(() => {
    if (!editing) return undefined;
    const timer = setTimeout(() => {
      lmsAdminAPI.previewAudience(JSON.parse(rulesKey)).then(({ data }) => setCount(data)).catch(() => setCount(null));
    }, 350);
    return () => clearTimeout(timer);
  }, [rulesKey, editing]);

  const open = async (c) => {
    setErrors({});
    if (!c) {
      setEditing('new');
      setForm(BLANK);
      return;
    }
    const { data } = await lmsAdminAPI.campaign(c.id);
    setEditing(data.id);
    setForm({ ...BLANK, ...data });
  };
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const sent = editing && editing !== 'new' && list?.find((c) => c.id === editing)?.status !== 'draft';

  const save = async () => {
    setBusy('save');
    setErrors({});
    try {
      const body = Object.fromEntries(Object.keys(BLANK).map((k) => [k, form[k]]));
      const { data } = editing === 'new' ? await lmsAdminAPI.createCampaign(body) : await lmsAdminAPI.updateCampaign(editing, body);
      setEditing(data.id);
      toast.success('Draft saved.');
      load();
      return data.id;
    } catch (err) {
      setErrors(parseApiErrors(err));
      return null;
    } finally {
      setBusy('');
    }
  };
  const test = async () => {
    const id = await save();
    if (!id) return;
    try {
      toast.success((await lmsAdminAPI.testCampaign(id)).data.detail);
    } catch (err) {
      toast.error(parseApiErrors(err).detail || 'The test could not be sent.');
    }
  };
  const send = async () => {
    const id = await save();
    if (!id || !window.confirm(`Send “${form.subject}” to ${count?.count ?? 'the'} people now? This can’t be undone.`)) return;
    setBusy('send');
    try {
      const { data } = await lmsAdminAPI.sendCampaign(id);
      toast.success(data.detail);
      setEditing(null);
      load();
    } catch (err) {
      toast.error(parseApiErrors(err).detail || 'The campaign could not be sent.');
    } finally {
      setBusy('');
    }
  };
  const saveSegment = async () => {
    const name = window.prompt('Name this audience to reuse it');
    if (!name) return;
    const { data } = await lmsAdminAPI.createSegment({ name, rules: form.rules });
    setSegments((s) => [...s, data]);
    toast.success('Audience saved.');
  };
  const remove = async (c) => {
    if (!window.confirm(`Delete the draft “${c.name}”?`)) return;
    await lmsAdminAPI.removeCampaign(c.id);
    load();
  };

  return (
    <PortalLayout title="Email campaigns" subtitle="Send news and offers to the students who should get them, and see who clicked."
      actions={!editing && <button type="button" className="btn btn--primary btn--sm" onClick={() => open(null)}><i className="fas fa-plus" /> New campaign</button>}>
      {editing ? (
        <div className="cp-layout">
          <section className="card panel cp-form">
            <button type="button" className="btn btn--text btn--sm cp-back" onClick={() => setEditing(null)}><i className="fas fa-arrow-left" /> All campaigns</button>
            {sent && <Alert type="info">This campaign has been sent. It can’t be changed.</Alert>}
            <fieldset disabled={sent}>
              <div className="field">
                <label htmlFor="cp-name">Campaign name <span className="optional">(only you see it)</span></label>
                <input id="cp-name" className="input" value={form.name} maxLength={120} onChange={set('name')} placeholder="e.g. October new courses" />
                {errors.name && <p className="field-error">{errors.name}</p>}
              </div>
              <div className="field">
                <label htmlFor="cp-subject">Subject line</label>
                <input id="cp-subject" className="input" value={form.subject} maxLength={150} onChange={set('subject')} placeholder="e.g. {first_name}, 3 new courses this month" />
                {errors.subject && <p className="field-error">{errors.subject}</p>}
              </div>
              <div className="field">
                <label htmlFor="cp-title">Heading in the email <span className="optional">(defaults to the subject)</span></label>
                <input id="cp-title" className="input" value={form.title} maxLength={150} onChange={set('title')} />
              </div>
              <div className="field">
                <label htmlFor="cp-body">Message</label>
                <textarea id="cp-body" className="input" rows={7} maxLength={5000} value={form.body} onChange={set('body')} placeholder={'Hello {first_name},\n\nWe’ve just launched…'} />
                <p className="hint">A blank line starts a new paragraph. <code>{'{first_name}'}</code> is replaced with each person’s first name.</p>
                {errors.body && <p className="field-error">{errors.body}</p>}
              </div>
              <div className="cp-two">
                <div className="field">
                  <label htmlFor="cp-btn">Button text <span className="optional">(optional)</span></label>
                  <input id="cp-btn" className="input" value={form.button_label} maxLength={60} onChange={set('button_label')} placeholder="e.g. See the courses" />
                </div>
                <div className="field">
                  <label htmlFor="cp-link">Button link</label>
                  <input id="cp-link" className="input" value={form.button_link} maxLength={300} onChange={set('button_link')} placeholder="/courses" />
                  {errors.button_link && <p className="field-error">{errors.button_link}</p>}
                </div>
              </div>

              <h3 className="h4 cp-h">Audience</h3>
              {segments.length > 0 && (
                <div className="cp-segments">
                  <small className="muted">Saved audiences:</small>
                  {segments.map((s) => <button key={s.id} type="button" className="cp-segment" onClick={() => setForm((f) => ({ ...f, rules: s.rules }))}>{s.name} <small>({s.count})</small></button>)}
                </div>
              )}
              <AudienceBuilder rules={form.rules} onChange={(rules) => setForm((f) => ({ ...f, rules }))} courses={courses} />
              <p className="cp-count" role="status">
                {count ? <><strong>{count.count}</strong> {count.count === 1 ? 'person' : 'people'} will get it{count.sample.length > 0 && <small className="muted"> · e.g. {count.sample.join(', ')}</small>}</> : 'Counting…'}
                <button type="button" className="btn btn--text btn--sm" onClick={saveSegment}><i className="fas fa-bookmark" /> Save this audience</button>
              </p>
              <p className="muted small">People who switched off news and offers are never included.</p>
              <label className="cp-check"><input type="checkbox" checked={form.notify_in_app} onChange={set('notify_in_app')} /> Also show it in their notifications</label>
            </fieldset>
            {!sent && (
              <div className="cp-actions">
                <button type="button" className="btn btn--outline btn--sm" onClick={save} disabled={!!busy}>{busy === 'save' && <span className="btn-spinner" />} Save draft</button>
                <button type="button" className="btn btn--outline btn--sm" onClick={test} disabled={!!busy}><i className="fas fa-vial" /> Send a test to me</button>
                <button type="button" className="btn btn--primary btn--sm" onClick={send} disabled={!!busy || !count?.count}>
                  {busy === 'send' ? <span className="btn-spinner" /> : <i className="fas fa-paper-plane" />} Send to {count?.count ?? '…'} {count?.count === 1 ? 'person' : 'people'}
                </button>
              </div>
            )}
          </section>
          <aside className="cp-side">
            <p className="muted small"><i className="fas fa-eye" aria-hidden="true" /> Preview (for “Aminata”)</p>
            <EmailPreview form={form} />
          </aside>
        </div>
      ) : (
        <section className="card table-card">
          {!list ? <div className="skeleton skeleton--block" /> : list.length === 0 ? (
            <div className="la-empty"><i className="fas fa-envelope-open-text" /><strong>No campaigns yet</strong><p className="muted">Write one to tell students about new courses, offers or events.</p></div>
          ) : (
            <div className="table-scroll">
              <table className="table">
                <thead><tr><th>Campaign</th><th>Status</th><th className="num">Sent</th><th className="num">Clicked</th><th className="num">Unsubscribed</th><th>Date</th><th /></tr></thead>
                <tbody>
                  {list.map((c) => (
                    <tr key={c.id}>
                      <td><button type="button" className="link-button" onClick={() => open(c)}><strong>{c.name}</strong></button><br /><small className="muted">{c.subject}</small></td>
                      <td><span className={`badge ${TONE[c.status]}`}>{c.status_display}</span></td>
                      <td className="num">{c.sent}{c.failed ? <small className="muted"> ({c.failed} failed)</small> : null}</td>
                      <td className="num">{c.click_rate != null ? `${c.clicks} (${c.click_rate}%)` : '—'}</td>
                      <td className="num">{c.unsubscribed || '—'}</td>
                      <td>{formatDateTime(c.sent_at || c.created_at)}</td>
                      <td className="num">{c.status === 'draft' && <button type="button" className="icon-btn icon-btn--danger" aria-label={`Delete ${c.name}`} onClick={() => remove(c)}><i className="fas fa-trash-can" /></button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </PortalLayout>
  );
};

export default CampaignsPage;

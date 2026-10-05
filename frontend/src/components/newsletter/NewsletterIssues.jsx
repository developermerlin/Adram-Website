import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { newsletterAPI, parseApiErrors } from '../../services/api';
import { formatDate, formatDateTime } from '../../utils/format';
import { ImageField } from '../admin/contentFields';

const BLANK = { subject: '', preheader: '', title: '', body: '', image: '', button_label: '', button_link: '' };
const TONE = { draft: 'badge--gray', sending: 'badge--amber', sent: 'badge--green' };

/** The email exactly as subscribers will get it, refreshed while the admin types. */
const LivePreview = ({ form, sent }) => {
  const [html, setHtml] = useState('');
  const [warnings, setWarnings] = useState([]);
  useEffect(() => {
    const t = setTimeout(() => {
      newsletterAPI.previewIssue(form).then(({ data }) => { setHtml(data.html); setWarnings(data.warnings || []); }).catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [form]);
  return (
    <>
    {!sent && warnings.length > 0 && (
      <div className="nl-warnings" role="note">
        <p><i className="fas fa-triangle-exclamation" aria-hidden="true" /> <strong>Before you send</strong></p>
        <ul>{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
      </div>
    )}
    <div className="nl-preview">
      <div className="nl-preview__bar">
        <span className="nl-preview__from"><strong>ADRAM Technologies</strong></span>
        <span className="nl-preview__subject">{form.subject || 'Subject line'}</span>
        {form.preheader && <span className="nl-preview__pre">{form.preheader}</span>}
      </div>
      {html ? <iframe title="Email preview" className="nl-preview__frame" srcDoc={html} sandbox="" /> : <p className="muted nl-pad">Preparing preview…</p>}
    </div>
    </>
  );
};

/** Write, test and send one newsletter. Sent newsletters open read-only with their results. */
const IssueEditor = ({ id, subscribers, onBack, onSaved }) => {
  const [issue, setIssue] = useState(id ? null : { status: 'draft' });
  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState('');
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!id) return;
    newsletterAPI.issue(id).then(({ data }) => {
      setIssue(data);
      setForm(Object.fromEntries(Object.keys(BLANK).map((k) => [k, data[k] || ''])));
    }).catch(() => toast.error('Could not open this newsletter.'));
  }, [id]);

  if (!issue) return <div className="card panel"><p className="muted">Loading…</p></div>;
  const sent = issue.status !== 'draft';
  const set = (key) => (value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  // Saves the draft first, then runs `then` with the saved newsletter
  const save = async (then, label = 'save') => {
    setBusy(label);
    try {
      const { data } = issue.id ? await newsletterAPI.updateIssue(issue.id, form) : await newsletterAPI.createIssue(form);
      setIssue(data);
      onSaved();
      if (then) await then(data);
      else toast.success('Draft saved.');
    } catch (err) {
      const errs = parseApiErrors(err);
      setErrors(errs);
      toast.error(errs.detail || 'Please fix the highlighted fields.');
    } finally {
      setBusy('');
    }
  };

  const sendTest = () => save(async (saved) => {
    const { data } = await newsletterAPI.testIssue(saved.id);
    toast.success(data.detail);
  }, 'test');

  const sendAll = () => save(async (saved) => {
    const { data } = await newsletterAPI.sendIssue(saved.id);
    setIssue(data);
    setConfirming(false);
    onSaved();
    toast.success(data.detail);
  }, 'send');

  const remove = async () => {
    if (!window.confirm('Delete this draft?')) return;
    await newsletterAPI.removeIssue(issue.id);
    onSaved();
    onBack();
  };

  const field = (key, label, props = {}) => (
    <label className="field">
      <span className="field__label">{label}</span>
      <input className="input" value={form[key]} disabled={sent} aria-invalid={Boolean(errors[key])} onChange={(e) => set(key)(e.target.value)} {...props} />
      {errors[key] ? <small className="nl-error">{errors[key]}</small> : props.hint && <small className="hint">{props.hint}</small>}
    </label>
  );

  return (
    <div className="nl-editor">
      <div className="nl-editor__head">
        <button type="button" className="btn btn--text btn--sm" onClick={onBack}><i className="fas fa-arrow-left" /> All newsletters</button>
        <span className={`badge ${TONE[issue.status]}`}>{issue.status === 'sent' ? `Sent ${formatDateTime(issue.sent_at)}` : 'Draft'}</span>
      </div>

      {sent && (
        <div className="nl-results">
          <div><strong>{issue.sent}</strong><span>delivered</span></div>
          <div><strong>{issue.clicks}</strong><span>clicked{issue.click_rate != null ? ` (${issue.click_rate}%)` : ''}</span></div>
          <div><strong>{issue.unsubscribed}</strong><span>unsubscribed</span></div>
          {issue.failed > 0 && <div><strong>{issue.failed}</strong><span>failed</span></div>}
        </div>
      )}

      <div className="nl-editor__grid">
        <section className="card panel nl-editor__form">
          {field('subject', 'Subject line', { maxLength: 150, placeholder: 'e.g. New courses and scholarships this month' })}
          {field('preheader', 'Preview text (optional)', { maxLength: 150, hint: 'The grey line next to the subject in the inbox.' })}
          {field('title', 'Heading inside the email (optional)', { maxLength: 150, hint: 'Leave empty to use the subject.' })}
          {!sent && <ImageField field={{ label: 'Picture at the top (optional)' }} value={form.image} onChange={set('image')} id="nl-image" />}
          {errors.image && <small className="nl-error">{errors.image}</small>}
          <label className="field">
            <span className="field__label">Newsletter text</span>
            <textarea className="input nl-body" rows={12} value={form.body} disabled={sent} maxLength={10000} aria-invalid={Boolean(errors.body)}
              onChange={(e) => set('body')(e.target.value)}
              placeholder={'Hello {name},\n\nWrite each paragraph with an empty line between them.\n\n- Lines starting with a dash\n- become a bullet list'} />
            {errors.body ? <small className="nl-error">{errors.body}</small>
              : <small className="hint">Leave an empty line between paragraphs. Start lines with “- ” for a list. <code>{'{name}'}</code> becomes the subscriber’s first name.</small>}
          </label>
          <div className="form-row">
            {field('button_label', 'Button text (optional)', { maxLength: 60, placeholder: 'e.g. See the courses' })}
            {field('button_link', 'Button link', { maxLength: 300, placeholder: '/courses or https://…' })}
          </div>

          {!sent && (
            <div className="nl-editor__actions">
              <button type="button" className="btn btn--outline btn--sm" disabled={Boolean(busy)} onClick={() => save()}>
                {busy === 'save' ? <span className="btn-spinner" /> : <i className="fas fa-floppy-disk" />} Save draft
              </button>
              <button type="button" className="btn btn--outline btn--sm" disabled={Boolean(busy)} onClick={sendTest}>
                {busy === 'test' ? <span className="btn-spinner" /> : <i className="fas fa-paper-plane" />} Send me a test
              </button>
              <button type="button" className="btn btn--primary btn--sm" disabled={Boolean(busy) || !subscribers} onClick={() => setConfirming(true)}>
                <i className="fas fa-bullhorn" /> Send to {subscribers} subscriber{subscribers === 1 ? '' : 's'}
              </button>
              {issue.id && <button type="button" className="btn btn--text btn--sm nl-danger" onClick={remove}>Delete draft</button>}
            </div>
          )}
          {confirming && (
            <div className="nl-confirm" role="alert">
              <p><strong>Send “{form.subject || 'this newsletter'}” to {subscribers} subscribers now?</strong> It can’t be changed or recalled once sent.</p>
              <div>
                <button type="button" className="btn btn--primary btn--sm" disabled={Boolean(busy)} onClick={sendAll}>
                  {busy === 'send' ? <><span className="btn-spinner" /> Sending…</> : 'Yes, send it now'}
                </button>
                <button type="button" className="btn btn--text btn--sm" onClick={() => setConfirming(false)}>Cancel</button>
              </div>
            </div>
          )}
        </section>
        <section className="nl-editor__preview" aria-label="Preview">
          <LivePreview form={form} sent={sent} />
        </section>
      </div>
    </div>
  );
};

/** The list of newsletters, or one open in the editor. */
export const NewsletterIssues = ({ openId, onOpen, subscribers }) => {
  const [list, setList] = useState(null);
  const load = useCallback(() => newsletterAPI.issues().then(({ data }) => setList(data)).catch(() => setList([])), []);
  useEffect(() => {
    load();
  }, [load]);

  if (openId !== null) {
    return <IssueEditor key={openId} id={openId === 'new' ? null : openId} subscribers={subscribers} onBack={() => onOpen(null)} onSaved={load} />;
  }
  return (
    <section className="card table-card">
      <div className="nl-toolbar">
        <h2 className="h3 nl-toolbar__title">Newsletters</h2>
        <div className="nl-toolbar__actions">
          <button type="button" className="btn btn--primary btn--sm" onClick={() => onOpen('new')}><i className="fas fa-pen" /> New newsletter</button>
        </div>
      </div>
      {!list ? <p className="muted nl-pad">Loading…</p> : list.length === 0 ? (
        <div className="nl-empty">
          <i className="fas fa-newspaper" aria-hidden="true" />
          <p>No newsletters yet.</p>
          <button type="button" className="btn btn--primary btn--sm" onClick={() => onOpen('new')}>Write your first newsletter</button>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead><tr><th>Subject</th><th>Status</th><th>Date</th><th className="num">Delivered</th><th className="num">Clicks</th><th className="num">Unsubscribed</th></tr></thead>
            <tbody>
              {list.map((i) => (
                <tr key={i.id}>
                  <td><button type="button" className="link-button" onClick={() => onOpen(i.id)}>{i.subject}</button></td>
                  <td><span className={`badge ${TONE[i.status]}`}>{i.status_display}</span></td>
                  <td>{formatDate(i.sent_at || i.updated_at)}</td>
                  <td className="num">{i.status === 'draft' ? '—' : i.sent}</td>
                  <td className="num">{i.status === 'draft' ? '—' : <>{i.clicks}{i.click_rate != null && <span className="muted"> ({i.click_rate}%)</span>}</>}</td>
                  <td className="num">{i.status === 'draft' ? '—' : i.unsubscribed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

export default NewsletterIssues;

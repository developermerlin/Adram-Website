import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { lmsAPI, parseApiErrors } from '../../services/api';
import { formatDateTime } from '../../utils/format';

/** Post announcements to everyone enrolled on a course, and remove old ones. */
export const AnnouncementsManager = ({ slug }) => {
  const [items, setItems] = useState(null);
  const [form, setForm] = useState({ title: '', body: '', notify: true });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => lmsAPI.announcements(slug).then(({ data }) => setItems(data)).catch(() => setItems([])), [slug]);
  useEffect(() => {
    load();
  }, [load]);

  const post = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await lmsAPI.postAnnouncement(slug, form);
      toast.success(form.notify ? 'Announcement posted and emailed to students' : 'Announcement posted');
      setForm({ title: '', body: '', notify: true });
      setErrors({});
      load();
    } catch (err) {
      setErrors(parseApiErrors(err));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id) => {
    if (!window.confirm('Delete this announcement?')) return;
    await lmsAPI.removeAnnouncement(id);
    load();
  };

  return (
    <div className="co-grid">
      <form className="card panel co-form" onSubmit={post} noValidate>
        <h2 className="h3">New announcement</h2>
        <div className="field">
          <label htmlFor="an-title">Title</label>
          <input id="an-title" className="input" value={form.title} maxLength={200} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          {errors.title && <p className="co-error">{errors.title}</p>}
        </div>
        <div className="field">
          <label htmlFor="an-body">Message</label>
          <textarea id="an-body" className="input" rows={5} maxLength={5000} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />
          {errors.body && <p className="co-error">{errors.body}</p>}
        </div>
        <label className="check"><input type="checkbox" checked={form.notify} onChange={(e) => setForm((f) => ({ ...f, notify: e.target.checked }))} /> Also email it to enrolled students</label>
        <div className="co-form__actions"><button type="submit" className="btn btn--primary btn--sm" disabled={busy}>Post announcement</button></div>
      </form>
      <section className="card panel">
        <h2 className="h3">Posted</h2>
        {!items ? <p className="muted">Loading…</p> : items.length === 0 ? <p className="muted">Nothing posted yet.</p> : (
          <ul className="sales-list">
            {items.map((a) => (
              <li key={a.id}>
                <div><strong>{a.title}</strong><p className="muted small">{formatDateTime(a.created_at)}</p><p>{a.body}</p></div>
                <div className="sales-list__actions"><button type="button" className="btn btn--text btn--sm" onClick={() => remove(a.id)}>Delete</button></div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default AnnouncementsManager;

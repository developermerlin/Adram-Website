import { useState } from 'react';
import toast from 'react-hot-toast';
import { lmsAdminAPI, parseApiErrors } from '../../services/api';
import { Alert, TextField } from '../ui/Form';

/** Send a system notification to students, instructors or everyone (it appears under their bell). */
export const BroadcastForm = () => {
  const [form, setForm] = useState({ audience: 'students', title: '', body: '', link: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const send = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await lmsAdminAPI.broadcast(form);
      toast.success(`Sent to ${data.sent} ${data.sent === 1 ? 'person' : 'people'}`);
      setForm({ audience: form.audience, title: '', body: '', link: '' });
      setErrors({});
    } catch (err) {
      setErrors(parseApiErrors(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="card panel la-form" onSubmit={send} noValidate>
      <h2 className="h3">Send a notification</h2>
      <p className="muted small">A system message that appears in people’s notification centre, e.g. new courses, a holiday timetable or planned maintenance.</p>
      <div className="field">
        <label htmlFor="bc-audience">Send to</label>
        <select id="bc-audience" className="input" value={form.audience} onChange={set('audience')}>
          <option value="students">All students</option>
          <option value="instructors">All instructors</option>
          <option value="everyone">Everyone</option>
        </select>
      </div>
      <TextField label="Title" maxLength={200} name="title" value={form.title} error={errors.title} onChange={set('title')} />
      <div className="field">
        <label htmlFor="bc-body">Message <span className="optional">(optional)</span></label>
        <textarea id="bc-body" className="input" rows={3} maxLength={500} value={form.body} onChange={set('body')} />
      </div>
      <TextField label="Link (optional)" placeholder="e.g. /courses" maxLength={300} name="link" value={form.link} onChange={set('link')} hint="Where clicking the notification takes them." />
      <Alert>{errors.form || errors.audience}</Alert>
      <div className="la-form__actions"><button type="submit" className="btn btn--primary" disabled={busy || !form.title.trim()}>{busy ? <span className="btn-spinner" /> : <i className="fas fa-paper-plane" />} Send</button></div>
    </form>
  );
};

export default BroadcastForm;

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { catalogAPI, lmsAdminAPI, parseApiErrors } from '../../services/api';
import { formatDateTime } from '../../utils/format';
import { Alert, TextField } from '../ui/Form';
import ConfirmDialog from '../admin/ConfirmDialog';

const BLANK = { id: null, name: '', percent_off: '20', starts_at: '', ends_at: '', course_ids: [], is_enabled: true, notify_students: false };
const STATE = { live: ['badge--green', 'Live now'], scheduled: ['badge--blue', 'Scheduled'], ended: ['badge--gray', 'Ended'], off: ['badge--gray', 'Switched off'] };
// <input type="datetime-local"> wants local time without a zone
const toLocal = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

/** Admin → Orders & coupons → Flash sales: a percentage off chosen (or all paid) courses between two times. */
const FlashSalesPanel = () => {
  const [sales, setSales] = useState(null);
  const [courses, setCourses] = useState([]);
  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [deleting, setDeleting] = useState(null);
  const load = useCallback(() => lmsAdminAPI.flashSales().then(({ data }) => setSales(data)).catch(() => setSales([])), []);
  useEffect(() => {
    load();
    let live = true;
    catalogAPI.manage('courses').list().then(({ data }) => live && setCourses(data.filter((c) => Number(c.price) > 0))).catch(() => {});
    return () => {
      live = false;
    };
  }, [load]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const toggleCourse = (id) => setForm((f) => ({ ...f, course_ids: f.course_ids.includes(id) ? f.course_ids.filter((x) => x !== id) : [...f.course_ids, id] }));
  const save = async (e) => {
    e.preventDefault();
    const missing = {};
    if (!form.starts_at) missing.starts_at = 'Choose when the sale starts.';
    if (!form.ends_at) missing.ends_at = 'Choose when it ends.';
    if (Object.keys(missing).length) {
      setErrors(missing);
      return;
    }
    const body = {
      name: form.name, percent_off: Number(form.percent_off), course_ids: form.course_ids, is_enabled: form.is_enabled,
      starts_at: new Date(form.starts_at).toISOString(), ends_at: new Date(form.ends_at).toISOString(),
      ...(form.id ? {} : { notify_students: form.notify_students }),
    };
    try {
      if (form.id) await lmsAdminAPI.updateFlashSale(form.id, body);
      else await lmsAdminAPI.createFlashSale(body);
      toast.success(form.id ? 'Flash sale updated' : 'Flash sale created');
      setForm(BLANK);
      setErrors({});
      load();
    } catch (err) {
      setErrors(parseApiErrors(err));
    }
  };
  const toggle = async (sale) => {
    await lmsAdminAPI.updateFlashSale(sale.id, { is_enabled: !sale.is_enabled }).catch(() => toast.error('That didn’t work.'));
    load();
  };
  const remove = async () => {
    await lmsAdminAPI.deleteFlashSale(deleting.id).catch(() => toast.error('The sale could not be deleted.'));
    setDeleting(null);
    load();
  };
  const edit = (s) => setForm({ id: s.id, name: s.name, percent_off: String(s.percent_off), starts_at: toLocal(s.starts_at), ends_at: toLocal(s.ends_at),
    course_ids: s.course_ids, is_enabled: s.is_enabled, notify_students: false });

  return (
    <div className="la-split">
      <form className="card panel la-form" onSubmit={save} noValidate>
        <h2 className="h3">{form.id ? `Edit ${form.name}` : 'New flash sale'}</h2>
        <p className="muted small">A percentage off for a limited time. Prices change by themselves when it starts and ends; each course gets its best deal (this or its own sale price).</p>
        <div className="form-row">
          <TextField label="Name (shown to students)" maxLength={80} placeholder="e.g. Easter sale" name="name" value={form.name} error={errors.name} onChange={set('name')} />
          <TextField label="Percent off (1–90)" type="number" min="1" max="90" name="percent_off" value={form.percent_off} error={errors.percent_off} onChange={set('percent_off')} />
        </div>
        <TextField label="Starts" type="datetime-local" name="starts_at" value={form.starts_at} error={errors.starts_at} onChange={set('starts_at')} />
        <TextField label="Ends" type="datetime-local" name="ends_at" value={form.ends_at} error={errors.ends_at} onChange={set('ends_at')} />
        <div className="field">
          <span className="field__label">Courses <span className="optional">(none ticked = every paid course)</span></span>
          <div className="la-multi">
            {courses.map((c) => <label key={c.id}><input type="checkbox" checked={form.course_ids.includes(c.id)} onChange={() => toggleCourse(c.id)} /> {c.title}</label>)}
            {courses.length === 0 && <p className="muted small">No paid courses yet. Give a course a price in its editor first.</p>}
          </div>
        </div>
        <label className="la-inline-check"><input type="checkbox" checked={form.is_enabled} onChange={set('is_enabled')} /> Switched on</label>
        {!form.id && <label className="la-inline-check"><input type="checkbox" checked={form.notify_students} onChange={set('notify_students')} /> Tell every student about this sale (notification)</label>}
        <Alert>{errors.form || errors.non_field_errors}</Alert>
        <div className="la-form__actions">
          <button type="submit" className="btn btn--primary" disabled={!form.name.trim() || !form.percent_off}>{form.id ? 'Save changes' : 'Create flash sale'}</button>
          {form.id && <button type="button" className="btn btn--text" onClick={() => { setForm(BLANK); setErrors({}); }}>Cancel</button>}
        </div>
      </form>

      <section className="card">
        {!sales ? <div className="skeleton skeleton--block" /> : sales.length === 0 ? (
          <div className="la-empty"><i className="fas fa-bolt" /><strong>No flash sales yet</strong><p>Run a time-limited discount, for example a weekend or holiday sale.</p></div>
        ) : (
          <ul className="la-cards">
            {sales.map((s) => {
              const [tone, label] = STATE[s.state] || STATE.off;
              return (
                <li key={s.id} className="la-card">
                  <div>
                    <div className="la-card__head"><strong><i className="fas fa-bolt" aria-hidden="true" /> {s.name} · {s.percent_off}% off</strong><span className={`badge ${tone}`}>{label}</span></div>
                    <p className="la-meta">{formatDateTime(s.starts_at)} → {formatDateTime(s.ends_at)} · {s.course_titles.length ? s.course_titles.join(', ') : 'every paid course'}</p>
                  </div>
                  <div className="la-card__side la-actions">
                    {s.state !== 'ended' && <button type="button" className="btn btn--text btn--sm" onClick={() => toggle(s)}>{s.is_enabled ? 'Switch off' : 'Switch on'}</button>}
                    <button type="button" className="btn btn--outline btn--sm" onClick={() => edit(s)}>Edit</button>
                    <button type="button" className="icon-btn icon-btn--danger" aria-label={`Delete ${s.name}`} onClick={() => setDeleting(s)}><i className="fas fa-trash-can" /></button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {deleting && <ConfirmDialog config={{ title: `Delete ${deleting.name}?`, text: 'Prices go back to normal straight away. Orders already placed keep their price.', confirm: 'Delete' }} onClose={() => setDeleting(null)} onConfirm={remove} />}
    </div>
  );
};

export default FlashSalesPanel;

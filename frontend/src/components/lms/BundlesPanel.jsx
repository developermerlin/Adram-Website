import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { catalogAPI, lmsAdminAPI, parseApiErrors } from '../../services/api';
import { Alert } from '../ui/Form';
import { money } from './courseUtils';
import '../../styles/bundles.css';

const BLANK = { title: '', summary: '', description: '', price: '', courses: [], is_published: false };

/** Orders & coupons → Bundles: several paid courses sold together for one price. */
export const BundlesPanel = () => {
  const [bundles, setBundles] = useState(null);
  const [courses, setCourses] = useState([]);
  const [editing, setEditing] = useState(null); // bundle id, or 'new'
  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => lmsAdminAPI.bundles().then(({ data }) => setBundles(data)).catch(() => setBundles([])), []);
  useEffect(() => {
    load();
    catalogAPI.manage('courses').list().then(({ data }) => setCourses((data.results || data).filter((c) => Number(c.price) > 0))).catch(() => {});
  }, [load]);

  const bySlug = useMemo(() => Object.fromEntries(courses.map((c) => [c.slug, c])), [courses]);
  const separate = form.courses.reduce((sum, slug) => sum + Number(bySlug[slug]?.sale_price ?? bySlug[slug]?.price ?? 0), 0);
  const saving = separate && Number(form.price) ? Math.round(100 - (100 * Number(form.price)) / separate) : 0;

  const open = (b) => {
    setEditing(b ? b.id : 'new');
    setForm(b ? { title: b.title, summary: b.summary, description: b.description, price: b.price, courses: b.courses, is_published: b.is_published } : BLANK);
    setErrors({});
  };
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const toggle = (slug) => setForm((f) => ({ ...f, courses: f.courses.includes(slug) ? f.courses.filter((s) => s !== slug) : [...f.courses, slug] }));

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      if (editing === 'new') await lmsAdminAPI.createBundle(form);
      else await lmsAdminAPI.updateBundle(editing, form);
      toast.success('Bundle saved.');
      setEditing(null);
      load();
    } catch (err) {
      setErrors(parseApiErrors(err));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (b) => {
    if (!window.confirm(`Delete the bundle "${b.title}"? Past orders keep their courses.`)) return;
    await lmsAdminAPI.removeBundle(b.id);
    load();
  };

  return (
    <div className="bp-admin">
      <div className="bp-admin__head">
        <p className="muted">Sell several paid courses together for less. Students who already own some of the courses pay only for the rest.</p>
        <button type="button" className="btn btn--primary btn--sm" onClick={() => open(null)}><i className="fas fa-plus" /> New bundle</button>
      </div>

      {editing && (
        <form className="card panel bp-form" onSubmit={save}>
          <h3 className="h4">{editing === 'new' ? 'New bundle' : 'Edit bundle'}</h3>
          <Alert>{errors.form || errors.detail}</Alert>
          <div className="bp-form__row">
            <div className="field">
              <label htmlFor="bd-title">Title</label>
              <input id="bd-title" className="input" value={form.title} maxLength={200} onChange={set('title')} placeholder="e.g. Full-stack web starter pack" />
              {errors.title && <p className="field-error">{errors.title}</p>}
            </div>
            <div className="field">
              <label htmlFor="bd-price">Bundle price (NLe)</label>
              <input id="bd-price" type="number" min="1" step="0.01" className="input" value={form.price} onChange={set('price')} />
              {errors.price && <p className="field-error">{errors.price}</p>}
              {separate > 0 && <p className="hint">Separately: {money(separate)}{saving > 0 ? ` · students save ${saving}%` : saving < 0 ? ' · the bundle costs more than the courses!' : ''}</p>}
            </div>
          </div>
          <div className="field">
            <label htmlFor="bd-summary">One-line summary <span className="optional">(optional)</span></label>
            <input id="bd-summary" className="input" value={form.summary} maxLength={300} onChange={set('summary')} />
          </div>
          <div className="field">
            <label htmlFor="bd-desc">Description <span className="optional">(optional)</span></label>
            <textarea id="bd-desc" className="input" rows={3} maxLength={5000} value={form.description} onChange={set('description')} />
          </div>
          <div className="field">
            <strong className="bp-form__label">Courses in the bundle ({form.courses.length})</strong>
            <div className="bp-form__courses">
              {courses.length === 0 && <small className="muted">No paid courses yet.</small>}
              {courses.map((c) => (
                <label key={c.slug}>
                  <input type="checkbox" checked={form.courses.includes(c.slug)} onChange={() => toggle(c.slug)} />
                  <span>{c.title}</span>
                  <small className="muted">{money(c.sale_price ?? c.price)}</small>
                </label>
              ))}
            </div>
            {errors.courses && <p className="field-error">{errors.courses}</p>}
          </div>
          <label className="bp-form__check"><input type="checkbox" checked={form.is_published} onChange={set('is_published')} /> Published (students can see and buy it)</label>
          <div className="bp-form__actions">
            <button type="button" className="btn btn--outline btn--sm" onClick={() => setEditing(null)}>Cancel</button>
            <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>{busy ? <span className="btn-spinner" /> : <i className="fas fa-floppy-disk" />} Save bundle</button>
          </div>
        </form>
      )}

      <section className="card table-card">
        {!bundles ? <div className="skeleton skeleton--block" /> : bundles.length === 0 ? <p className="muted in-pad">No bundles yet.</p> : (
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Bundle</th><th className="num">Courses</th><th className="num">Price</th><th className="num">Saving</th><th className="num">Sold</th><th>Status</th><th /></tr></thead>
              <tbody>
                {bundles.map((b) => (
                  <tr key={b.id}>
                    <td><strong>{b.title}</strong>{b.is_published && <><br /><Link to={`/bundles/${b.slug}`} className="small">View page</Link></>}</td>
                    <td className="num">{b.course_count}</td>
                    <td className="num">{money(b.price)}</td>
                    <td className="num">{b.savings_percent ? `${b.savings_percent}%` : '—'}</td>
                    <td className="num">{b.sold}</td>
                    <td><span className={`badge ${b.is_published ? 'badge--green' : 'badge--gray'}`}>{b.is_published ? 'Published' : 'Draft'}</span></td>
                    <td className="num">
                      <button type="button" className="icon-btn" aria-label={`Edit ${b.title}`} onClick={() => open(b)}><i className="fas fa-pen" /></button>
                      <button type="button" className="icon-btn icon-btn--danger" aria-label={`Delete ${b.title}`} onClick={() => remove(b)}><i className="fas fa-trash-can" /></button>
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

export default BundlesPanel;

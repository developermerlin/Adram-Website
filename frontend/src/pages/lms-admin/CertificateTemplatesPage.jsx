import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { catalogAPI, lmsAdminAPI, parseApiErrors } from '../../services/api';
import PortalLayout from '../../components/layout/PortalLayout';
import { Alert } from '../../components/ui/Form';
import CertificateView from '../../components/lms/CertificateView';
import '../../styles/certificates.css';

const LAYOUTS = [['classic', 'Classic (framed)'], ['modern', 'Modern (coloured band)'], ['minimal', 'Minimal']];
const BLANK = {
  name: 'New template', layout: 'classic', accent_color: '#1d4ed8', title: 'Certificate of completion', heading: 'Congratulations',
  lead: 'has successfully completed the course', footer_note: '', show_hours: true, show_instructor: true, show_qr: true,
  signer_name: '', signer_title: '', is_default: false, courses: [],
};
// What the preview shows in place of a real student's certificate
const SAMPLE = {
  code: 'ADR-SAMPLE-2026', student_name: 'Aminata Kamara', course_title: 'Web Development Basics', instructor_name: 'Mohamed Sesay',
  hours: 12.5, issued_at: new Date().toISOString(), platform_name: 'ADRAM', signature: '', qr_svg: '',
};

/** /admin/certificate-templates: how certificates look, and which courses use which template. */
export const CertificateTemplatesPage = () => {
  const [templates, setTemplates] = useState(null);
  const [courses, setCourses] = useState([]);
  const [selected, setSelected] = useState(null); // template id, or 'new'
  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => lmsAdminAPI.certificateTemplates().then(({ data }) => {
    setTemplates(data);
    return data;
  }), []);
  useEffect(() => {
    load().then((data) => {
      if (data.length) {
        setSelected(data[0].id);
        setForm({ ...BLANK, ...data[0], courses: data[0].courses.map((c) => c.slug) });
      } else {
        setSelected('new');
        setForm({ ...BLANK, is_default: true }); // the first template is the default
      }
    }).catch(() => setTemplates([]));
    catalogAPI.manage('courses').list().then(({ data }) => setCourses(data.results || data)).catch(() => {});
  }, [load]);

  const pick = (t) => {
    setSelected(t ? t.id : 'new');
    setForm(t ? { ...BLANK, ...t, courses: t.courses.map((c) => c.slug) } : { ...BLANK, is_default: !templates?.length });
    setErrors({});
  };
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const toggleCourse = (slug) => setForm((f) => ({ ...f, courses: f.courses.includes(slug) ? f.courses.filter((s) => s !== slug) : [...f.courses, slug] }));
  // which other template each course is on now (so moving one is visible)
  const onOther = useMemo(() => {
    const map = {};
    (templates || []).forEach((t) => t.id !== selected && t.courses.forEach((c) => { map[c.slug] = t.name; }));
    return map;
  }, [templates, selected]);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    const body = Object.fromEntries(Object.keys(BLANK).map((k) => [k, form[k]]));
    try {
      const { data } = selected === 'new' ? await lmsAdminAPI.createCertificateTemplate(body) : await lmsAdminAPI.updateCertificateTemplate(selected, body);
      toast.success('Template saved.');
      await load();
      pick(data);
    } catch (err) {
      setErrors(parseApiErrors(err));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    const t = templates.find((x) => x.id === selected);
    if (!window.confirm(`Delete "${t.name}"? ${t.issued ? `${t.issued} certificates issued with it will use their course's template or the default instead.` : ''}`)) return;
    await lmsAdminAPI.removeCertificateTemplate(selected);
    toast.success('Template deleted.');
    const data = await load();
    pick(data[0] || null);
  };

  const preview = { ...SAMPLE, template: form, signer_name: form.signer_name, signer_title: form.signer_title };
  const id = (name) => `ct-${name}`;
  return (
    <PortalLayout title="Certificate templates" subtitle="Choose how certificates look and which courses use each design."
      actions={<Link to="/admin/certificates" className="btn btn--outline btn--sm"><i className="fas fa-certificate" /> Issued certificates</Link>}>
      <div className="ct-layout">
        <section className="card panel">
          <ul className="ct-list">
            {(templates || []).map((t) => (
              <li key={t.id}>
                <button type="button" className={selected === t.id ? 'is-on' : ''} onClick={() => pick(t)}>
                  <span><i className="ct-swatch" style={{ background: t.accent_color }} /> <strong>{t.name}</strong>{t.is_default && <span className="badge badge--blue">Default</span>}</span>
                  <small className="muted">{LAYOUTS.find(([v]) => v === t.layout)?.[1]} · {t.courses.length} {t.courses.length === 1 ? 'course' : 'courses'} · {t.issued} issued</small>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn--outline btn--sm" onClick={() => pick(null)} disabled={selected === 'new'}><i className="fas fa-plus" /> New template</button>
          {templates && templates.length === 0 && <p className="muted small">No templates yet: certificates use the built-in design. Your first template becomes the default.</p>}

          <form className="ct-form" onSubmit={save}>
            <h2 className="h4">{selected === 'new' ? 'New template' : 'Edit template'}</h2>
            <Alert>{errors.form || errors.detail}</Alert>
            <div className="field">
              <label htmlFor={id('name')}>Template name</label>
              <input id={id('name')} className="input" value={form.name} maxLength={120} onChange={set('name')} />
              {errors.name && <p className="field-error">{errors.name}</p>}
            </div>
            <div className="ct-form__row">
              <div className="field">
                <label htmlFor={id('layout')}>Layout</label>
                <select id={id('layout')} className="input" value={form.layout} onChange={set('layout')}>
                  {LAYOUTS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor={id('color')}>Accent colour</label>
                <div className="ct-color">
                  <input type="color" aria-label="Pick the accent colour" value={/^#[0-9a-f]{6}$/i.test(form.accent_color) ? form.accent_color : '#1d4ed8'} onChange={set('accent_color')} />
                  <input id={id('color')} className="input" value={form.accent_color} maxLength={7} onChange={set('accent_color')} />
                </div>
                {errors.accent_color && <p className="field-error">{errors.accent_color}</p>}
              </div>
            </div>
            <div className="field">
              <label htmlFor={id('title')}>Title</label>
              <input id={id('title')} className="input" value={form.title} maxLength={80} onChange={set('title')} />
              {errors.title && <p className="field-error">{errors.title}</p>}
            </div>
            <div className="ct-form__row">
              <div className="field">
                <label htmlFor={id('heading')}>Heading <span className="optional">(optional)</span></label>
                <input id={id('heading')} className="input" value={form.heading} maxLength={80} onChange={set('heading')} />
              </div>
              <div className="field">
                <label htmlFor={id('lead')}>Wording before the course</label>
                <input id={id('lead')} className="input" value={form.lead} maxLength={160} onChange={set('lead')} />
              </div>
            </div>
            <div className="ct-form__row">
              <div className="field">
                <label htmlFor={id('signer')}>Signed by <span className="optional">(optional)</span></label>
                <input id={id('signer')} className="input" value={form.signer_name} maxLength={120} placeholder="From LMS settings" onChange={set('signer_name')} />
              </div>
              <div className="field">
                <label htmlFor={id('signer-title')}>Their title</label>
                <input id={id('signer-title')} className="input" value={form.signer_title} maxLength={120} placeholder="From LMS settings" onChange={set('signer_title')} />
              </div>
            </div>
            <div className="field">
              <label htmlFor={id('note')}>Footer note <span className="optional">(optional)</span></label>
              <input id={id('note')} className="input" value={form.footer_note} maxLength={200} placeholder="e.g. Accredited by …" onChange={set('footer_note')} />
            </div>
            <div className="ct-checks">
              <label className="qb-check"><input type="checkbox" checked={form.show_qr} onChange={set('show_qr')} /> QR code to verify the certificate</label>
              <label className="qb-check"><input type="checkbox" checked={form.show_instructor} onChange={set('show_instructor')} /> Instructor’s name</label>
              <label className="qb-check"><input type="checkbox" checked={form.show_hours} onChange={set('show_hours')} /> Hours of content</label>
              <label className="qb-check"><input type="checkbox" checked={form.is_default} onChange={set('is_default')} /> Default for courses without their own template</label>
            </div>
            <div className="field">
              <strong className="ct-courses__label">Courses using this template</strong>
              <div className="ct-courses">
                {courses.length === 0 && <small className="muted">No courses yet.</small>}
                {courses.map((c) => (
                  <label key={c.slug}>
                    <input type="checkbox" checked={form.courses.includes(c.slug)} onChange={() => toggleCourse(c.slug)} />
                    <span>{c.title}{onOther[c.slug] && !form.courses.includes(c.slug) ? <small className="muted"> · uses {onOther[c.slug]}</small> : null}</span>
                  </label>
                ))}
              </div>
              {errors.courses && <p className="field-error">{errors.courses}</p>}
            </div>
            <div className="ct-actions">
              <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>{busy ? <span className="btn-spinner" /> : <i className="fas fa-floppy-disk" />} Save template</button>
              {selected !== 'new' && <button type="button" className="btn btn--text btn--sm" onClick={remove}><i className="fas fa-trash-can" /> Delete</button>}
            </div>
            <p className="hint">Certificates keep the template they were issued with.</p>
          </form>
        </section>

        <section className="ct-preview" aria-label="Preview">
          <p className="muted small"><i className="fas fa-eye" aria-hidden="true" /> Preview with sample details</p>
          <CertificateView c={preview} preview />
        </section>
      </div>
    </PortalLayout>
  );
};

export default CertificateTemplatesPage;

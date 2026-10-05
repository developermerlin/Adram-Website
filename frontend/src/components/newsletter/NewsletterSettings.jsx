import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { newsletterAPI, parseApiErrors } from '../../services/api';

const Toggle = ({ label, hint, checked, onChange }) => (
  <label className="checkbox">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span>
    <span>{label}<small>{hint}</small></span>
  </label>
);

/** The footer form: on/off, its wording, and how sign-ups are confirmed. */
export const NewsletterSettings = () => {
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    newsletterAPI.settings().then(({ data }) => { setSaved(data); setForm(data); }).catch(() => toast.error('Could not load the settings.'));
  }, []);
  if (!form) return <div className="card panel"><p className="muted">Loading…</p></div>;

  const set = (key) => (value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const save = async () => {
    setBusy(true);
    try {
      const { data } = await newsletterAPI.saveSettings(form);
      setSaved(data);
      setForm(data);
      toast.success('Newsletter settings saved.');
    } catch (err) {
      setErrors(parseApiErrors(err));
    } finally {
      setBusy(false);
    }
  };
  const text = (key, label, max, area = false) => (
    <label className="field">
      <span className="field__label">{label}</span>
      {area
        ? <textarea className="input" rows={3} maxLength={max} value={form[key]} onChange={(e) => set(key)(e.target.value)} />
        : <input className="input" maxLength={max} value={form[key]} onChange={(e) => set(key)(e.target.value)} />}
      {errors[key] && <small className="nl-error">{errors[key]}</small>}
    </label>
  );

  return (
    <div className="nl-settings">
      <section className="card panel nl-settings__form">
        <h2 className="h3">Footer sign-up form</h2>
        <Toggle label="Show the newsletter form in the website footer" hint="Switch off to hide it on every page. Existing subscribers are kept."
          checked={form.enabled} onChange={set('enabled')} />
        {text('heading', 'Heading', 80)}
        {text('text', 'Text under the heading', 240, true)}
        <div className="form-row">
          {text('placeholder', 'Text inside the email box', 60)}
          {text('button_label', 'Button text', 30)}
        </div>
        <h3 className="h4 nl-settings__sub">Sign-ups</h3>
        <Toggle label="Ask new subscribers to confirm their email address (recommended)"
          hint="They get an email with a confirmation link. This keeps out fake and mistyped addresses and protects your sender reputation."
          checked={form.double_opt_in} onChange={set('double_opt_in')} />
        <Toggle label="Send a welcome email" hint="A short thank-you once someone is subscribed." checked={form.welcome_email} onChange={set('welcome_email')} />
        <div>
          <button type="button" className="btn btn--primary btn--sm" disabled={!dirty || busy} onClick={save}>
            {busy ? <span className="btn-spinner" /> : <i className="fas fa-floppy-disk" />} Save settings
          </button>
        </div>
      </section>

      <section className="card panel">
        <h2 className="h3">Preview</h2>
        <div className={`nl-footer-preview${form.enabled ? '' : ' is-off'}`}>
          {form.enabled ? (
            <>
              <div>
                <p className="nl-footer-preview__heading">{form.heading || 'Heading'}</p>
                <p className="nl-footer-preview__text">{form.text}</p>
              </div>
              <div className="nl-footer-preview__row">
                <span className="nl-footer-preview__input">{form.placeholder}</span>
                <span className="nl-footer-preview__button">{form.button_label}</span>
              </div>
            </>
          ) : <p className="nl-footer-preview__text"><i className="fas fa-eye-slash" /> The form is hidden from the website.</p>}
        </div>
      </section>
    </div>
  );
};

export default NewsletterSettings;

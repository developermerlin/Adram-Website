import { useEffect, useState } from 'react';
import { newsletterAPI, parseApiErrors } from '../../services/api';

/**
 * The newsletter band at the top of the website footer. Its wording, and whether it shows at all, are set in
 * Admin → Newsletter → Settings. New subscribers confirm by email unless the admin switched that off.
 */
export const NewsletterSignup = () => {
  const [form, setForm] = useState(null);
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState(''); // honeypot: hidden from people, bots fill it in
  const [state, setState] = useState({ busy: false, done: '', error: '' });

  useEffect(() => {
    let live = true;
    newsletterAPI.form().then(({ data }) => live && setForm(data)).catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  if (!form?.enabled) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim()) {
      setState({ busy: false, done: '', error: 'Enter your email address.' });
      return;
    }
    setState({ busy: true, done: '', error: '' });
    try {
      const { data } = await newsletterAPI.subscribe({ email: email.trim(), company });
      setState({ busy: false, done: data.detail, error: '' });
      setEmail('');
    } catch (err) {
      const errs = parseApiErrors(err, 'Something went wrong. Please try again.');
      setState({ busy: false, done: '', error: errs.email || errs.detail || errs.form || Object.values(errs)[0] });
    }
  };

  return (
    <section className="newsletter-band" aria-labelledby="newsletter-heading">
      <div className="newsletter-band__text">
        <h2 id="newsletter-heading">{form.heading}</h2>
        <p>{form.text}</p>
      </div>
      {state.done ? (
        <p className="newsletter-band__done" role="status"><i className="fas fa-circle-check" aria-hidden="true" /> {state.done}</p>
      ) : (
        <form className="newsletter-band__form" onSubmit={submit} noValidate>
          <label htmlFor="newsletter-email" className="sr-only">Email address</label>
          <div className="newsletter-band__row">
            <input id="newsletter-email" type="email" inputMode="email" autoComplete="email" className="newsletter-band__input"
              placeholder={form.placeholder} value={email} maxLength={254} aria-invalid={Boolean(state.error)}
              aria-describedby={state.error ? 'newsletter-error' : undefined}
              onChange={(e) => { setEmail(e.target.value); if (state.error) setState((s) => ({ ...s, error: '' })); }} />
            <button type="submit" className="btn btn--primary newsletter-band__button" disabled={state.busy}>
              {state.busy && <span className="btn-spinner" />} {form.button_label}
            </button>
          </div>
          <input type="text" name="company" tabIndex={-1} autoComplete="off" className="newsletter-band__trap" aria-hidden="true"
            value={company} onChange={(e) => setCompany(e.target.value)} />
          {state.error
            ? <p id="newsletter-error" className="newsletter-band__error" role="alert">{state.error}</p>
            : <p className="newsletter-band__note">We respect your privacy. Unsubscribe with one click at any time.</p>}
        </form>
      )}
    </section>
  );
};

export default NewsletterSignup;

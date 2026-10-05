import { useEffect, useState } from 'react';
import { newsletterAPI, parseApiErrors } from '../../services/api';

/** "Get new articles in your inbox": the website newsletter, offered under the articles. Hidden when sign-ups are off. */
export const BlogNewsletter = ({ title, text }) => {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [state, setState] = useState({ busy: false, done: '', error: '' });

  useEffect(() => {
    let live = true;
    newsletterAPI.form().then(({ data }) => live && setOpen(Boolean(data.enabled))).catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  if (!open) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return setState({ busy: false, done: '', error: 'Enter your email address.' });
    setState({ busy: true, done: '', error: '' });
    try {
      const { data } = await newsletterAPI.subscribe({ email: email.trim() });
      setState({ busy: false, done: data.detail, error: '' });
    } catch (err) {
      const errs = parseApiErrors(err, 'Something went wrong. Please try again.');
      setState({ busy: false, done: '', error: errs.email || errs.detail || errs.form || Object.values(errs)[0] });
    }
    return undefined;
  };

  return (
    <section className="blog-news" aria-labelledby="blog-news-title">
      <div>
        <h2 id="blog-news-title">{title}</h2>
        <p>{text}</p>
      </div>
      {state.done ? <p className="blog-news__done" role="status"><i className="fas fa-circle-check" aria-hidden="true" /> {state.done}</p> : (
        <form onSubmit={submit} noValidate>
          <div className="blog-news__row">
            <label htmlFor="blog-news-email" className="sr-only">Email address</label>
            <input id="blog-news-email" className="input" type="email" autoComplete="email" placeholder="you@example.com" value={email}
              onChange={(e) => setEmail(e.target.value)} aria-invalid={Boolean(state.error)} />
            <button type="submit" className="btn btn--primary" disabled={state.busy}>{state.busy && <span className="btn-spinner" />} Subscribe</button>
          </div>
          {state.error && <p className="blog-news__error" role="alert">{state.error}</p>}
        </form>
      )}
    </section>
  );
};

export default BlogNewsletter;

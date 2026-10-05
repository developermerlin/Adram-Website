import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { newsletterAPI } from '../../services/api';
import { Spinner } from '../../components/ui/Section';
import '../../styles/campaigns.css';

const Card = ({ icon, title, children }) => (
  <section className="unsub-page">
    <div className="container">
      <article className="card unsub-card">
        <i className={`fas ${icon}`} aria-hidden="true" />
        <h1>{title}</h1>
        {children}
        <Link to="/" className="btn btn--text">Back to the website</Link>
      </article>
    </div>
  </section>
);

/** /newsletter/confirm/:token — the link in the confirmation email. Confirming is a POST, so link scanners can't do it. */
export const NewsletterConfirmPage = () => {
  const { token } = useParams();
  const [state, setState] = useState({ status: 'loading', email: '' });
  const asked = useRef(false);

  useEffect(() => {
    if (asked.current) return; // React's development double-run
    asked.current = true;
    newsletterAPI.confirm(token)
      .then(({ data }) => setState({ status: 'done', email: data.email }))
      .catch(() => setState({ status: 'invalid', email: '' }));
  }, [token]);

  if (state.status === 'loading') return <Spinner label="Confirming…" />;
  if (state.status === 'invalid') {
    return (
      <Card icon="fa-link-slash" title="This link doesn’t work">
        <p>It may be incomplete or out of date. Sign up again with the form at the bottom of any page.</p>
      </Card>
    );
  }
  return (
    <Card icon="fa-envelope-circle-check" title="You’re subscribed">
      <p>Thanks! <strong>{state.email}</strong> will now receive the ADRAM Technologies newsletter. Every email has a link to unsubscribe.</p>
    </Card>
  );
};

/** /newsletter/unsubscribe/:token — from the link at the bottom of every newsletter. */
export const NewsletterUnsubscribePage = () => {
  const { token } = useParams();
  const [params] = useSearchParams();
  const [data, setData] = useState(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    newsletterAPI.unsubscribeInfo(token).then(({ data: d }) => live && setData(d)).catch(() => live && setMissing(true));
    return () => {
      live = false;
    };
  }, [token]);

  const run = async (call) => {
    setBusy(true);
    try {
      const { data: d } = await call();
      setData(d);
    } finally {
      setBusy(false);
    }
  };

  if (missing) {
    return (
      <Card icon="fa-link-slash" title="This link doesn’t work">
        <p>It may be incomplete. Use the unsubscribe link in the newsletter itself, or contact us and we’ll remove you.</p>
      </Card>
    );
  }
  if (!data) return <Spinner label="Loading…" />;
  if (data.status === 'unsubscribed') {
    return (
      <Card icon="fa-envelope-circle-check" title="You’re unsubscribed">
        <p>We won’t send the newsletter to <strong>{data.email}</strong> any more.</p>
        <button type="button" className="btn btn--outline" disabled={busy} onClick={() => run(() => newsletterAPI.resubscribe(token))}>
          Unsubscribed by mistake? Subscribe again
        </button>
      </Card>
    );
  }
  return (
    <Card icon="fa-envelope" title="Unsubscribe from the newsletter?">
      <p>We’ll stop sending the ADRAM Technologies newsletter to <strong>{data.email}</strong>.</p>
      <button type="button" className="btn btn--primary" disabled={busy} onClick={() => run(() => newsletterAPI.unsubscribe(token, params.get('d')))}>
        {busy && <span className="btn-spinner" />} Unsubscribe
      </button>
    </Card>
  );
};

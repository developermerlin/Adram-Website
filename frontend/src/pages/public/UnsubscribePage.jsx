import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { lmsAPI } from '../../services/api';
import { Spinner } from '../../components/ui/Section';
import { NotFoundPage } from './StatusPages';
import '../../styles/campaigns.css';

/** /unsubscribe/:token: one click to stop (or restart) news and offers by email. No sign-in needed. */
export const UnsubscribePage = () => {
  const { token } = useParams();
  const [state, setState] = useState({ data: null, missing: false });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    lmsAPI.unsubscribeInfo(token).then(({ data }) => live && setState({ data, missing: false })).catch(() => live && setState({ data: null, missing: true }));
    return () => {
      live = false;
    };
  }, [token]);

  const { data, missing } = state;
  if (missing) return <NotFoundPage />;
  if (!data) return <Spinner label="Loading…" />;
  const change = async (subscribe) => {
    setBusy(true);
    try {
      const { data: d } = await lmsAPI.unsubscribe(token, subscribe);
      setState({ data: { ...data, subscribed: d.subscribed }, missing: false });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="unsub-page">
      <div className="container">
        <article className="card unsub-card">
          <i className={`fas ${data.subscribed ? 'fa-envelope' : 'fa-envelope-circle-check'}`} aria-hidden="true" />
          {data.subscribed ? (
            <>
              <h1>Stop news and offers?</h1>
              <p>We’ll stop sending news and offers to <strong>{data.email}</strong>. You’ll still get emails about your account, payments and courses.</p>
              <button type="button" className="btn btn--primary" onClick={() => change(false)} disabled={busy}>{busy && <span className="btn-spinner" />} Unsubscribe</button>
            </>
          ) : (
            <>
              <h1>You’re unsubscribed</h1>
              <p>We won’t send news and offers to <strong>{data.email}</strong> any more.</p>
              <button type="button" className="btn btn--outline" onClick={() => change(true)} disabled={busy}>Subscribe again</button>
            </>
          )}
          <Link to="/" className="btn btn--text">Back to the website</Link>
        </article>
      </div>
    </section>
  );
};

export default UnsubscribePage;

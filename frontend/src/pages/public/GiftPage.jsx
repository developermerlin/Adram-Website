import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { lmsAPI, parseApiErrors } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Spinner } from '../../components/ui/Section';
import { assetUrl } from '../../utils/assets';
import { NotFoundPage } from './StatusPages';
import '../../styles/bundles.css';

/** /gift/:code: someone bought you a course. Sign in (or sign up) and open it to start learning. */
export const GiftPage = () => {
  const { code } = useParams();
  const { isAuthenticated } = useAuth();
  const [state, setState] = useState({ gift: null, missing: false });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    lmsAPI.gift(code).then(({ data }) => live && setState({ gift: data, missing: false })).catch(() => live && setState({ gift: null, missing: true }));
    return () => {
      live = false;
    };
  }, [code, isAuthenticated]);

  const { gift: g, missing } = state;
  if (missing) return <NotFoundPage />;
  if (!g) return <Spinner label="Opening your gift…" />;

  const redeem = async () => {
    setBusy(true);
    try {
      const { data } = await lmsAPI.redeemGift(code);
      setState({ gift: data, missing: false });
      toast.success('Enjoy your new course!');
    } catch (err) {
      toast.error(parseApiErrors(err).detail || 'The gift could not be opened.');
    } finally {
      setBusy(false);
    }
  };
  const first = g.courses[0];

  return (
    <section className="gift-page">
      <div className="container">
        <article className="card gift-card">
          <span className="gift-card__icon" aria-hidden="true"><i className="fas fa-gift" /></span>
          <p className="gift-card__from">A gift from <strong>{g.from}</strong></p>
          <h1>{g.bundle || (g.courses.length === 1 ? first?.title : `${g.courses.length} courses`)}</h1>
          {g.message && <blockquote className="gift-card__message">“{g.message}”<cite>— {g.from}</cite></blockquote>}
          <ul className="gift-card__courses">
            {g.courses.map((c) => (
              <li key={c.slug}>
                {c.thumbnail ? <img src={assetUrl(c.thumbnail)} alt="" /> : <span className="gift-card__thumb" aria-hidden="true"><i className="fas fa-graduation-cap" /></span>}
                <Link to={`/courses/${c.slug}`}>{c.title}</Link>
              </li>
            ))}
          </ul>

          {g.revoked ? (
            <p className="gift-card__status is-bad"><i className="fas fa-ban" aria-hidden="true" /> This gift was cancelled.</p>
          ) : g.redeemed_by_you ? (
            <>
              <p className="gift-card__status is-good"><i className="fas fa-circle-check" aria-hidden="true" /> It’s yours: every lesson is open.</p>
              <Link to={first ? `/learn/${first.slug}` : '/student/learning'} className="btn btn--primary btn--lg">Start learning</Link>
            </>
          ) : g.redeemed ? (
            <p className="gift-card__status is-bad"><i className="fas fa-circle-info" aria-hidden="true" /> This gift has already been used.</p>
          ) : !g.paid ? (
            <p className="gift-card__status"><i className="fas fa-hourglass-half" aria-hidden="true" /> The payment for this gift is still being confirmed. Check back soon.</p>
          ) : isAuthenticated ? (
            <button type="button" className="btn btn--primary btn--lg" onClick={redeem} disabled={busy}>{busy && <span className="btn-spinner" />} Open my gift and enrol</button>
          ) : (
            <div className="gift-card__auth">
              <p>Sign in or create a free account to open your gift.</p>
              <Link to="/register" state={{ from: `/gift/${code}` }} className="btn btn--primary">Create an account</Link>
              <Link to="/login" state={{ from: `/gift/${code}` }} className="btn btn--outline">Sign in</Link>
            </div>
          )}
          <p className="muted small gift-card__code">Gift code {g.code}</p>
        </article>
      </div>
    </section>
  );
};

export default GiftPage;

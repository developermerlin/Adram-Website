import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { lmsAPI, parseApiErrors } from '../../services/api';
import { formatDate } from '../../utils/format';
import { money } from './courseUtils';
import '../../styles/premium.css';

/**
 * Under the buy buttons: start with Premium (Premium courses), or pay in 2–3 parts. `outline` is the course API data;
 * `onEnrolled` reloads the page after starting with Premium.
 */
export const PremiumOptions = ({ slug, outline, signedIn, student, onEnrolled }) => {
  const navigate = useNavigate();
  const [busy, setBusy] = useState('');
  const [parts, setParts] = useState(null);
  const premium = outline.premium;
  const offer = outline.instalments;
  if (!premium && !offer) return null;

  const needSignIn = () => navigate('/login', { state: { from: `/courses/${slug}` } });
  const startPremium = async () => {
    setBusy('premium');
    try {
      await lmsAPI.premiumEnrol(slug);
      toast.success('Enjoy the course! It’s open while your Premium lasts.');
      onEnrolled();
    } catch (err) {
      toast.error(parseApiErrors(err).detail || 'The course could not be started.');
    } finally {
      setBusy('');
    }
  };
  const payInParts = async (n) => {
    setBusy(`parts-${n}`);
    try {
      const { data } = await lmsAPI.startInstalments(slug, n);
      navigate(`/orders/${data.id}`);
    } catch (err) {
      toast.error(parseApiErrors(err).detail || 'The payment plan could not be started.');
      setBusy('');
    }
  };

  return (
    <div className="pm-options">
      {premium && (
        <div className="pm-box">
          <p><i className="fas fa-crown" aria-hidden="true" /> <strong>Included in Premium</strong></p>
          {premium.active_until ? (
            <>
              <button type="button" className="btn btn--premium btn--block" onClick={startPremium} disabled={!!busy || !student}>
                {busy === 'premium' && <span className="btn-spinner" />} Start with your Premium
              </button>
              <small className="muted">Your Premium runs until {formatDate(premium.active_until)}.</small>
            </>
          ) : (
            <>
              <small className="muted">One plan opens this and every other Premium course.</small>
              <Link to="/premium" className="btn btn--outline btn--block btn--sm">See Premium plans</Link>
            </>
          )}
        </div>
      )}
      {offer && (
        <div className="pm-box">
          <p><i className="fas fa-calendar-days" aria-hidden="true" /> <strong>Pay in parts</strong></p>
          {parts === null ? (
            <button type="button" className="btn btn--text btn--block btn--sm" onClick={() => (signedIn ? setParts(0) : needSignIn())} disabled={signedIn && !student}>
              From {money(offer.options[offer.options.length - 1].each)} a month · see options
            </button>
          ) : (
            <div className="pm-parts">
              {offer.options.map((o) => (
                <button key={o.parts} type="button" className="pm-part" onClick={() => payInParts(o.parts)} disabled={!!busy}>
                  {busy === `parts-${o.parts}` ? <span className="btn-spinner" /> : <strong>{o.parts} parts</strong>}
                  <span>{money(o.first)} now, then {o.parts - 1 === 1 ? money(o.each) : `${o.parts - 1} × ${money(o.each)}`} monthly</span>
                </button>
              ))}
              <small className="muted">The course opens after the first part. Lessons pause if a part is {offer.grace_days} days late, and open again once it’s paid.</small>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/** A place the student has but can't use right now. */
export const BlockedNotice = ({ blocked }) => {
  if (blocked.reason === 'premium_ended') {
    return (
      <div className="pm-blocked" role="status">
        <strong><i className="fas fa-crown" aria-hidden="true" /> Your Premium has ended</strong>
        <p>Renew it to carry on where you left off, or buy the course to keep it for good. Your progress is saved.</p>
        <Link to="/premium" className="btn btn--premium btn--block">Renew Premium</Link>
      </div>
    );
  }
  return (
    <div className="pm-blocked is-overdue" role="status">
      <strong><i className="fas fa-lock" aria-hidden="true" /> A payment is overdue</strong>
      <p>The part due on {formatDate(blocked.due_at)} ({money(blocked.amount)}) hasn’t been paid, so the lessons are paused. Your progress is saved.</p>
      <Link to={`/orders/${blocked.order_id}`} className="btn btn--primary btn--block">Pay now</Link>
    </div>
  );
};

export default PremiumOptions;

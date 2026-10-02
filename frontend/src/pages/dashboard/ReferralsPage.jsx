import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { lmsAPI, parseApiErrors } from '../../services/api';
import { formatDate } from '../../utils/format';
import PortalLayout from '../../components/layout/PortalLayout';
import { Alert } from '../../components/ui/Form';
import ShareButtons from '../../components/lms/ShareButtons';
import '../../styles/bundles.css';

const STATUS = { ready: ['badge--green', 'Ready to use'], used: ['badge--gray', 'Used'], expired: ['badge--gray', 'Expired'] };
const CouponBadge = ({ coupon }) => {
  const [tone, label] = STATUS[coupon.status] || STATUS.ready;
  return <span className={`badge ${tone}`}>{label}</span>;
};

/** /student/referrals: invite friends with a link; they get a welcome discount and you're rewarded after their first purchase. */
export const ReferralsPage = () => {
  const [data, setData] = useState(null);
  const [claim, setClaim] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(() => lmsAPI.referrals().then(({ data: d }) => setData(d)).catch(() => setError('Your invitations could not be loaded.')), []);
  useEffect(() => {
    load();
  }, [load]);

  const copy = async (text, what) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copied`);
    } catch {
      toast.error('Copy it by hand instead.');
    }
  };
  const submitClaim = async (e) => {
    e.preventDefault();
    try {
      const { data: d } = await lmsAPI.claimReferral(claim.trim());
      setData(d);
      toast.success('Invitation added. Your welcome discount is ready.');
    } catch (err) {
      const errs = parseApiErrors(err);
      toast.error(errs.code || errs.detail || 'That code could not be used.');
    }
  };

  return (
    <PortalLayout title="Invite friends" subtitle="Share ADRAM with friends. They save on their first course, and you earn a discount when they buy.">
      <Alert>{error}</Alert>
      {data && !data.enabled && <Alert type="info">Invitations are paused at the moment.</Alert>}
      {data && data.enabled && (
        <>
          <section className="card panel rf-hero">
            <div className="rf-steps">
              <div><i className="fas fa-share-nodes" aria-hidden="true" /><strong>Share your link</strong><small>Send it to friends who want to learn.</small></div>
              <div><i className="fas fa-user-plus" aria-hidden="true" /><strong>They save {data.friend_percent}%</strong><small>on their first course when they join through it.</small></div>
              <div><i className="fas fa-gift" aria-hidden="true" /><strong>You get {data.reward_percent}% off</strong><small>after their first purchase, for each friend.</small></div>
            </div>
            <div className="rf-link">
              <label htmlFor="rf-link">Your invitation link</label>
              <div className="gift-panel__share">
                <input id="rf-link" className="input" readOnly value={data.link} onFocus={(e) => e.target.select()} />
                <button type="button" className="btn btn--primary btn--sm" onClick={() => copy(data.link, 'Link')}><i className="fas fa-link" /> Copy</button>
              </div>
              <p className="muted small">Or tell them your code: <button type="button" className="rf-code" onClick={() => copy(data.code, 'Code')}>{data.code}</button></p>
              <ShareButtons url={data.link} text={`I'm learning on ADRAM. Join with my link and get ${data.friend_percent}% off your first course:`} />
            </div>
          </section>

          <div className="pg-grid pg-grid--even rf-grid">
            <section className="card panel">
              <div className="panel__head"><h2 className="h3">Friends who joined ({data.friends.length})</h2></div>
              {data.friends.length === 0 ? <p className="muted">No one yet. Share your link to get started.</p> : (
                <ul className="pg-list">
                  {data.friends.map((f, i) => (
                    <li key={`${f.name}-${i}`}>
                      <span><strong>{f.name}</strong><small className="muted">Joined {formatDate(f.joined_at)}</small></span>
                      {f.reward ? (
                        <span className="rf-reward">
                          <button type="button" className="rf-code" onClick={() => copy(f.reward.code, 'Code')} title="Copy the code">{f.reward.code}</button>
                          <CouponBadge coupon={f.reward} />
                        </span>
                      ) : <span className="badge badge--amber">Waiting for their first purchase</span>}
                    </li>
                  ))}
                </ul>
              )}
              <p className="muted small">Reward codes take {data.reward_percent}% off one order, work for {data.valid_days} days, and only for you. <Link to="/cart">Go to your cart</Link></p>
            </section>

            <section className="card panel">
              <div className="panel__head"><h2 className="h3">Your welcome discount</h2></div>
              {data.invited_by ? (
                data.invited_by.welcome ? (
                  <>
                    <p>You joined through {data.invited_by.name}’s invitation.</p>
                    <p className="rf-reward">
                      <button type="button" className="rf-code" onClick={() => copy(data.invited_by.welcome.code, 'Code')}>{data.invited_by.welcome.code}</button>
                      <span>{data.invited_by.welcome.percent}% off</span>
                      <CouponBadge coupon={data.invited_by.welcome} />
                    </p>
                    {data.invited_by.welcome.status === 'ready' && <p className="muted small">Use it at checkout before {formatDate(data.invited_by.welcome.ends_at)}. <Link to="/courses">Find a course</Link></p>}
                  </>
                ) : <p>You joined through {data.invited_by.name}’s invitation.</p>
              ) : data.can_claim ? (
                <form onSubmit={submitClaim} className="rf-claim">
                  <p>Did a friend invite you? Enter their code to get {data.friend_percent}% off your first course.</p>
                  <div className="gift-panel__share">
                    <input className="input" aria-label="Friend’s code" placeholder="e.g. 3F9A21C4" value={claim} maxLength={12} onChange={(e) => setClaim(e.target.value.toUpperCase())} />
                    <button type="submit" className="btn btn--outline btn--sm" disabled={!claim.trim()}>Add</button>
                  </div>
                </form>
              ) : <p className="muted">Welcome discounts are for people who join through a friend’s link.</p>}
            </section>
          </div>
        </>
      )}
    </PortalLayout>
  );
};

export default ReferralsPage;

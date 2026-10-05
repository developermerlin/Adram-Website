import { usePageContent } from '../../content/useContent';
import { fill } from '../../content/merge';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { lmsAPI, parseApiErrors } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Spinner } from '../../components/ui/Section';
import { money } from '../../components/lms/courseUtils';
import { formatDate } from '../../utils/format';
import '../../styles/premium.css';

/** /premium: the plans, and subscribing. Single courses can still be bought on their own. */
export const PremiumPage = () => {
  const copy = usePageContent('store').premium;
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  useEffect(() => {
    lmsAPI.premium().then(({ data: d }) => setData(d)).catch(() => setData({ enabled: false, plans: [] }));
  }, [isAuthenticated]);
  if (!data) return <Spinner label="Loading Premium…" />;

  const subscribe = async (plan) => {
    if (!isAuthenticated) {
      navigate('/login', { state: { from: '/premium' } });
      return;
    }
    setBusy(plan.id);
    try {
      const { data: order } = await lmsAPI.subscribe(plan.id);
      navigate(`/orders/${order.id}`);
    } catch (err) {
      toast.error(parseApiErrors(err).detail || 'Your order could not be started.');
      setBusy(null);
    }
  };
  const monthly = data.plans.find((p) => p.interval === 'month');

  return (
    <section className="pm-page">
      <div className="container">
        <header className="pm-hero">
          <span className="pm-hero__icon" aria-hidden="true"><i className="fas fa-crown" /></span>
          <h1>{copy.title}</h1>
          <p>{fill(copy.lead, { count: data.course_count })}</p>
          {data.active_until && <p className="pm-active"><i className="fas fa-circle-check" aria-hidden="true" /> Your Premium is active until <strong>{formatDate(data.active_until)}</strong>. Paying again adds time.</p>}
        </header>
        {!data.enabled || data.plans.length === 0 ? (
          <p className="muted pm-none">{copy.unavailable} <Link to="/courses">Browse courses</Link></p>
        ) : (
          <div className="pm-plans">
            {data.plans.map((plan) => {
              const saving = plan.interval === 'year' && monthly ? Math.round(100 - (100 * Number(plan.price)) / (12 * Number(monthly.price))) : 0;
              return (
                <article key={plan.id} className={`card pm-plan${plan.interval === 'year' ? ' is-best' : ''}`}>
                  {saving > 0 && <span className="pm-plan__tag">Save {saving}%</span>}
                  <h2>{plan.name}</h2>
                  <p className="pm-plan__price"><strong>{money(plan.price)}</strong> / {plan.interval === 'year' ? 'year' : 'month'}</p>
                  {plan.description && <p className="muted">{plan.description}</p>}
                  <ul>
                    {(copy.benefits || []).filter(Boolean).map((b) => <li key={b}><i className="fas fa-check" aria-hidden="true" /> {b}</li>)}
                  </ul>
                  <button type="button" className="btn btn--premium btn--block" onClick={() => subscribe(plan)} disabled={busy !== null || (isAuthenticated && user?.role !== 'STUDENT')}>
                    {busy === plan.id && <span className="btn-spinner" />} {data.active_until ? copy.buttonRenew : copy.button}
                  </button>
                </article>
              );
            })}
          </div>
        )}
        <p className="pm-more"><Link to="/courses">{copy.more}</Link></p>
      </div>
    </section>
  );
};

export default PremiumPage;

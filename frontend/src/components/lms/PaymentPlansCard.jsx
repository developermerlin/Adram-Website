import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { lmsAPI } from '../../services/api';
import { formatDate } from '../../utils/format';
import { money } from './courseUtils';
import '../../styles/premium.css';

/** Courses being paid in parts: what's paid, and the next part (hidden when there are none). */
export const PaymentPlansCard = () => {
  const [plans, setPlans] = useState([]);
  useEffect(() => {
    lmsAPI.myInstalments().then(({ data }) => setPlans(data.filter((p) => p.status === 'active'))).catch(() => {});
  }, []);
  if (!plans.length) return null;
  return (
    <section className="card panel">
      <div className="panel__head"><h2 className="h3">Payment plans</h2></div>
      <ul className="ip-plans">
        {plans.map((p) => {
          const next = p.schedule.find((s) => s.status !== 'successful');
          return (
            <li key={p.id}>
              <div className="ip-plans__head"><Link to={`/courses/${p.course.slug}`}><strong>{p.course.title}</strong></Link><span>{p.paid_parts} of {p.parts} paid</span></div>
              <span className="lms-progress"><span style={{ width: `${(100 * p.paid_parts) / p.parts}%` }} /></span>
              {next && (
                <small className={p.locked ? 'is-late' : 'muted'}>
                  {p.locked ? 'Overdue: lessons are paused. ' : ''}Part {next.number}: {money(next.amount)}{next.due_at ? ` due ${formatDate(next.due_at)}` : ''} ·{' '}
                  <Link to={`/orders/${next.order_id}`}>{next.status === 'processing' ? 'being checked' : 'pay now'}</Link>
                </small>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default PaymentPlansCard;

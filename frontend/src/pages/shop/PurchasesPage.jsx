import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { shopAPI } from '../../services/api';
import PortalLayout from '../../components/layout/PortalLayout';
import { Alert } from '../../components/ui/Form';
import { StatusPill } from '../../components/lms/Price';
import { money } from '../../components/lms/courseUtils';
import { formatDate } from '../../utils/format';
import '../../styles/marketplace.css';
import '../../styles/shop.css';

const FILTERS = [
  ['all', 'All'],
  ['open', 'To pay or being checked'],
  ['successful', 'Paid'],
  ['refunded', 'Refunded'],
  ['cancelled', 'Cancelled'],
];
const OPEN = ['pending', 'processing', 'failed'];

// Payment status (what happened to the money) next to the order status (where the order stands).
const PAYMENT = { pending: 'Not paid', processing: 'Being checked', successful: 'Paid', failed: 'Failed', cancelled: 'Not paid', refunded: 'Refunded' };
const PAYMENT_TONE = { pending: 'pending', processing: 'processing', successful: 'successful', failed: 'failed', cancelled: 'cancelled', refunded: 'refunded' };

/** Purchase history: every order with its courses, amounts, payment and order status, invoice and receipt. */
export const PurchasesPage = () => {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    let live = true;
    shopAPI.orders().then(({ data }) => live && setOrders(data)).catch(() => live && setError('Your purchases could not be loaded. Refresh the page to try again.'));
    return () => {
      live = false;
    };
  }, []);

  const shown = (orders || []).filter((o) => (filter === 'all' ? true : filter === 'open' ? OPEN.includes(o.status) : o.status === filter));
  const spent = (orders || []).filter((o) => o.status === 'successful').reduce((n, o) => n + Number(o.total), 0);

  return (
    <PortalLayout
      title="Purchase history"
      subtitle="Your orders, receipts and invoices."
      actions={<Link to="/courses" className="btn btn--outline btn--sm"><i className="fas fa-compass" /> Browse courses</Link>}
    >
      <Alert>{error}</Alert>
      {!orders && !error && <div className="skeleton skeleton--block" />}
      {orders && orders.length === 0 && (
        <section className="card panel empty-state">
          <span className="empty-state__icon"><i className="fas fa-receipt" /></span>
          <h3>No purchases yet</h3>
          <p className="muted">When you buy a course, the order and its receipt appear here.</p>
          <Link to="/courses" className="btn btn--primary btn--sm">Find a course</Link>
        </section>
      )}
      {orders && orders.length > 0 && (
        <>
          <p className="muted">{orders.length} {orders.length === 1 ? 'order' : 'orders'} · {money(spent)} paid in total</p>
          <div className="chip-row" role="group" aria-label="Show orders">
            {FILTERS.map(([id, label]) => (
              <button key={id} type="button" className={`chip${filter === id ? ' is-active' : ''}`} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>
            ))}
          </div>
          {shown.length === 0 && <p className="muted">No orders here.</p>}
          <ul className="ph-orders">
            {shown.map((o) => (
              <li key={o.id} className="card ph-order">
                <div>
                  <div className="ph-order__top">
                    <Link to={`/orders/${o.id}`}><strong>Order {o.number}</strong></Link>
                    <StatusPill status={o.status} label={o.status_display} />
                  </div>
                  <ul className="ph-order__courses">
                    {o.items.map((i) => <li key={i.id}>{i.course_slug ? <Link to={`/courses/${i.course_slug}`}>{i.title}</Link> : i.title}</li>)}
                  </ul>
                  <div className="ph-order__meta">
                    <span>{formatDate(o.created_at)}</span>
                    <span>Price {money(o.subtotal, o.currency)}</span>
                    {Number(o.discount) > 0 && <span>Discount −{money(o.discount, o.currency)}{o.coupon ? ` (${o.coupon})` : ''}</span>}
                    <span>Payment: <StatusPill status={PAYMENT_TONE[o.status]} label={PAYMENT[o.status]} /></span>
                  </div>
                </div>
                <div className="ph-order__side">
                  <span className="ph-order__total">{money(o.total, o.currency)}</span>
                  <div className="ph-order__links">
                    {o.can_pay && <Link to={`/orders/${o.id}`} className="btn btn--primary btn--sm">Pay now</Link>}
                    <Link to={`/orders/${o.id}`} className="btn btn--outline btn--sm">Details</Link>
                    <Link to={`/orders/${o.id}/invoice`} className="btn btn--text btn--sm">{o.status === 'successful' ? 'Receipt' : 'Invoice'}</Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </PortalLayout>
  );
};

export default PurchasesPage;

import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { parseApiErrors, shopAPI } from '../../services/api';
import { Alert } from '../../components/ui/Form';
import { Spinner } from '../../components/ui/Section';
import { StatusPill } from '../../components/lms/Price';
import ConfirmDialog from '../../components/admin/ConfirmDialog';
import { money, useCourseImage } from '../../components/lms/courseUtils';
import { cartChanged } from '../../components/lms/cartStore';
import { assetUrl } from '../../utils/assets';
import { formatDateTime } from '../../utils/format';
import { NotFoundPage } from '../public/StatusPages';
import '../../styles/marketplace.css';
import '../../styles/shop.css';

const METHOD_NAMES = { afrimoney: 'Afrimoney', orange_money: 'Orange Money' };

// What each state means for the student, in one line.
const BANNERS = {
  pending: ['fa-wallet', 'Waiting for your payment', 'Send the money using the details below, then upload your receipt.'],
  processing: ['fa-hourglass-half', 'We’re checking your payment', 'ADRAM will confirm it shortly and unlock your courses. We’ll email you and notify you here.'],
  successful: ['fa-circle-check', 'Payment confirmed: you’re enrolled', 'Every lesson in these courses is now open.'],
  failed: ['fa-circle-exclamation', 'We couldn’t confirm your payment', 'Check the details and send your receipt again.'],
  cancelled: ['fa-ban', 'This order was cancelled', 'Nothing was charged. You can add the courses to your cart again at any time.'],
  refunded: ['fa-rotate-left', 'This order was refunded', 'The money was returned and the courses were removed from your learning.'],
};

const openReceipt = async (id) => {
  const tab = window.open('', '_blank');
  try {
    const { data } = await shopAPI.receipt(id);
    const url = URL.createObjectURL(data);
    if (tab) tab.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch {
    tab?.close();
    toast.error('The receipt could not be opened.');
  }
};

const PayForm = ({ order, onPaid }) => {
  const methods = order.how_to_pay?.methods || [];
  const [pay, setPay] = useState({ method: methods.length === 1 ? methods[0].id : '', transactionId: '', receipt: null });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const { data } = await shopAPI.pay(order.id, pay);
      toast.success('Receipt sent. ADRAM will confirm your payment.');
      onPaid(data);
    } catch (err) {
      setErrors(parseApiErrors(err));
    } finally {
      setBusy(false);
    }
  };
  if (!methods.length) return <Alert type="info">ADRAM hasn’t published its payment numbers yet. Please contact us to pay for this order.</Alert>;
  return (
    <>
      <h2 className="h3">How to pay {money(order.total, order.currency)}</h2>
      <ol className="order-steps">
        <li>Send <strong>{money(order.total, order.currency)}</strong> to one of these accounts:</li>
      </ol>
      <ul className="pay-methods">
        {methods.map((m) => (
          <li key={m.id}>
            <span className="pay-methods__label">{m.label}</span>
            <strong className="pay-methods__number">{m.number}</strong>
            {m.name && <small className="muted">{m.name}</small>}
          </li>
        ))}
      </ul>
      <p className="order-ref">Write your order number <strong>{order.number}</strong> in the transfer note.</p>
      {order.how_to_pay.instructions && <p className="muted small">{order.how_to_pay.instructions}</p>}
      <form onSubmit={submit} className="pay-form" noValidate>
        <h3 className="h4">Then tell us you paid</h3>
        <div className="form-row">
          <div className="field">
            <label htmlFor="method">Paid with</label>
            <select id="method" className="input" value={pay.method} onChange={(e) => setPay((p) => ({ ...p, method: e.target.value }))}>
              <option value="">Choose…</option>
              {methods.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            {errors.method && <p className="field-error">{errors.method}</p>}
          </div>
          <div className="field">
            <label htmlFor="tx">Transaction ID</label>
            <input id="tx" className="input" value={pay.transactionId} maxLength={100} onChange={(e) => setPay((p) => ({ ...p, transactionId: e.target.value }))} placeholder="From your confirmation SMS" />
            {errors.transaction_id && <p className="field-error">{errors.transaction_id}</p>}
          </div>
        </div>
        <div className="field">
          <label htmlFor="receipt">Receipt (a photo or screenshot, or a PDF)</label>
          <input id="receipt" type="file" className="input" accept="image/*,.pdf" onChange={(e) => setPay((p) => ({ ...p, receipt: e.target.files?.[0] || null }))} />
          {errors.receipt && <p className="field-error">{errors.receipt}</p>}
        </div>
        <Alert>{errors.form}</Alert>
        <button type="submit" className="btn btn--primary" disabled={busy || !pay.method || !pay.transactionId.trim() || !pay.receipt}>
          {busy ? <span className="btn-spinner" /> : <i className="fas fa-paper-plane" />} Send receipt
        </button>
      </form>
    </>
  );
};

/** One order: where it stands, how to pay it, and its receipt and invoice. */
export const OrderPage = () => {
  const { id } = useParams();
  const imageOf = useCourseImage();
  const [state, setState] = useState({ order: null, missing: false });
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(() => shopAPI.order(id).then(({ data }) => setState({ order: data, missing: false })).catch(() => setState({ order: null, missing: true })), [id]);
  useEffect(() => {
    load();
  }, [load]);

  const { order, missing } = state;
  if (missing) return <NotFoundPage />;
  if (!order) return <Spinner label="Loading your order…" />;

  const [icon, heading, lead] = BANNERS[order.status] || BANNERS.pending;
  const cancel = async () => {
    try {
      const { data } = await shopAPI.cancel(order.id);
      setState({ order: data, missing: false });
      toast.success('Order cancelled');
      cartChanged();
    } catch (err) {
      toast.error(parseApiErrors(err).form || 'The order could not be cancelled.');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="shop container">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <span className="breadcrumb__item"><span aria-hidden="true">/</span><Link to="/student/purchases">Purchase history</Link></span>
        <span className="breadcrumb__item"><span aria-hidden="true">/</span><span>{order.number}</span></span>
      </nav>
      <div className="order-head">
        <h1 className="shop__title">Order {order.number}</h1>
        <StatusPill status={order.status} label={order.status_display} />
      </div>

      <div className={`order-banner order-banner--${order.status}`} role="status">
        <i className={`fas ${icon}`} aria-hidden="true" />
        <div>
          <strong>{heading}</strong>
          <p>{lead}</p>
          {order.status === 'failed' && order.decision_note && <p className="order-banner__note">Message from ADRAM: {order.decision_note}</p>}
          {order.status === 'refunded' && order.refund_reason && <p className="order-banner__note">Reason: {order.refund_reason}</p>}
        </div>
      </div>

      <div className="shop-grid">
        <div className="order-main">
          {order.can_pay && <section className="card order-pay"><PayForm order={order} onPaid={(data) => setState({ order: data, missing: false })} /></section>}
          {order.status === 'processing' && (
            <section className="card">
              <h2 className="h3">Payment sent</h2>
              <p className="muted">
                {METHOD_NAMES[order.method] || order.method} · transaction <strong>{order.transaction_id}</strong>
                {order.submitted_at && ` · ${formatDateTime(order.submitted_at)}`}
              </p>
              {order.has_receipt && <button type="button" className="btn btn--outline btn--sm" onClick={() => openReceipt(order.id)}><i className="fas fa-file-image" /> View my receipt</button>}
            </section>
          )}

          <section className="card">
            <h2 className="h3">{order.items.length === 1 ? 'Course' : `Courses (${order.items.length})`}</h2>
            <ul className="order-items">
              {order.items.map((item) => {
                const image = item.course_slug ? imageOf({ slug: item.course_slug, thumbnail: item.thumbnail }) : '';
                return (
                  <li key={item.id}>
                    <span className="order-items__thumb">{image ? <img src={assetUrl(image)} alt="" loading="lazy" /> : <i className="fas fa-graduation-cap" aria-hidden="true" />}</span>
                    <span className="order-items__title">
                      {item.course_slug ? <Link to={`/courses/${item.course_slug}`}>{item.title}</Link> : item.title}
                      {Number(item.discount) > 0 && <small className="shop-off">Coupon −{money(item.discount)}</small>}
                    </span>
                    <strong>{money(item.amount, order.currency)}</strong>
                    {order.status === 'successful' && item.course_slug && <Link to={`/courses/${item.course_slug}`} className="btn btn--primary btn--sm">Start learning</Link>}
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <aside className="card shop-summary" aria-label="Order summary">
          <h2>Summary</h2>
          <dl className="shop-lines">
            <div><dt>Subtotal</dt><dd>{money(order.subtotal, order.currency)}</dd></div>
            {Number(order.discount) > 0 && <div className="shop-lines__off"><dt>Discount{order.coupon ? ` (${order.coupon})` : ''}</dt><dd>−{money(order.discount, order.currency)}</dd></div>}
            <div className="shop-lines__total"><dt>Total</dt><dd>{money(order.total, order.currency)}</dd></div>
          </dl>
          <dl className="order-facts">
            <div><dt>Placed</dt><dd>{formatDateTime(order.created_at)}</dd></div>
            {order.paid_at && <div><dt>Paid</dt><dd>{formatDateTime(order.paid_at)}</dd></div>}
            {order.refunded_at && <div><dt>Refunded</dt><dd>{formatDateTime(order.refunded_at)}</dd></div>}
            <div><dt>Payment</dt><dd>{order.method ? METHOD_NAMES[order.method] || order.method : order.provider_label}</dd></div>
          </dl>
          <div className="order-actions">
            <Link to={`/orders/${order.id}/invoice`} className="btn btn--outline btn--block"><i className="fas fa-file-invoice" /> {order.status === 'successful' ? 'Receipt / invoice' : 'View invoice'}</Link>
            {order.has_receipt && order.status !== 'processing' && <button type="button" className="btn btn--text btn--block" onClick={() => openReceipt(order.id)}>View my uploaded receipt</button>}
            {order.can_cancel && <button type="button" className="btn btn--text btn--block" onClick={() => setCancelling(true)}>Cancel this order</button>}
          </div>
        </aside>
      </div>

      {cancelling && (
        <ConfirmDialog
          config={{ title: 'Cancel this order?', text: 'Only cancel if you haven’t sent any money yet. You can buy the courses again later.', confirm: 'Cancel order' }}
          onClose={() => setCancelling(false)}
          onConfirm={cancel}
        />
      )}
    </div>
  );
};

export default OrderPage;

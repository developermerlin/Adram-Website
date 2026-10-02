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
import HowToPay from '../../components/payments/HowToPay';
import { kindOf, METHOD_LABELS, PROOF } from '../../config/payments';
import { NotFoundPage } from '../public/StatusPages';
import '../../styles/marketplace.css';
import '../../styles/shop.css';
import '../../styles/bundles.css';

const METHOD_NAMES = METHOD_LABELS;

// What each state means for the student, in one line.
const BANNERS = {
  pending: ['fa-wallet', 'Waiting for your payment', 'Choose Orange Money, Afrimoney or card below, pay, then send us your proof.'],
  processing: ['fa-hourglass-half', 'We’re checking your payment', 'ADRAM will confirm it shortly and unlock your courses. We’ll email you and notify you here.'],
  successful: ['fa-circle-check', 'Payment confirmed: you’re enrolled', 'Every lesson in these courses is now open.'],
  failed: ['fa-circle-exclamation', 'We couldn’t confirm your payment', 'Read ADRAM’s message, then send your proof again below.'],
  cancelled: ['fa-ban', 'This order was cancelled', 'Nothing was charged. You can add the courses to your cart again at any time.'],
  refunded: ['fa-rotate-left', 'This order was refunded', 'The money was returned and the courses were removed from your learning.'],
};
// The same, for a course bought as a gift
const GIFT_BANNERS = {
  processing: ['fa-hourglass-half', 'We’re checking your payment', 'Once ADRAM confirms it, we email your gift straight away.'],
  successful: ['fa-gift', 'Your gift has been sent', 'We emailed them a link to start learning. You can also share the gift code below.'],
  refunded: ['fa-rotate-left', 'This gift was refunded', 'The money was returned and the gift can no longer be used.'],
};

/** For the buyer of a gift: who it's for, the message, and (once paid) the code and link to share. */
const GiftPanel = ({ gift }) => {
  const link = gift.code ? `${window.location.origin}/gift/${gift.code}` : '';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Gift link copied');
    } catch {
      toast.error('Copy the link by hand instead.');
    }
  };
  return (
    <section className="card gift-panel">
      <h2 className="h3"><i className="fas fa-gift" aria-hidden="true" /> A gift for {gift.recipient_name}</h2>
      <p className="muted">{gift.recipient_email}</p>
      {gift.message && <blockquote className="gift-card__message">“{gift.message}”</blockquote>}
      {gift.revoked ? <p className="gift-card__status is-bad">This gift was cancelled.</p>
        : gift.redeemed_at ? <p className="gift-card__status is-good"><i className="fas fa-circle-check" aria-hidden="true" /> {gift.recipient_name} opened it on {formatDateTime(gift.redeemed_at)}.</p>
          : gift.code ? (
            <>
              <p>Gift code <strong className="gift-panel__code">{gift.code}</strong></p>
              <div className="gift-panel__share">
                <input className="input" readOnly value={link} aria-label="Gift link" onFocus={(e) => e.target.select()} />
                <button type="button" className="btn btn--outline btn--sm" onClick={copy}><i className="fas fa-link" /> Copy link</button>
              </div>
            </>
          ) : <p className="muted small">The gift code appears here once your payment is confirmed.</p>}
    </section>
  );
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
  const [pay, setPay] = useState({ method: methods.length === 1 ? methods[0].id : '', transactionId: '', payer: '', receipt: null });
  const proof = PROOF[kindOf(methods, pay.method)];
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
  if (!methods.length) return <Alert type="info">ADRAM hasn’t published its payment details yet. Please <Link to="/contact?subject=Course%20payment">contact us</Link> to pay for this order.</Alert>;
  return (
    <>
      <h2 className="h3">How to pay {money(order.total, order.currency)}</h2>
      <HowToPay methods={methods} amount={money(order.total, order.currency)} reference={order.number} selected={pay.method}
        onSelect={(method) => setPay((p) => ({ ...p, method }))} note={order.how_to_pay.instructions} />
      {errors.method && <p className="field-error">{errors.method}</p>}
      {pay.method && (
      <form onSubmit={submit} className="pay-form" noValidate>
        <h3 className="h4">After paying, send us your proof</h3>
        <div className="form-row">
          <div className="field">
            <label htmlFor="tx">{proof.transaction}</label>
            <input id="tx" className="input" value={pay.transactionId} maxLength={100} onChange={(e) => setPay((p) => ({ ...p, transactionId: e.target.value }))} placeholder={proof.transactionHint} />
            {errors.transaction_id && <p className="field-error">{errors.transaction_id}</p>}
          </div>
          <div className="field">
            <label htmlFor="payer">{proof.payer} <span className="optional">(helps us find it)</span></label>
            <input id="payer" className="input" value={pay.payer} maxLength={100} onChange={(e) => setPay((p) => ({ ...p, payer: e.target.value }))} placeholder={proof.payerHint} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="receipt">{proof.receipt}</label>
          <input id="receipt" type="file" className="input" accept="image/*,.pdf" onChange={(e) => setPay((p) => ({ ...p, receipt: e.target.files?.[0] || null }))} />
          {errors.receipt && <p className="field-error">{errors.receipt}</p>}
        </div>
        <Alert>{errors.form}</Alert>
        <button type="submit" className="btn btn--primary" disabled={busy || !pay.method || !pay.transactionId.trim() || !pay.receipt}>
          {busy ? <span className="btn-spinner" /> : <i className="fas fa-paper-plane" />} Send my proof of payment
        </button>
      </form>
      )}
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

  const [icon, heading, lead] = (order.gift && GIFT_BANNERS[order.status]) || BANNERS[order.status] || BANNERS.pending;
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
                {order.method_label || METHOD_NAMES[order.method] || order.method} · reference <strong>{order.transaction_id}</strong>{order.payer ? ` · ${order.payer}` : ''}
                {order.submitted_at && ` · ${formatDateTime(order.submitted_at)}`}
              </p>
              {order.has_receipt && <button type="button" className="btn btn--outline btn--sm" onClick={() => openReceipt(order.id)}><i className="fas fa-file-image" /> View my receipt</button>}
            </section>
          )}

          {order.gift && <GiftPanel gift={order.gift} />}

          <section className="card">
            <h2 className="h3">{order.plan ? <><i className="fas fa-crown" aria-hidden="true" /> {order.plan.name}</> : order.bundle ? <>Bundle: <Link to={`/bundles/${order.bundle.slug}`}>{order.bundle.title}</Link></> : order.items.length === 1 ? 'Course' : `Courses (${order.items.length})`}</h2>
            {order.plan && <p className="muted">{order.plan.days} days of Premium: every Premium course is open while it lasts. Paying adds the time after any you already have.</p>}
            {order.instalment && <p className="muted">Part {order.instalment.number} of {order.instalment.parts}{order.instalment.due_at ? ` · due ${formatDateTime(order.instalment.due_at)}` : ''}. {order.instalment.number === 1 ? 'The course opens when this part is confirmed.' : 'Pay it on time to keep the lessons open.'}</p>}
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
                    {order.status === 'successful' && !order.gift && item.course_slug && <Link to={`/courses/${item.course_slug}`} className="btn btn--primary btn--sm">Start learning</Link>}
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

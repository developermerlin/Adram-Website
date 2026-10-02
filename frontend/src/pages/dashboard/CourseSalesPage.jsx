import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { catalogAPI, lmsAdminAPI, parseApiErrors } from '../../services/api';
import PortalLayout from '../../components/layout/PortalLayout';
import { Alert, TextField } from '../../components/ui/Form';
import ConfirmDialog from '../../components/admin/ConfirmDialog';
import { ImageField } from '../../components/admin/contentFields';
import NoteDialog from '../../components/lms/NoteDialog';
import FlashSalesPanel from '../../components/lms/FlashSalesPanel';
import BundlesPanel from '../../components/lms/BundlesPanel';
import ReferralsPanel from '../../components/lms/ReferralsPanel';
import AffiliatesPanel from '../../components/lms/AffiliatesPanel';
import PremiumPanel from '../../components/lms/PremiumPanel';
import WithdrawalQueue from '../../components/admin/WithdrawalQueue';
import { StatusPill } from '../../components/lms/Price';
import { money } from '../../components/lms/courseUtils';
import { formatDate, formatDateTime } from '../../utils/format';
import '../../styles/marketplace.css';
import '../../styles/lms-admin.css';
import '../../styles/payments.css';

const STATUSES = [['processing', 'To check'], ['pending', 'Awaiting payment'], ['successful', 'Paid'], ['failed', 'Failed'], ['cancelled', 'Cancelled'], ['refunded', 'Refunded'], ['', 'All']];
const METHOD_NAMES = { afrimoney: 'Afrimoney', orange_money: 'Orange Money', card: 'Card' };
// Ready-made messages when a payment can't be confirmed (the admin can edit them)
const REJECT_REASONS = [
  'We couldn’t find this transaction ID. Please check it and send it again.',
  'The amount received doesn’t match the order total. Please pay the difference or contact us.',
  'The receipt isn’t clear enough to read. Please upload a clearer screenshot or photo.',
  'This transaction ID was already used for another order.',
  'The payment hasn’t reached our account yet. Please send your proof again once it has.',
];

const openReceipt = async (id) => {
  const tab = window.open('', '_blank');
  try {
    const { data } = await lmsAdminAPI.receipt(id);
    const url = URL.createObjectURL(data);
    if (tab) tab.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch {
    tab?.close();
    toast.error('The receipt could not be opened.');
  }
};

// ---------------------------------------------------------------- orders

const OrderDrawer = ({ id, onClose, onChanged }) => {
  const [order, setOrder] = useState(null);
  const [dialog, setDialog] = useState(null); // 'reject' | 'refund' | 'confirm'
  const load = useCallback(() => lmsAdminAPI.order(id).then(({ data }) => setOrder(data)).catch(() => setOrder(false)), [id]);
  useEffect(() => {
    load();
  }, [load]);

  const decide = async (action, note = '') => {
    try {
      if (action === 'refund') await lmsAdminAPI.refundOrder(id, note);
      else await lmsAdminAPI.decideOrder(id, action, note);
      toast.success({ confirm: 'Payment confirmed: the student is enrolled.', reject: 'Payment rejected. The student has been told.', refund: 'Order refunded.' }[action]);
      setDialog(null);
      await load();
      onChanged();
    } catch (err) {
      throw new Error(parseApiErrors(err).form || 'That did not work.', { cause: err });
    }
  };

  return (
    <div className="drawer la-drawer" role="dialog" aria-modal="true" aria-label="Order details">
      <button type="button" className="drawer__backdrop" aria-label="Close" onClick={onClose} />
      <aside className="drawer__panel">
        <div className="drawer__head">
          <h2>{order ? `Order ${order.number}` : 'Order'}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><i className="fas fa-xmark" /></button>
        </div>
        {order === null && <div className="skeleton skeleton--block" />}
        {order === false && <Alert>This order could not be loaded.</Alert>}
        {order && (
          <>
            <div className="drawer__body">
              <section>
                <StatusPill status={order.status} label={order.status_display} />
                <p className="la-meta">
                  <span><i className="fas fa-user" />{order.student.name} · {order.student.email}</span>
                  <span><i className="far fa-clock" />Placed {formatDateTime(order.created_at)}</span>
                  {order.paid_at && <span><i className="fas fa-circle-check" />Paid {formatDateTime(order.paid_at)}{order.verified_by ? ` (confirmed by ${order.verified_by})` : ''}</span>}
                </p>
                {order.decision_note && <p className="la-note la-note--warn">Note to the student: {order.decision_note}</p>}
                {order.refund_reason && <p className="la-note la-note--warn">Refund reason: {order.refund_reason}</p>}
              </section>
              <section>
                <h3 className="h4">Courses</h3>
                <ul className="la-order__items">
                  {order.items.map((i) => (
                    <li key={i.id}><span>{i.title}{Number(i.discount) > 0 && <small className="muted"> (−{money(i.discount)})</small>}</span><strong>{money(i.amount)}</strong></li>
                  ))}
                </ul>
                <dl className="la-totals">
                  <div><dt>Subtotal</dt><dd>{money(order.subtotal)}</dd></div>
                  {Number(order.discount) > 0 && <div><dt>Discount{order.coupon ? ` (${order.coupon})` : ''}</dt><dd>−{money(order.discount)}</dd></div>}
                  <div><dt>Total</dt><dd>{money(order.total)}</dd></div>
                </dl>
              </section>
              <section>
                <h3 className="h4">Payment</h3>
                {order.method ? (
                  <div className="pay-check">
                    <p><strong>{order.method_label || METHOD_NAMES[order.method] || order.method}</strong> · expected <strong>{money(order.total)}</strong></p>
                    <p>{order.method === 'card' ? 'Reference / approval code' : 'Transaction ID'}: <strong className="la-mono">{order.transaction_id}</strong></p>
                    {order.payer && <p>{order.method === 'card' ? 'Name on card' : 'Paid from'}: <strong>{order.payer}</strong></p>}
                    {order.submitted_at && <p className="muted small">Sent {formatDateTime(order.submitted_at)}</p>}
                    {order.same_transaction?.length > 0 && (
                      <p className="pay-check__dup" role="alert">
                        <i className="fas fa-triangle-exclamation" /> This transaction ID was also used for{' '}
                        {order.same_transaction.map((o) => `${o.number} (${o.student}, ${o.status})`).join(', ')}. Check before confirming.
                      </p>
                    )}
                  </div>
                ) : <p className="muted">{order.provider === 'free' ? 'Nothing to pay (free / 100% coupon).' : 'No payment sent yet.'}</p>}
                {order.has_receipt && <button type="button" className="btn btn--outline btn--sm" onClick={() => openReceipt(order.id)}><i className="fas fa-file-image" /> View the receipt</button>}
                {order.transactions.length > 0 && (
                  <div className="table-scroll">
                    <table className="table">
                      <thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Status</th><th>Reference</th></tr></thead>
                      <tbody>{order.transactions.map((t) => <tr key={t.id}><td>{formatDateTime(t.created_at)}</td><td>{t.kind}</td><td>{money(t.amount)}</td><td>{t.status}</td><td className="la-mono">{t.reference || '—'}</td></tr>)}</tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
            <div className="la-drawer__foot">
              {['pending', 'processing', 'failed'].includes(order.status) && (
                <>
                  <button type="button" className="btn btn--primary" onClick={() => setDialog('confirm')}><i className="fas fa-check" /> Confirm payment</button>
                  {order.status !== 'failed' && <button type="button" className="btn btn--outline" onClick={() => setDialog('reject')}><i className="fas fa-xmark" /> Reject</button>}
                </>
              )}
              {order.status === 'successful' && Number(order.total) >= 0 && <button type="button" className="btn btn--danger-outline" onClick={() => setDialog('refund')}><i className="fas fa-rotate-left" /> Refund</button>}
              <a href={`/orders/${order.id}/invoice`} target="_blank" rel="noreferrer" className="btn btn--text">Invoice</a>
            </div>
          </>
        )}
      </aside>
      {dialog === 'confirm' && (
        <ConfirmDialog config={{ title: 'Confirm this payment?', text: `${money(order.total)} from ${order.student.name}. Their courses unlock straight away.`, confirm: 'Confirm payment' }}
          onClose={() => setDialog(null)} onConfirm={() => decide('confirm').catch((e) => toast.error(e.message))} />
      )}
      {dialog === 'reject' && (
        <NoteDialog title="Reject this payment" text="Tell the student what was wrong so they can send the receipt again." label="Message to the student" required
          confirm="Reject payment" tone="danger" suggestions={REJECT_REASONS} onConfirm={(note) => decide('reject', note)} onClose={() => setDialog(null)} />
      )}
      {dialog === 'refund' && (
        <NoteDialog title="Refund this order" text={`Record that ${money(order.total)} was returned to ${order.student.name}. Their access to these courses is removed.`} label="Reason"
          required confirm="Refund order" tone="danger" onConfirm={(note) => decide('refund', note)} onClose={() => setDialog(null)} />
      )}
    </div>
  );
};

const Orders = () => {
  const [status, setStatus] = useState('processing');
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);
  const load = useCallback(() => lmsAdminAPI.orders({ ...(status ? { status } : {}), ...(q.trim() ? { q: q.trim() } : {}) })
    .then(({ data: d }) => setData(d)).catch(() => setData({ error: true })), [status, q]);
  useEffect(() => {
    load();
  }, [load]);
  const total = data?.counts ? Object.values(data.counts).reduce((a, b) => a + b, 0) : 0;

  return (
    <>
      {data?.counts && (
        <div className="la-summary">
          <div className="card"><small className="muted">Revenue (paid orders)</small><strong>{money(data.revenue)}</strong></div>
          <div className="card"><small className="muted">Refunded</small><strong>{money(data.refunded)}</strong></div>
          <div className="card"><small className="muted">Payments to check</small><strong>{data.counts.processing}</strong></div>
          <div className="card"><small className="muted">Orders</small><strong>{total}</strong></div>
        </div>
      )}
      <div className="la-toolbar">
        <div className="chip-row" role="group" aria-label="Order status">
          {STATUSES.map(([id, label]) => (
            <button key={id || 'all'} type="button" className={`chip${status === id ? ' is-active' : ''}`} aria-pressed={status === id} onClick={() => setStatus(id)}>
              {label}{data?.counts && id ? ` (${data.counts[id]})` : ''}
            </button>
          ))}
        </div>
        <label className="input-icon"><i className="fas fa-magnifying-glass" aria-hidden="true" /><input type="search" className="input" placeholder="Order, student, course or transaction" aria-label="Search orders" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      </div>
      {data?.error && <Alert>The orders could not be loaded.</Alert>}
      <section className="card table-card">
        {!data ? <div className="skeleton skeleton--block" /> : data.orders?.length === 0 ? <div className="la-empty"><i className="fas fa-receipt" /><strong>No orders here</strong></div> : (
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Order</th><th>Student</th><th>Courses</th><th>Total</th><th>Payment</th><th>Date</th><th>Status</th></tr></thead>
              <tbody>
                {data.orders?.map((o) => (
                  <tr key={o.id} className="is-clickable" onClick={() => setOpen(o.id)}>
                    <td><button type="button" className="la-rowlink" onClick={(e) => { e.stopPropagation(); setOpen(o.id); }}>{o.number}</button></td>
                    <td>{o.student.name}<br /><small className="muted">{o.student.email}</small></td>
                    <td>{o.items.map((i) => i.title).join(', ')}</td>
                    <td><strong>{money(o.total)}</strong>{o.coupon && <><br /><small className="muted">code {o.coupon}</small></>}</td>
                    <td>{o.method ? <>{METHOD_NAMES[o.method] || o.method}<br /><small className="la-mono muted">{o.transaction_id}</small></> : <span className="muted">—</span>}</td>
                    <td>{formatDate(o.submitted_at || o.created_at)}</td>
                    <td><StatusPill status={o.status} label={o.status_display} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {open && <OrderDrawer id={open} onClose={() => setOpen(null)} onChanged={load} />}
    </>
  );
};

// ---------------------------------------------------------------- coupons

const BLANK = { id: null, code: '', description: '', kind: 'percent', value: '', courses: [], max_uses: '', per_user_limit: 1, min_purchase: '0', starts_at: '', ends_at: '', is_active: true, notify_students: false };
const toLocal = (iso) => (iso ? iso.slice(0, 16) : '');

const Coupons = () => {
  const [coupons, setCoupons] = useState(null);
  const [courses, setCourses] = useState([]);
  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [deleting, setDeleting] = useState(null);
  const load = useCallback(() => lmsAdminAPI.coupons().then(({ data }) => setCoupons(data)).catch(() => setCoupons([])), []);
  useEffect(() => {
    load();
    let live = true;
    catalogAPI.manage('courses').list().then(({ data }) => live && setCourses(data)).catch(() => {});
    return () => {
      live = false;
    };
  }, [load]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const toggleCourse = (slug) => setForm((f) => ({ ...f, courses: f.courses.includes(slug) ? f.courses.filter((s) => s !== slug) : [...f.courses, slug] }));
  const save = async (e) => {
    e.preventDefault();
    const body = {
      code: form.code, description: form.description, kind: form.kind, value: form.value, courses: form.courses, is_active: form.is_active,
      max_uses: form.max_uses === '' ? null : Number(form.max_uses), per_user_limit: Number(form.per_user_limit) || 0,
      min_purchase: form.min_purchase || '0',
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null, ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      ...(form.id ? {} : { notify_students: form.notify_students }),
    };
    try {
      await lmsAdminAPI.saveCoupon(form.id, body);
      toast.success('Coupon saved');
      setForm(BLANK);
      setErrors({});
      load();
    } catch (err) {
      setErrors(parseApiErrors(err));
    }
  };
  const remove = async () => {
    await lmsAdminAPI.removeCoupon(deleting.id).catch(() => toast.error('The coupon could not be deleted.'));
    setDeleting(null);
    load();
  };
  const describe = (c) => {
    const bits = [c.kind === 'percent' ? `${Number(c.value)}% off` : `${money(c.value)} off`];
    bits.push(c.course_titles.length ? c.course_titles.join(', ') : 'any course');
    if (Number(c.min_purchase) > 0) bits.push(`min. ${money(c.min_purchase)}`);
    bits.push(`used ${c.uses}${c.max_uses ? ` of ${c.max_uses}` : ''}`);
    if (c.per_user_limit) bits.push(`${c.per_user_limit} per student`);
    if (c.ends_at) bits.push(`until ${formatDate(c.ends_at)}`);
    return bits.join(' · ');
  };

  return (
    <div className="la-split">
      <form className="card panel la-form" onSubmit={save} noValidate>
        <h2 className="h3">{form.id ? `Edit ${form.code}` : 'New coupon'}</h2>
        <div className="form-row">
          <TextField label="Code" maxLength={40} placeholder="WELCOME20" name="code" value={form.code} error={errors.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} />
          <TextField label="Description (for you)" maxLength={200} name="description" value={form.description} onChange={set('description')} />
        </div>
        <div className="form-row">
          <div className="field">
            <label htmlFor="cp-kind">Type</label>
            <select id="cp-kind" className="input" value={form.kind} onChange={set('kind')}><option value="percent">Percentage off</option><option value="amount">Fixed amount off (NLe)</option></select>
          </div>
          <TextField label={form.kind === 'percent' ? 'Percent (1–100)' : 'Amount (NLe)'} inputMode="decimal" name="value" value={form.value} error={errors.value} onChange={set('value')} />
        </div>
        <div className="form-row">
          <TextField label="Starts (optional)" type="datetime-local" name="starts_at" value={form.starts_at} onChange={set('starts_at')} />
          <TextField label="Expires (optional)" type="datetime-local" name="ends_at" value={form.ends_at} error={errors.ends_at} onChange={set('ends_at')} />
        </div>
        <div className="form-row">
          <TextField label="Total uses (empty = unlimited)" type="number" min="1" name="max_uses" value={form.max_uses} onChange={set('max_uses')} />
          <TextField label="Uses per student (0 = unlimited)" type="number" min="0" name="per_user_limit" value={form.per_user_limit} onChange={set('per_user_limit')} />
          <TextField label="Minimum purchase (NLe)" inputMode="decimal" name="min_purchase" value={form.min_purchase} error={errors.min_purchase} onChange={set('min_purchase')} />
        </div>
        <div className="field">
          <span className="field__label">Only for these courses <span className="optional">(none ticked = every course)</span></span>
          <div className="la-multi">
            {courses.map((c) => <label key={c.slug}><input type="checkbox" checked={form.courses.includes(c.slug)} onChange={() => toggleCourse(c.slug)} /> {c.title}</label>)}
          </div>
          {errors.courses && <p className="field-error">{errors.courses}</p>}
        </div>
        <label className="la-inline-check"><input type="checkbox" checked={form.is_active} onChange={set('is_active')} /> Active</label>
        {!form.id && <label className="la-inline-check"><input type="checkbox" checked={form.notify_students} onChange={set('notify_students')} /> Tell every student about this code (notification)</label>}
        <Alert>{errors.form}</Alert>
        <div className="la-form__actions">
          <button type="submit" className="btn btn--primary" disabled={!form.code.trim() || !form.value}>Save coupon</button>
          {form.id && <button type="button" className="btn btn--text" onClick={() => setForm(BLANK)}>Cancel</button>}
        </div>
      </form>
      <section className="card">
        {!coupons ? <div className="skeleton skeleton--block" /> : coupons.length === 0 ? <div className="la-empty"><i className="fas fa-ticket" /><strong>No coupons yet</strong><p>Create a code students can enter in their cart.</p></div> : (
          <ul className="la-cards">
            {coupons.map((c) => (
              <li key={c.id} className="la-card">
                <div>
                  <div className="la-card__head"><strong className="la-mono">{c.code}</strong>{!c.is_active && <span className="badge badge--gray">Off</span>}</div>
                  {c.description && <p className="muted small">{c.description}</p>}
                  <p className="la-meta">{describe(c)}</p>
                </div>
                <div className="la-card__side la-actions">
                  <button type="button" className="btn btn--outline btn--sm" onClick={() => setForm({ ...BLANK, ...c, max_uses: c.max_uses ?? '', starts_at: toLocal(c.starts_at), ends_at: toLocal(c.ends_at) })}>Edit</button>
                  <button type="button" className="icon-btn icon-btn--danger" aria-label={`Delete ${c.code}`} onClick={() => setDeleting(c)}><i className="fas fa-trash-can" /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {deleting && <ConfirmDialog config={{ title: `Delete ${deleting.code}?`, text: 'Orders that already used it keep their discount.', confirm: 'Delete' }} onClose={() => setDeleting(null)} onConfirm={remove} />}
    </div>
  );
};

// ---------------------------------------------------------------- earnings and payouts

const Earnings = () => {
  const [data, setData] = useState(null);
  const [payouts, setPayouts] = useState([]);
  const [form, setForm] = useState({ instructor: '', amount: '', method: '', reference: '', note: '' });
  const [errors, setErrors] = useState({});
  const load = useCallback(() => {
    lmsAdminAPI.earnings().then(({ data: d }) => setData(d)).catch(() => setData({ instructors: [], error: true }));
    lmsAdminAPI.payouts().then(({ data: d }) => setPayouts(d)).catch(() => {});
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const pay = async (e) => {
    e.preventDefault();
    try {
      await lmsAdminAPI.addPayout(form);
      toast.success('Payout recorded. The instructor has been notified.');
      setForm({ instructor: '', amount: '', method: '', reference: '', note: '' });
      setErrors({});
      load();
    } catch (err) {
      setErrors(parseApiErrors(err));
    }
  };

  return (
    <div className="la-page">
      {data && <p className="muted">The platform keeps {Number(data.commission_percent)}% of each instructor sale (change it under Settings). Courses without an instructor account earn the platform everything.</p>}
      <WithdrawalQueue onChanged={load} />
      <section className="card table-card">
        <div className="table-card__head"><div><h2 className="h3">Instructor earnings</h2></div></div>
        {!data ? <div className="skeleton skeleton--block" /> : data.instructors.length === 0 ? <div className="la-empty"><i className="fas fa-wallet" /><strong>No instructors yet</strong><p>Give a user the Instructor role under Users.</p></div> : (
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Instructor</th><th>Sales</th><th>Gross</th><th>Commission</th><th>Refunds</th><th>Net</th><th>Paid</th><th>Pending</th><th /></tr></thead>
              <tbody>
                {data.instructors.map((i) => (
                  <tr key={i.id}>
                    <td><strong>{i.name}</strong><br /><small className="muted">{i.email}</small></td>
                    <td>{i.sales}</td><td>{money(i.gross)}</td><td>{money(i.commission)}</td><td>{money(i.refunds)}</td>
                    <td><strong>{money(i.net)}</strong></td><td>{money(i.paid)}</td><td><strong>{money(i.pending)}</strong><br /><small className="muted">{money(i.available)} available</small></td>
                    <td>{Number(i.pending) > 0 && <button type="button" className="btn btn--outline btn--sm" onClick={() => setForm((f) => ({ ...f, instructor: String(i.id), amount: i.pending }))}>Pay</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <div className="la-split">
        <form className="card panel la-form" onSubmit={pay} noValidate>
          <h2 className="h3">Record a payout</h2>
          <p className="muted small">After you send an instructor their money, record it here.</p>
          <div className="field">
            <label htmlFor="po-who">Instructor</label>
            <select id="po-who" className="input" value={form.instructor} onChange={set('instructor')}>
              <option value="">Choose…</option>
              {(data?.instructors || []).map((i) => <option key={i.id} value={i.id}>{i.name} (pending {money(i.pending)})</option>)}
            </select>
            {errors.instructor && <p className="field-error">{errors.instructor}</p>}
          </div>
          <div className="form-row">
            <TextField label="Amount (NLe)" inputMode="decimal" name="amount" value={form.amount} error={errors.amount} onChange={set('amount')} />
            <TextField label="Method" placeholder="e.g. Orange Money" name="method" value={form.method} onChange={set('method')} />
          </div>
          <TextField label="Reference" name="reference" value={form.reference} onChange={set('reference')} />
          <TextField label="Note" name="note" value={form.note} onChange={set('note')} />
          <Alert>{errors.form}</Alert>
          <div className="la-form__actions"><button type="submit" className="btn btn--primary" disabled={!form.instructor || !form.amount}>Record payout</button></div>
        </form>
        <section className="card table-card">
          <div className="table-card__head"><div><h2 className="h3">Payout history</h2></div></div>
          {payouts.length === 0 ? <p className="muted la-empty">No payouts yet.</p> : (
            <div className="table-scroll">
              <table className="table">
                <thead><tr><th>Date</th><th>Instructor</th><th>Amount</th><th>Method</th><th>Reference</th></tr></thead>
                <tbody>{payouts.map((p) => <tr key={p.id}><td>{formatDate(p.paid_at)}</td><td>{p.instructor.name}</td><td><strong>{money(p.amount)}</strong></td><td>{p.method || '—'}</td><td>{p.reference || p.note || '—'}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- settings

const Settings = () => {
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let live = true;
    lmsAdminAPI.settings().then(({ data }) => live && setForm(data)).catch(() => live && setErrors({ form: 'The settings could not be loaded.' }));
    return () => {
      live = false;
    };
  }, []);
  if (!form) return errors.form ? <Alert>{errors.form}</Alert> : <div className="skeleton skeleton--block" />;
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await lmsAdminAPI.saveSettings(form);
      setForm(data);
      setErrors({});
      toast.success('Settings saved');
    } catch (err) {
      setErrors(parseApiErrors(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <form className="card panel la-form la-settings" onSubmit={save} noValidate>
      <h2 className="h3">Marketplace settings</h2>
      <TextField label="Platform commission (%)" inputMode="decimal" hint="The platform keeps this share of each instructor sale; the instructor earns the rest. Changes apply to new orders." name="commission_percent" value={form.commission_percent} error={errors.commission_percent} onChange={(e) => set('commission_percent')(e.target.value)} />
      <h3 className="h4">Instructor withdrawals</h3>
      <div className="form-row">
        <TextField label="Hold new earnings for (days)" type="number" min="0" hint="Sales this recent can't be withdrawn yet, in case they're refunded." name="payout_hold_days" value={form.payout_hold_days} error={errors.payout_hold_days} onChange={(e) => set('payout_hold_days')(e.target.value)} />
        <TextField label="Minimum withdrawal (NLe)" inputMode="decimal" name="min_withdrawal" value={form.min_withdrawal} error={errors.min_withdrawal} onChange={(e) => set('min_withdrawal')(e.target.value)} />
      </div>
      <h3 className="h4">Inviting friends</h3>
      <label className="checkbox lb-inline-check">
        <input type="checkbox" checked={Boolean(form.referrals_enabled)} onChange={(e) => set('referrals_enabled')(e.target.checked)} />
        <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span>
        <span>Students can invite friends<small>A friend who joins through a student’s link gets a welcome discount; the student is rewarded after the friend’s first purchase.</small></span>
      </label>
      <div className="form-row">
        <TextField label="Friend’s welcome discount (%)" type="number" min="0" max="100" name="referral_friend_percent" value={form.referral_friend_percent} error={errors.referral_friend_percent} onChange={(e) => set('referral_friend_percent')(e.target.value)} />
        <TextField label="Reward for inviting (%)" type="number" min="0" max="100" name="referral_reward_percent" value={form.referral_reward_percent} error={errors.referral_reward_percent} onChange={(e) => set('referral_reward_percent')(e.target.value)} />
        <TextField label="Codes valid for (days)" type="number" min="1" name="referral_valid_days" value={form.referral_valid_days} error={errors.referral_valid_days} onChange={(e) => set('referral_valid_days')(e.target.value)} />
      </div>
      <h3 className="h4">Affiliates</h3>
      <label className="checkbox lb-inline-check">
        <input type="checkbox" checked={Boolean(form.affiliates_enabled)} onChange={(e) => set('affiliates_enabled')(e.target.checked)} />
        <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span>
        <span>Affiliate programme open<small>Partners earn a commission on orders placed through their links (paid from the platform’s share).</small></span>
      </label>
      <div className="form-row">
        <TextField label="Default commission for new affiliates (%)" inputMode="decimal" name="affiliate_percent" value={form.affiliate_percent} error={errors.affiliate_percent} onChange={(e) => set('affiliate_percent')(e.target.value)} />
        <TextField label="A click counts for (days)" type="number" min="1" name="affiliate_cookie_days" value={form.affiliate_cookie_days} error={errors.affiliate_cookie_days} onChange={(e) => set('affiliate_cookie_days')(e.target.value)} />
      </div>
      <h3 className="h4">Premium and paying in parts</h3>
      <label className="checkbox lb-inline-check">
        <input type="checkbox" checked={Boolean(form.premium_enabled)} onChange={(e) => set('premium_enabled')(e.target.checked)} />
        <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span>
        <span>Premium plan on sale<small>Subscribers can start any course marked Premium. Manage the plans in the Premium tab.</small></span>
      </label>
      <label className="checkbox lb-inline-check">
        <input type="checkbox" checked={Boolean(form.instalments_enabled)} onChange={(e) => set('instalments_enabled')(e.target.checked)} />
        <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span>
        <span>Students can pay in parts<small>Monthly parts; the course opens after the first and pauses if a part is late.</small></span>
      </label>
      <div className="form-row">
        <TextField label="From a course price of (NLe)" inputMode="decimal" name="instalment_min_price" value={form.instalment_min_price} error={errors.instalment_min_price} onChange={(e) => set('instalment_min_price')(e.target.value)} />
        <TextField label="Up to (parts)" type="number" min="2" max="3" name="instalment_max_parts" value={form.instalment_max_parts} error={errors.instalment_max_parts} onChange={(e) => set('instalment_max_parts')(e.target.value)} />
        <TextField label="Lessons pause after (days late)" type="number" min="0" name="instalment_grace_days" value={form.instalment_grace_days} error={errors.instalment_grace_days} onChange={(e) => set('instalment_grace_days')(e.target.value)} />
      </div>
      <h3 className="h4">Mobile apps</h3>
      <label className="checkbox lb-inline-check">
        <input type="checkbox" checked={Boolean(form.push_enabled)} onChange={(e) => set('push_enabled')(e.target.checked)} />
        <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span>
        <span>Push notifications<small>Every in-app notification also goes to the student’s phones, if they use the app.</small></span>
      </label>
      <div className="form-row">
        <TextField label="Oldest app version allowed" placeholder="e.g. 1.2.0 (empty: any)" name="app_min_version" value={form.app_min_version || ''} error={errors.app_min_version} onChange={(e) => set('app_min_version')(e.target.value)} />
        <TextField label="Saved lessons work offline for (days)" type="number" min="1" name="offline_days" value={form.offline_days} error={errors.offline_days} onChange={(e) => set('offline_days')(e.target.value)} />
        <TextField label="Devices per student for saved lessons" type="number" min="1" name="offline_devices" value={form.offline_devices} error={errors.offline_devices} onChange={(e) => set('offline_devices')(e.target.value)} />
      </div>
      <h3 className="h4">Account sharing</h3>
      <div className="form-row">
        <TextField label="Devices that may play videos at once (0 = no limit)" type="number" min="0" name="max_streams" value={form.max_streams} error={errors.max_streams} onChange={(e) => set('max_streams')(e.target.value)} />
      </div>
      <label className="checkbox lb-inline-check">
        <input type="checkbox" checked={Boolean(form.watermark_videos)} onChange={(e) => set('watermark_videos')(e.target.checked)} />
        <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span>
        <span>Watermark videos<small>The student’s email shows faintly over the video, so a recording can be traced to the account.</small></span>
      </label>
      <h3 className="h4">Certificate signature</h3>
      <div className="form-row">
        <TextField label="Signed by" placeholder="e.g. Ibrahim Kamara" name="certificate_signer_name" value={form.certificate_signer_name} onChange={(e) => set('certificate_signer_name')(e.target.value)} />
        <TextField label="Their title" placeholder="e.g. Director of Training" name="certificate_signer_title" value={form.certificate_signer_title} onChange={(e) => set('certificate_signer_title')(e.target.value)} />
      </div>
      <ImageField field={{ label: 'Signature image (optional)', hint: 'A scan of the signature on a white or transparent background.' }} value={form.certificate_signature || ''} onChange={set('certificate_signature')} id="signature" />
      <Alert>{errors.form}</Alert>
      <div className="la-form__actions">
        <button type="submit" className="btn btn--primary" disabled={saving}>{saving ? <span className="btn-spinner" /> : <i className="fas fa-floppy-disk" />} Save settings</button>
        {form.updated_at && <span className="muted small">Last saved {formatDateTime(form.updated_at)}</span>}
      </div>
    </form>
  );
};

const TABS = [['orders', 'Orders'], ['coupons', 'Coupons'], ['flash', 'Flash sales'], ['bundles', 'Bundles'], ['referrals', 'Referrals'], ['affiliates', 'Affiliates'], ['premium', 'Premium'], ['earnings', 'Earnings & payouts'], ['settings', 'Settings']];

/** Selling courses: orders and payments to check, refunds, coupons, instructor earnings and payouts, commission. */
export const CourseSalesPage = () => {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([id]) => id === params.get('tab')) ? params.get('tab') : 'orders';
  return (
    <PortalLayout title="Orders & coupons" subtitle="Payments to confirm, refunds, discount codes, instructor earnings and the platform commission.">
      <div className="la-page">
        <div className="lms-tabs la-tabs" role="tablist">
          {TABS.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'is-active' : ''} onClick={() => setParams(id === 'orders' ? {} : { tab: id })}>{label}</button>
          ))}
        </div>
        {tab === 'orders' && <Orders />}
        {tab === 'coupons' && <Coupons />}
        {tab === 'flash' && <FlashSalesPanel />}
        {tab === 'bundles' && <BundlesPanel />}
        {tab === 'referrals' && <ReferralsPanel />}
        {tab === 'affiliates' && <AffiliatesPanel />}
        {tab === 'premium' && <PremiumPanel />}
        {tab === 'earnings' && <Earnings />}
        {tab === 'settings' && <Settings />}
      </div>
    </PortalLayout>
  );
};

export default CourseSalesPage;

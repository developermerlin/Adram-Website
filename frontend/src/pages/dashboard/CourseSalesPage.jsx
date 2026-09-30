import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { catalogAPI, lmsAdminAPI, parseApiErrors } from '../../services/api';
import PortalLayout from '../../components/layout/PortalLayout';
import { Alert, TextField } from '../../components/ui/Form';
import ConfirmDialog from '../../components/admin/ConfirmDialog';
import { ImageField } from '../../components/admin/contentFields';
import NoteDialog from '../../components/lms/NoteDialog';
import { StatusPill } from '../../components/lms/Price';
import { money } from '../../components/lms/courseUtils';
import { formatDate, formatDateTime } from '../../utils/format';
import '../../styles/marketplace.css';
import '../../styles/lms-admin.css';

const STATUSES = [['processing', 'To check'], ['pending', 'Awaiting payment'], ['successful', 'Paid'], ['failed', 'Failed'], ['cancelled', 'Cancelled'], ['refunded', 'Refunded'], ['', 'All']];
const METHOD_NAMES = { afrimoney: 'Afrimoney', orange_money: 'Orange Money' };

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
                  <p>{METHOD_NAMES[order.method] || order.method} · transaction <strong className="la-mono">{order.transaction_id}</strong>{order.submitted_at ? ` · sent ${formatDateTime(order.submitted_at)}` : ''}</p>
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
          confirm="Reject payment" tone="danger" onConfirm={(note) => decide('reject', note)} onClose={() => setDialog(null)} />
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
                    <td><strong>{money(i.net)}</strong></td><td>{money(i.paid)}</td><td><strong>{money(i.pending)}</strong></td>
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

const TABS = [['orders', 'Orders'], ['coupons', 'Coupons'], ['earnings', 'Earnings & payouts'], ['settings', 'Settings']];

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
        {tab === 'earnings' && <Earnings />}
        {tab === 'settings' && <Settings />}
      </div>
    </PortalLayout>
  );
};

export default CourseSalesPage;

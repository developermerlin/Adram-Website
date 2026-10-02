import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { lmsAPI, parseApiErrors } from '../../services/api';
import { formatDate } from '../../utils/format';
import PortalLayout from '../../components/layout/PortalLayout';
import { Alert } from '../../components/ui/Form';
import Kpi from '../../components/portal/Kpi';
import { ColumnChart } from '../../components/admin/charts';
import { ChartCard, PeriodSwitch } from '../../components/lms/ChartCard';
import { money } from '../../components/lms/courseUtils';
import '../../styles/bundles.css';

const shortDay = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const TONE = { successful: 'badge--green', refunded: 'badge--red', processing: 'badge--amber', pending: 'badge--gray', failed: 'badge--red' };

/** Applying to the affiliate programme. */
const Apply = ({ data, onDone }) => {
  const prior = data.affiliate;
  const [form, setForm] = useState({ website: prior?.website || '', audience: prior?.audience || '', payout_details: prior?.payout_details || '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      onDone((await lmsAPI.applyAffiliate(form)).data);
      toast.success('Application sent. We’ll let you know.');
    } catch (err) {
      setErrors(parseApiErrors(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="card panel af-apply" onSubmit={submit}>
      <h2 className="h3">Become an ADRAM affiliate</h2>
      <p>Recommend our courses on your blog, channel, school or community. You earn <strong>{Number(data.default_percent)}%</strong> of every order placed through your link within {data.cookie_days} days of the click, paid by mobile money.</p>
      {prior?.status === 'rejected' && <Alert type="info">Your last application wasn’t accepted{prior.note ? `: ${prior.note}` : '.'} You can apply again.</Alert>}
      <div className="field">
        <label htmlFor="af-web">Website or channel <span className="optional">(optional)</span></label>
        <input id="af-web" type="url" className="input" placeholder="https://…" value={form.website} onChange={set('website')} />
      </div>
      <div className="field">
        <label htmlFor="af-aud">Where and to whom will you share the courses?</label>
        <textarea id="af-aud" className="input" rows={4} maxLength={1000} value={form.audience} onChange={set('audience')} placeholder="e.g. I run a WhatsApp group of 800 university students interested in coding." />
        {errors.audience && <p className="field-error">{errors.audience}</p>}
      </div>
      <div className="field">
        <label htmlFor="af-pay">How should we pay you? <span className="optional">(private)</span></label>
        <input id="af-pay" className="input" maxLength={500} value={form.payout_details} onChange={set('payout_details')} placeholder="e.g. Orange Money 076 123 456, name on the account" />
      </div>
      <Alert>{errors.detail || errors.form}</Alert>
      <div><button type="submit" className="btn btn--primary" disabled={busy}>{busy && <span className="btn-spinner" />} Apply</button></div>
    </form>
  );
};

/** /student/affiliate: apply to the affiliate programme, then the partner dashboard. */
export const AffiliatePage = () => {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => lmsAPI.myAffiliate(days).then(({ data: d }) => setData(d)).catch(() => setError('The affiliate programme could not be loaded.')), [days]);
  useEffect(() => {
    load();
  }, [load]);

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Link copied');
    } catch {
      toast.error('Copy it by hand instead.');
    }
  };
  const a = data?.affiliate;
  const p = data?.period;
  const bal = data?.balance;

  return (
    <PortalLayout title="Affiliate programme" subtitle="Earn a commission on the courses people buy through your link."
      actions={a?.status === 'approved' ? <PeriodSwitch value={days} onChange={setDays} options={[7, 30, 90, 365]} /> : null}>
      <Alert>{error}</Alert>
      {data && !data.enabled && !a && <Alert type="info">The affiliate programme is closed at the moment.</Alert>}
      {data && data.enabled && (!a || a.status === 'rejected') && <Apply data={data} onDone={setData} />}
      {a?.status === 'pending' && <Alert type="info">Thanks for applying! ADRAM is reviewing your application; you’ll get a notification.</Alert>}
      {a?.status === 'suspended' && <Alert>Your affiliate account is suspended{a.note ? `: ${a.note}` : '.'} Your links don’t earn commission at the moment.</Alert>}

      {a?.status === 'approved' && bal && (
        <div className="viz-root">
          <section className="card panel af-link">
            <label htmlFor="af-link">Your affiliate link · you earn {Number(a.commission_percent)}% of each order</label>
            <div className="gift-panel__share">
              <input id="af-link" className="input" readOnly value={a.link} onFocus={(e) => e.target.select()} />
              <button type="button" className="btn btn--primary btn--sm" onClick={() => copy(a.link)}><i className="fas fa-link" /> Copy</button>
            </div>
            <p className="muted small">Add <code>?aff={a.code}</code> to any ADRAM course link to link straight to that course. Purchases within {data.cookie_days} days of a click count.</p>
          </section>

          <div className="ov-kpis af-kpis">
            <Kpi icon="fa-arrow-pointer" label="Clicks" value={p.clicks} note={`last ${data.days} days`} tone="cyan" />
            <Kpi icon="fa-cart-shopping" label="Paid orders" value={p.paid_orders} note={p.conversion != null ? `${p.conversion}% of clicks` : ''} tone="green" />
            <Kpi icon="fa-coins" label="Commission" value={money(p.commission)} note={`on ${money(p.sales)} of sales`} tone="violet" />
            <Kpi icon="fa-wallet" label="Available to pay" value={money(bal.available)} note={`${money(bal.on_hold)} on hold for ${bal.hold_days} days`} />
          </div>

          <div className="pg-grid">
            <section className="card panel">
              <div className="panel__head"><h2 className="h3">Earnings</h2></div>
              <dl className="af-balance">
                <div><dt>Earned (all time)</dt><dd>{money(bal.earned)}</dd></div>
                <div><dt>On hold</dt><dd>{money(bal.on_hold)}</dd></div>
                <div><dt>Paid to you</dt><dd>{money(bal.paid)}</dd></div>
                <div className="is-total"><dt>Available</dt><dd>{money(bal.available)}</dd></div>
              </dl>
              <p className="muted small">Recent orders are held for {bal.hold_days} days in case of refunds. ADRAM pays the available amount to the account you gave us.</p>
              {data.payouts.length > 0 && (
                <ul className="pg-list">
                  {data.payouts.map((x, i) => <li key={i}><span><strong>{money(x.amount)}</strong><small className="muted">{formatDate(x.date)}{x.reference ? ` · ${x.reference}` : ''}</small></span><span className="badge badge--green">Paid</span></li>)}
                </ul>
              )}
            </section>
            <ChartCard title="Clicks on your link" note={`The last ${data.days} days.`}>
              <ColumnChart rows={data.clicks.map((d) => ({ key: d.date, label: shortDay.format(new Date(`${d.date}T00:00`)), value: d.value }))} name="Clicks" />
            </ChartCard>
          </div>

          <section className="card table-card">
            <div className="table-card__head"><div><h2 className="h3">Orders through your link</h2></div></div>
            {data.orders.length === 0 ? <p className="muted in-pad">No orders yet.</p> : (
              <div className="table-scroll">
                <table className="table">
                  <thead><tr><th>Order</th><th>Date</th><th>Status</th><th className="num">Total</th><th className="num">Your commission</th></tr></thead>
                  <tbody>
                    {data.orders.map((o) => (
                      <tr key={o.number}><td>{o.number}</td><td>{formatDate(o.date)}</td><td><span className={`badge ${TONE[o.status] || 'badge--gray'}`}>{o.status_display}</span></td>
                        <td className="num">{money(o.total)}</td><td className="num">{o.status === 'successful' ? money(o.commission) : '—'}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </PortalLayout>
  );
};

export default AffiliatePage;

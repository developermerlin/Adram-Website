import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { lmsAdminAPI, parseApiErrors } from '../../services/api';
import { money } from './courseUtils';
import '../../styles/premium.css';

const BLANK = { name: '', interval: 'month', price: '', description: '' };

/** Orders & coupons → Premium: the plans and how many people are subscribed. Courses join Premium with their "Premium" switch. */
export const PremiumPanel = () => {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState({});
  const load = useCallback(() => lmsAdminAPI.plans().then(({ data: d }) => setData(d)).catch(() => setData({ plans: [] })), []);
  useEffect(() => {
    load();
  }, [load]);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const add = async (e) => {
    e.preventDefault();
    try {
      await lmsAdminAPI.createPlan(form);
      setForm(BLANK);
      setErrors({});
      toast.success('Plan added.');
      load();
    } catch (err) {
      setErrors(parseApiErrors(err));
    }
  };
  const toggle = async (plan) => {
    await lmsAdminAPI.updatePlan(plan.id, { is_active: !plan.is_active });
    load();
  };
  const price = async (plan) => {
    const value = window.prompt(`New price for ${plan.name} (NLe). People who already paid keep their time.`, plan.price);
    if (value === null) return;
    try {
      await lmsAdminAPI.updatePlan(plan.id, { price: value });
      load();
    } catch (err) {
      toast.error(parseApiErrors(err).price || 'That did not work.');
    }
  };
  const remove = async (plan) => {
    if (!window.confirm(`Remove ${plan.name}? If anyone has paid for it, it is only hidden.`)) return;
    await lmsAdminAPI.removePlan(plan.id);
    load();
  };

  if (!data) return <div className="skeleton skeleton--block" />;
  return (
    <div className="bp-admin">
      <div className="rf-stats">
        <div className="card"><small>Active subscribers</small><strong>{data.active_subscribers ?? 0}</strong></div>
        <div className="card"><small>Premium courses</small><strong>{data.premium_courses ?? 0}</strong></div>
        <div className="card"><small>Plans on sale</small><strong>{data.plans.filter((p) => p.is_active).length}</strong></div>
      </div>
      <p className="muted small">Premium sits alongside single purchases: subscribers can start any course marked <strong>Premium</strong> (in the course editor) while their plan is active. Payments go through the usual mobile money / card checks; there are no automatic renewals. Subscription income stays with the platform. Instalments are set up under Settings. <Link to="/premium">See the public page</Link></p>
      <form className="card panel pp-form" onSubmit={add}>
        <div className="field">
          <label htmlFor="pp-name">Plan name</label>
          <input id="pp-name" className="input" value={form.name} onChange={set('name')} placeholder="e.g. Premium monthly" />
          {errors.name && <p className="field-error">{errors.name}</p>}
        </div>
        <div className="field">
          <label htmlFor="pp-interval">Billing</label>
          <select id="pp-interval" className="input" value={form.interval} onChange={set('interval')}><option value="month">Monthly (30 days)</option><option value="year">Yearly (365 days)</option></select>
        </div>
        <div className="field">
          <label htmlFor="pp-price">Price (NLe)</label>
          <input id="pp-price" className="input" inputMode="decimal" value={form.price} onChange={set('price')} />
          {errors.price && <p className="field-error">{errors.price}</p>}
        </div>
        <button type="submit" className="btn btn--primary btn--sm"><i className="fas fa-plus" /> Add plan</button>
      </form>
      <section className="card table-card">
        {data.plans.length === 0 ? <p className="muted in-pad">No plans yet. Add one above to open Premium.</p> : (
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Plan</th><th>Billing</th><th className="num">Price</th><th className="num">Subscribers</th><th>Status</th><th /></tr></thead>
              <tbody>
                {data.plans.map((p) => (
                  <tr key={p.id}>
                    <td><strong>{p.name}</strong></td>
                    <td>{p.interval_display}</td>
                    <td className="num"><button type="button" className="link-button" onClick={() => price(p)}>{money(p.price)}</button></td>
                    <td className="num">{p.subscribers}</td>
                    <td><button type="button" className={`badge ${p.is_active ? 'badge--green' : 'badge--gray'}`} onClick={() => toggle(p)} title="Click to change">{p.is_active ? 'On sale' : 'Hidden'}</button></td>
                    <td className="num"><button type="button" className="icon-btn icon-btn--danger" aria-label={`Remove ${p.name}`} onClick={() => remove(p)}><i className="fas fa-trash-can" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export default PremiumPanel;

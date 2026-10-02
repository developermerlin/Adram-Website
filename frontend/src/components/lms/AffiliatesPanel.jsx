import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { lmsAdminAPI, parseApiErrors } from '../../services/api';
import { formatDate } from '../../utils/format';
import { money } from './courseUtils';
import '../../styles/bundles.css';

const TONE = { pending: 'badge--amber', approved: 'badge--green', rejected: 'badge--gray', suspended: 'badge--red' };

/** Orders & coupons → Affiliates: applications, partners' results and balances, and recording payouts. */
export const AffiliatesPanel = () => {
  const [rows, setRows] = useState(null);
  const load = useCallback(() => lmsAdminAPI.affiliates().then(({ data }) => setRows(data)).catch(() => setRows([])), []);
  useEffect(() => {
    load();
  }, [load]);

  const act = async (a, action, needNote = false) => {
    const note = needNote ? window.prompt('A note for the affiliate (optional)') : '';
    if (note === null) return;
    try {
      await lmsAdminAPI.affiliateAction(a.id, { action, note });
      toast.success('Saved.');
      load();
    } catch (err) {
      toast.error(parseApiErrors(err).action || 'That did not work.');
    }
  };
  const rate = async (a) => {
    const value = window.prompt('Commission for new orders (%)', a.commission_percent);
    if (value === null) return;
    try {
      await lmsAdminAPI.affiliateAction(a.id, { commission_percent: value });
      load();
    } catch (err) {
      toast.error(parseApiErrors(err).commission_percent || 'That did not work.');
    }
  };
  const pay = async (a) => {
    const amount = window.prompt(`Amount paid to ${a.name} (available: ${money(a.balance.available)})`, a.balance.available);
    if (amount === null) return;
    const reference = window.prompt('Payment reference (e.g. the mobile money transaction ID)') || '';
    try {
      await lmsAdminAPI.affiliatePayout(a.id, { amount, reference });
      toast.success('Payout recorded. The affiliate has been told.');
      load();
    } catch (err) {
      toast.error(parseApiErrors(err).amount || 'That did not work.');
    }
  };

  if (!rows) return <div className="skeleton skeleton--block" />;
  const pending = rows.filter((a) => a.status === 'pending');
  const partners = rows.filter((a) => a.status !== 'pending');
  return (
    <div className="bp-admin">
      <p className="muted small">Affiliates share links to your courses and earn a commission on the orders they bring in, paid from the platform’s share (instructors’ earnings don’t change). The default rate and how long a click counts are under Settings.</p>

      {pending.length > 0 && (
        <section className="card panel">
          <div className="panel__head"><h2 className="h3">Applications ({pending.length})</h2></div>
          <ul className="af-apps">
            {pending.map((a) => (
              <li key={a.id}>
                <div>
                  <strong>{a.name}</strong> <small className="muted">{a.email} · {formatDate(a.created_at)}</small>
                  {a.website && <><br /><a href={a.website} target="_blank" rel="noopener noreferrer" className="small">{a.website}</a></>}
                  <p>{a.audience}</p>
                </div>
                <div className="af-apps__actions">
                  <button type="button" className="btn btn--primary btn--sm" onClick={() => act(a, 'approve')}><i className="fas fa-check" /> Approve</button>
                  <button type="button" className="btn btn--outline btn--sm" onClick={() => act(a, 'reject', true)}>Decline</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card table-card">
        {partners.length === 0 ? <p className="muted in-pad">No affiliates yet. Students and visitors apply from the Affiliate programme page.</p> : (
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Affiliate</th><th>Status</th><th className="num">Rate</th><th className="num">Clicks</th><th className="num">Paid orders</th><th className="num">Earned</th><th className="num">Available</th><th /></tr></thead>
              <tbody>
                {partners.map((a) => (
                  <tr key={a.id}>
                    <td><strong>{a.name}</strong><br /><small className="muted">{a.code}{a.payout_details ? ` · ${a.payout_details}` : ''}</small></td>
                    <td><span className={`badge ${TONE[a.status]}`}>{a.status_display}</span></td>
                    <td className="num"><button type="button" className="link-button" onClick={() => rate(a)} title="Change the rate">{Number(a.commission_percent)}%</button></td>
                    <td className="num">{a.stats?.clicks ?? '—'}</td>
                    <td className="num">{a.stats?.paid_orders ?? '—'}</td>
                    <td className="num">{a.balance ? money(a.balance.earned) : '—'}</td>
                    <td className="num">{a.balance ? money(a.balance.available) : '—'}</td>
                    <td className="num af-row-actions">
                      {a.balance && Number(a.balance.available) > 0 && <button type="button" className="btn btn--primary btn--sm" onClick={() => pay(a)}>Record payout</button>}
                      {a.status === 'approved' && <button type="button" className="btn btn--text btn--sm" onClick={() => act(a, 'suspend', true)}>Suspend</button>}
                      {a.status === 'suspended' && <button type="button" className="btn btn--text btn--sm" onClick={() => act(a, 'reinstate')}>Reinstate</button>}
                      {a.status === 'rejected' && <button type="button" className="btn btn--text btn--sm" onClick={() => act(a, 'approve')}>Approve</button>}
                    </td>
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

export default AffiliatesPanel;

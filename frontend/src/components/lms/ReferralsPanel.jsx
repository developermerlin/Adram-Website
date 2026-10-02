import { useEffect, useState } from 'react';
import { lmsAdminAPI } from '../../services/api';
import { formatDate } from '../../utils/format';
import '../../styles/bundles.css';

const label = (c) => (c ? `${c.code} · ${c.percent}% · ${c.status}` : '—');

/** Orders & coupons → Referrals: who invited whom, and the codes it earned. The rates are under Settings. */
export const ReferralsPanel = () => {
  const [data, setData] = useState(null);
  useEffect(() => {
    lmsAdminAPI.referrals().then(({ data: d }) => setData(d)).catch(() => setData({ total: 0, rewarded: 0, conversion: 0, referrals: [] }));
  }, []);
  if (!data) return <div className="skeleton skeleton--block" />;
  return (
    <div className="bp-admin">
      <div className="rf-stats">
        <div className="card"><small>Friends invited</small><strong>{data.total}</strong></div>
        <div className="card"><small>Went on to buy</small><strong>{data.rewarded}</strong></div>
        <div className="card"><small>Conversion</small><strong>{data.conversion}%</strong></div>
      </div>
      <p className="muted small">Students share their invitation link from <em>Invite friends</em>. Set the discounts, or switch invitations off, under Settings.</p>
      <section className="card table-card">
        {data.referrals.length === 0 ? <p className="muted in-pad">No referrals yet.</p> : (
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Invited by</th><th>New student</th><th>Joined</th><th>First purchase</th><th>Welcome code</th><th>Reward code</th></tr></thead>
              <tbody>
                {data.referrals.map((r, i) => (
                  <tr key={i}>
                    <td>{r.referrer}</td>
                    <td>{r.referred}</td>
                    <td>{formatDate(r.joined_at)}</td>
                    <td>{r.rewarded_at ? `${formatDate(r.rewarded_at)} (${r.order})` : '—'}</td>
                    <td className="small">{label(r.welcome)}</td>
                    <td className="small">{label(r.reward)}</td>
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

export default ReferralsPanel;

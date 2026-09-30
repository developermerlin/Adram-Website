import { useEffect, useState } from 'react';
import { lmsAdminAPI } from '../../services/api';
import PortalLayout from '../../components/layout/PortalLayout';
import { Alert } from '../../components/ui/Form';
import { formatDateTime } from '../../utils/format';
import '../../styles/lms-admin.css';

const human = (action) => action.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const ICONS = { course: 'fa-laptop-code', user: 'fa-user', order: 'fa-receipt', review: 'fa-star', report: 'fa-flag', certificate: 'fa-certificate',
  coupon: 'fa-ticket', category: 'fa-folder', payout: 'fa-wallet', lmssettings: 'fa-sliders', trainingenrollment: 'fa-user-graduate' };

/** Who did what: course approvals, suspensions, role changes, refunds and other important administrative actions. */
export const AuditLogPage = () => {
  const [action, setAction] = useState('');
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    lmsAdminAPI.audit({ ...(action ? { action } : {}), ...(q.trim() ? { q: q.trim() } : {}) })
      .then(({ data: d }) => live && setData(d))
      .catch(() => live && setError('The audit log could not be loaded.'));
    return () => {
      live = false;
    };
  }, [action, q]);

  return (
    <PortalLayout title="Audit log" subtitle="Important administrative actions, newest first.">
      <div className="la-page">
        <div className="la-toolbar">
          <div className="la-toolbar__filters">
            <label className="input-icon"><i className="fas fa-magnifying-glass" aria-hidden="true" /><input type="search" className="input" placeholder="Search by person or item" aria-label="Search the audit log" value={q} onChange={(e) => setQ(e.target.value)} /></label>
            <select className="input" aria-label="Action" value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="">Every action</option>
              {(data?.actions || []).map((a) => <option key={a} value={a}>{human(a)}</option>)}
            </select>
          </div>
        </div>
        <Alert>{error}</Alert>
        <section className="card table-card">
          {!data && !error ? <div className="skeleton skeleton--block" /> : data?.entries.length === 0 ? <div className="la-empty"><i className="fas fa-clipboard-list" /><strong>Nothing recorded yet</strong><p>Course approvals, refunds, suspensions and role changes will be listed here.</p></div> : (
            <div className="table-scroll">
              <table className="table">
                <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Item</th><th>Details</th><th>IP address</th></tr></thead>
                <tbody>
                  {data?.entries.map((e) => (
                    <tr key={e.id}>
                      <td>{formatDateTime(e.created_at)}</td>
                      <td>{e.actor ? e.actor.name : <span className="muted">System</span>}</td>
                      <td><strong>{human(e.action)}</strong></td>
                      <td>{e.target_type && <i className={`fas ${ICONS[e.target_type] || 'fa-circle'} muted`} aria-hidden="true" />} {e.target_label || '—'}</td>
                      <td>
                        <div className="la-chips">
                          {Object.entries(e.details || {}).filter(([, v]) => v !== '' && v != null).map(([k, v]) => <span key={k} className="la-chip" title={`${k}: ${v}`}><b>{k}</b> {String(v)}</span>)}
                        </div>
                      </td>
                      <td className="la-mono">{e.ip_address || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </PortalLayout>
  );
};

export default AuditLogPage;

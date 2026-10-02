import { Link } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { lmsAdminAPI, parseApiErrors } from '../../services/api';
import PortalLayout from '../../components/layout/PortalLayout';
import NoteDialog from '../../components/lms/NoteDialog';
import { StatusPill } from '../../components/lms/Price';
import { formatDate } from '../../utils/format';
import '../../styles/marketplace.css';
import '../../styles/lms-admin.css';

/** Every certificate issued: search, view, revoke and restore. */
export const AdminCertificatesPage = () => {
  const [q, setQ] = useState('');
  const [revokedOnly, setRevokedOnly] = useState(false);
  const [rows, setRows] = useState(null);
  const [revoking, setRevoking] = useState(null);

  const load = useCallback(() => lmsAdminAPI.certificates({ ...(q.trim() ? { q: q.trim() } : {}), ...(revokedOnly ? { revoked: 'true' } : {}) })
    .then(({ data }) => setRows(data)).catch(() => setRows([])), [q, revokedOnly]);
  useEffect(() => {
    load();
  }, [load]);

  const act = async (code, action, reason = '') => {
    try {
      await lmsAdminAPI.certificateAction(code, action, reason);
      toast.success(action === 'revoke' ? 'Certificate revoked' : 'Certificate restored');
      setRevoking(null);
      load();
    } catch (err) {
      throw new Error(parseApiErrors(err).reason || parseApiErrors(err).form || 'That did not work.', { cause: err });
    }
  };

  return (
    <PortalLayout title="Certificates" subtitle="Certificates issued when students complete their courses."
      actions={<Link to="/admin/certificate-templates" className="btn btn--outline btn--sm"><i className="fas fa-palette" /> Templates</Link>}>
      <div className="la-page">
        <div className="la-toolbar">
          <div className="la-toolbar__filters">
            <label className="input-icon"><i className="fas fa-magnifying-glass" aria-hidden="true" /><input type="search" className="input" placeholder="Search by ID, student or course" aria-label="Search certificates" value={q} onChange={(e) => setQ(e.target.value)} /></label>
            <label className="la-inline-check"><input type="checkbox" checked={revokedOnly} onChange={(e) => setRevokedOnly(e.target.checked)} /> Revoked only</label>
          </div>
        </div>
        <section className="card table-card">
          {!rows ? <div className="skeleton skeleton--block" /> : rows.length === 0 ? <div className="la-empty"><i className="fas fa-certificate" /><strong>No certificates found</strong></div> : (
            <div className="table-scroll">
              <table className="table">
                <thead><tr><th>Certificate ID</th><th>Student</th><th>Course</th><th>Issued</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.code}>
                      <td className="la-mono">{c.code}</td>
                      <td><strong>{c.student_name}</strong><br /><small className="muted">{c.student_email}</small></td>
                      <td>{c.course_title}<br /><small className="muted">{c.instructor_name}</small></td>
                      <td>{formatDate(c.issued_at)}</td>
                      <td>{c.revoked ? <><StatusPill status="refunded" label="Revoked" /><br /><small className="muted">{c.revoke_reason}</small></> : <StatusPill status="successful" label="Valid" />}</td>
                      <td className="la-actions">
                        <a href={`/certificate/${c.code}`} target="_blank" rel="noreferrer" className="btn btn--text btn--sm">View</a>
                        {c.revoked
                          ? <button type="button" className="btn btn--outline btn--sm" onClick={() => act(c.code, 'restore').catch((e) => toast.error(e.message))}>Restore</button>
                          : <button type="button" className="btn btn--danger-outline btn--sm" onClick={() => setRevoking(c)}>Revoke</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
      {revoking && (
        <NoteDialog title="Revoke this certificate" text={`${revoking.code}: ${revoking.student_name}, ${revoking.course_title}. Anyone checking it will see it’s no longer valid.`}
          label="Reason" required confirm="Revoke" tone="danger" onConfirm={(reason) => act(revoking.code, 'revoke', reason)} onClose={() => setRevoking(null)} />
      )}
    </PortalLayout>
  );
};

export default AdminCertificatesPage;

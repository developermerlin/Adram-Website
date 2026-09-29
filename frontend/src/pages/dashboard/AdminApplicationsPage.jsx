import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { parseApiErrors, staffPortalAPI } from '../../services/api';
import { timeAgo } from '../../utils/format';
import { isClosed, STAGES } from '../../utils/applicationStages';
import PortalLayout from '../../components/layout/PortalLayout';
import { Alert } from '../../components/ui/Form';
import { DeadlineTag, StageBadge } from '../../components/portal/ApplicationCard';
import ApplicationsOverview from '../../components/admin/ApplicationsOverview';
import ConfirmDialog from '../../components/admin/ConfirmDialog';

// Short labels for the "ADRAM applies for you" status in the table.
const SERVICE_LABEL = {
  requested: 'New request',
  approved: 'Awaiting payment',
  declined: 'Declined',
  payment_submitted: 'Payment to check',
  payment_rejected: 'Re-upload asked',
  paid: 'Paid',
};

export const AdminApplicationsPage = () => {
  const [params, setParams] = useSearchParams();
  const stage = params.get('stage') || '';
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(
    () =>
      staffPortalAPI
        .applications({ stage, search, page })
        .then(({ data }) => {
          setResult(data);
          setError('');
        })
        .catch(() => setError('Could not load applications.')),
    [stage, search, page],
  );

  useEffect(() => {
    const t = setTimeout(load, 250); // debounce the search box
    return () => clearTimeout(t);
  }, [load]);

  // Delete, always confirmed first. The overview cards reload afterwards so their figures stay right.
  const [deleting, setDeleting] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const remove = async () => {
    try {
      await staffPortalAPI.removeApplication(deleting.id);
      toast.success('Application deleted.');
      setDeleting(null);
      setRefreshKey((k) => k + 1);
      // Deleting the last row on a page steps back a page.
      if (result.results.length === 1 && page > 1) setPage((p) => p - 1);
      else load();
    } catch (err) {
      toast.error(parseApiErrors(err, 'The application couldn’t be deleted. Try again.').form || 'The application couldn’t be deleted. Try again.');
    }
  };

  const total = result ? Object.values(result.stage_counts).reduce((a, b) => a + b, 0) : null;

  return (
    <PortalLayout title="Applications" subtitle="Every scholarship application students are tracking. Open a student to update it.">
      <ApplicationsOverview key={refreshKey} />

      <div className="tabs" id="applications-table" role="tablist" aria-label="Filter by stage">
        {[{ id: 'review', label: 'Needs action' }, { id: '', label: 'All' }, { id: 'service', label: 'ADRAM applying' }, ...STAGES].map((s) => (
          <button key={s.id || 'all'} type="button" role="tab" aria-selected={stage === s.id} className={`tabs__tab${stage === s.id ? ' is-active' : ''}`} onClick={() => { setParams(s.id ? { stage: s.id } : {}, { replace: true }); setPage(1); }}>
            {s.label}
            {result && <span className="tabs__count">{s.id === 'review' ? result.review_count : s.id === 'service' ? result.service_count : s.id ? result.stage_counts[s.id] : total}</span>}
          </button>
        ))}
      </div>

      <section className="card table-card">
        <div className="table-card__head">
          <div className="table-card__filters">
            <div className="input-icon">
              <i className="fas fa-magnifying-glass" aria-hidden="true" />
              <input type="search" className="input" placeholder="Search student or scholarship" aria-label="Search applications" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </div>
          </div>
          <span className="muted small">{result ? `${result.count} application${result.count === 1 ? '' : 's'}` : 'Loading…'}</span>
        </div>

        {error && <Alert>{error}</Alert>}

        <div className="table-scroll">
          <table className="table table--catalog">
            <thead>
              <tr>
                <th>Student</th>
                <th>Scholarship</th>
                <th>Stage</th>
                <th>Deadline</th>
                <th>Documents</th>
                <th className="col-edited">Updated</th>
                <th className="table__actions">Actions</th>
              </tr>
            </thead>
            <tbody className={result ? '' : 'is-loading'}>
              {result?.results.length === 0 && (
                <tr><td colSpan="7" className="table__empty"><i className="fas fa-list-check" /> No applications {stage ? 'at this stage' : 'yet'}.</td></tr>
              )}
              {result?.results.map((a) => {
                const done = a.documents.filter((d) => d.is_done).length;
                return (
                  <tr key={a.id}>
                    <td>
                      <Link to={`/admin/students/${a.student_id}`} className="title-cell">
                        <strong>{a.student_name}</strong>
                        <small>{a.student_email}</small>
                      </Link>
                    </td>
                    <td><span className="title-cell"><strong>{a.scholarship_name}</strong><small>{a.country_name || 'Not listed on the website'}</small></span></td>
                    <td>
                      <span className="badge-row">
                        <StageBadge stage={a.stage} />
                        {a.service && (
                          <span className={`badge ${['requested', 'payment_submitted'].includes(a.service.status) ? 'badge--amber' : 'badge--blue'}`} title={a.service.status_display}>
                            <i className="fas fa-handshake-angle" /> {SERVICE_LABEL[a.service.status]}
                          </span>
                        )}
                      </span>
                    </td>
                    <td><DeadlineTag date={a.deadline} closed={isClosed(a.stage)} /></td>
                    <td>{done}/{a.documents.length}</td>
                    <td className="col-edited">
                      <div className="cell-stack">
                        <span>{timeAgo(a.updated_at)}</span>
                        {a.updated_by_name && <small>by {a.updated_by_name}</small>}
                      </div>
                    </td>
                    <td className="table__actions">
                      <span className="action-row">
                        <Link to={`/admin/students/${a.student_id}?application=${a.id}`} className="icon-btn" title="View"
                          aria-label={`View ${a.student_name}’s ${a.scholarship_name} application`}>
                          <i className="fas fa-eye" />
                        </Link>
                        <button type="button" className="icon-btn icon-btn--danger" title="Delete"
                          aria-label={`Delete ${a.student_name}’s ${a.scholarship_name} application`} onClick={() => setDeleting(a)}>
                          <i className="fas fa-trash-can" />
                        </button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {(result?.next || result?.previous) && (
          <div className="table-card__foot">
            <span className="muted small">Page {page}</span>
            <div className="pager">
              <button type="button" className="btn btn--outline btn--sm" disabled={!result.previous} onClick={() => setPage((p) => p - 1)}><i className="fas fa-chevron-left" /> Previous</button>
              <button type="button" className="btn btn--outline btn--sm" disabled={!result.next} onClick={() => setPage((p) => p + 1)}>Next <i className="fas fa-chevron-right" /></button>
            </div>
          </div>
        )}
      </section>

      {deleting && (
        <ConfirmDialog
          config={{
            title: 'Delete this application?',
            text: `${deleting.student_name}’s “${deleting.scholarship_name}” application, its documents, payment receipt and progress will be removed for the student too. This can’t be undone.`,
            confirm: 'Delete permanently',
          }}
          onClose={() => setDeleting(null)}
          onConfirm={remove}
        />
      )}
    </PortalLayout>
  );
};

export default AdminApplicationsPage;

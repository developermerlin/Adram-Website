import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { lmsAdminAPI, parseApiErrors } from '../../services/api';
import PortalLayout from '../../components/layout/PortalLayout';
import { Alert } from '../../components/ui/Form';
import ConfirmDialog from '../../components/admin/ConfirmDialog';
import NoteDialog from '../../components/lms/NoteDialog';
import { StatusPill } from '../../components/lms/Price';
import Stars from '../../components/lms/Stars';
import { formatDateTime } from '../../utils/format';
import '../../styles/marketplace.css';
import '../../styles/lms-admin.css';

const REMOVE_LABEL = { review: 'Also hide the review', course: 'Also unpublish the course', thread: 'Also delete the question', reply: 'Also delete the answer' };

const Reports = () => {
  const [status, setStatus] = useState('open');
  const [data, setData] = useState(null);
  const [dialog, setDialog] = useState(null);
  const load = useCallback(() => lmsAdminAPI.reports(status).then(({ data: d }) => setData(d)).catch(() => setData({ counts: {}, reports: [], error: true })), [status]);
  useEffect(() => {
    load();
  }, [load]);

  const decide = async (report, action, note, remove) => {
    try {
      await lmsAdminAPI.decideReport(report.id, { action, note, remove });
      toast.success(action === 'resolve' ? 'Report resolved' : 'Report dismissed');
      setDialog(null);
      load();
    } catch (err) {
      throw new Error(parseApiErrors(err).form || 'That did not work.', { cause: err });
    }
  };

  return (
    <>
      <div className="chip-row" role="group" aria-label="Report status">
        {[['open', 'Open'], ['resolved', 'Resolved'], ['dismissed', 'Dismissed']].map(([id, label]) => (
          <button key={id} type="button" className={`chip${status === id ? ' is-active' : ''}`} aria-pressed={status === id} onClick={() => setStatus(id)}>{label}{data?.counts?.[id] != null ? ` (${data.counts[id]})` : ''}</button>
        ))}
      </div>
      {data?.error && <Alert>The reports could not be loaded.</Alert>}
      {!data && <div className="skeleton skeleton--block" />}
      {data && data.reports.length === 0 && <div className="card la-empty"><i className="fas fa-flag" /><strong>{status === 'open' ? 'No open reports' : 'Nothing here'}</strong><p>When people report a course, review, question or answer, it appears here.</p></div>}
      <ul className="la-cards">
        {data?.reports.map((r) => (
          <li key={r.id} className="card la-card">
            <div>
              <div className="la-card__head">
                <span className="badge badge--blue">{r.target_type_display}</span>
                <strong>{r.reason_display}</strong>
                <StatusPill status={r.status === 'open' ? 'open' : r.status === 'resolved' ? 'resolved' : 'cancelled'} label={r.status} />
              </div>
              <p>{r.target_label || <span className="muted">(no longer available)</span>}</p>
              {r.details && <p className="la-note">“{r.details}”</p>}
              <p className="la-meta">
                <span><i className="fas fa-user" />Reported by {r.reporter.name}</span>
                <span><i className="far fa-clock" />{formatDateTime(r.created_at)}</span>
                {!r.target_exists && <span><i className="fas fa-trash-can" />Content deleted</span>}
                {r.hidden && <span><i className="fas fa-eye-slash" />Hidden</span>}
              </p>
              {r.resolution_note && <p className="la-note">Decision{r.resolved_by ? ` by ${r.resolved_by}` : ''}: {r.resolution_note}</p>}
            </div>
            <div className="la-card__side">
              {r.link && <a href={r.link} target="_blank" rel="noreferrer" className="btn btn--text btn--sm"><i className="fas fa-arrow-up-right-from-square" /> Open</a>}
              {r.status === 'open' && (
                <div className="la-actions">
                  <button type="button" className="btn btn--primary btn--sm" onClick={() => setDialog({ report: r, action: 'resolve' })}>Resolve</button>
                  <button type="button" className="btn btn--outline btn--sm" onClick={() => setDialog({ report: r, action: 'dismiss' })}>Dismiss</button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
      {dialog && (
        <NoteDialog
          title={dialog.action === 'resolve' ? 'Resolve this report' : 'Dismiss this report'}
          text={dialog.action === 'resolve' ? 'The report was right. Optionally remove the content now.' : 'Nothing needs to change.'}
          checkbox={dialog.action === 'resolve' && dialog.report.target_exists && REMOVE_LABEL[dialog.report.target_type] ? { label: REMOVE_LABEL[dialog.report.target_type], checked: true } : null}
          confirm={dialog.action === 'resolve' ? 'Resolve' : 'Dismiss'}
          onConfirm={(note, remove) => decide(dialog.report, dialog.action, note, remove)}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
};

const Reviews = () => {
  const [filters, setFilters] = useState({ hidden: '', reported: '', rating: '', q: '' });
  const [rows, setRows] = useState(null);
  const [hiding, setHiding] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const load = useCallback(() => {
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    return lmsAdminAPI.reviews(params).then(({ data }) => setRows(data)).catch(() => setRows([]));
  }, [filters]);
  useEffect(() => {
    load();
  }, [load]);
  const set = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));

  const act = async (review, action, note = '') => {
    try {
      await lmsAdminAPI.moderateReview(review.id, action, note);
      toast.success({ hide: 'Review hidden', show: 'Review shown again', delete: 'Review deleted' }[action]);
      setHiding(null);
      load();
    } catch {
      throw new Error('That did not work.');
    }
  };

  return (
    <>
      <div className="la-toolbar">
        <div className="la-toolbar__filters">
          <label className="input-icon"><i className="fas fa-magnifying-glass" aria-hidden="true" /><input type="search" className="input" placeholder="Search comments, courses, emails" aria-label="Search reviews" value={filters.q} onChange={set('q')} /></label>
          <select className="input" aria-label="Visibility" value={filters.hidden} onChange={set('hidden')}>
            <option value="">Visible and hidden</option><option value="false">Visible</option><option value="true">Hidden</option>
          </select>
          <select className="input" aria-label="Reported" value={filters.reported} onChange={set('reported')}>
            <option value="">All reviews</option><option value="true">Reported only</option>
          </select>
          <select className="input" aria-label="Rating" value={filters.rating} onChange={set('rating')}>
            <option value="">Any rating</option>{[5, 4, 3, 2, 1].map((s) => <option key={s} value={s}>{s} stars</option>)}
          </select>
        </div>
      </div>
      {!rows && <div className="skeleton skeleton--block" />}
      {rows && rows.length === 0 && <div className="card la-empty"><i className="far fa-star" /><strong>No reviews match</strong></div>}
      <ul className="la-cards">
        {rows?.map((r) => (
          <li key={r.id} className={`card la-card${r.is_hidden ? ' is-hidden' : ''}`}>
            <div>
              <div className="la-card__head">
                <Stars value={r.rating} size={13} />
                <strong>{r.student.name}</strong>
                <span className="muted small">on <Link to={`/courses/${r.course.slug}#reviews`}>{r.course.title}</Link></span>
                {r.is_hidden && <span className="badge badge--gray">Hidden</span>}
                {r.reports > 0 && <span className="badge badge--red"><i className="fas fa-flag" /> {r.reports} report{r.reports === 1 ? '' : 's'}</span>}
              </div>
              {r.comment ? <p>{r.comment}</p> : <p className="muted">No comment.</p>}
              <p className="la-meta"><span><i className="far fa-clock" />{formatDateTime(r.created_at)}</span></p>
              {r.moderation_note && <p className="la-note la-note--warn">Moderator: {r.moderation_note}</p>}
            </div>
            <div className="la-card__side la-actions">
              {r.is_hidden
                ? <button type="button" className="btn btn--outline btn--sm" onClick={() => act(r, 'show').catch((e) => toast.error(e.message))}><i className="fas fa-eye" /> Show</button>
                : <button type="button" className="btn btn--outline btn--sm" onClick={() => setHiding(r)}><i className="fas fa-eye-slash" /> Hide</button>}
              <button type="button" className="btn btn--danger-outline btn--sm" onClick={() => setDeleting(r)}><i className="fas fa-trash-can" /> Delete</button>
            </div>
          </li>
        ))}
      </ul>
      {hiding && (
        <NoteDialog title="Hide this review" text="Hidden reviews aren’t shown on the course page or counted in its rating." label="Reason" confirm="Hide review"
          onConfirm={(note) => act(hiding, 'hide', note)} onClose={() => setHiding(null)} />
      )}
      {deleting && (
        <ConfirmDialog config={{ title: 'Delete this review?', text: 'It will be removed for good. Hiding it is usually enough.', confirm: 'Delete' }}
          onClose={() => setDeleting(null)} onConfirm={async () => { await act(deleting, 'delete').catch((e) => toast.error(e.message)); setDeleting(null); }} />
      )}
    </>
  );
};

/** The moderation queue: reported content, and every review. */
export const ModerationPage = () => {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'reviews' ? 'reviews' : 'reports';
  return (
    <PortalLayout title="Moderation" subtitle="Deal with reported content and keep reviews fair.">
      <div className="la-page">
        <div className="lms-tabs la-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'reports'} className={tab === 'reports' ? 'is-active' : ''} onClick={() => setParams({})}>Reports</button>
          <button type="button" role="tab" aria-selected={tab === 'reviews'} className={tab === 'reviews' ? 'is-active' : ''} onClick={() => setParams({ tab: 'reviews' })}>Reviews</button>
        </div>
        {tab === 'reports' ? <Reports /> : <Reviews />}
      </div>
    </PortalLayout>
  );
};

export default ModerationPage;

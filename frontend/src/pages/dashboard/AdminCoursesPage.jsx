import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDate, timeAgo } from '../../utils/format';
import PortalLayout from '../../components/layout/PortalLayout';
import BrandIcon from '../../components/brand/BrandIcon';
import { Alert } from '../../components/ui/Form';
import { staffPortalAPI } from '../../services/api';
import ConfirmDialog from '../../components/admin/ConfirmDialog';
import { PublishBadge } from '../../components/admin/catalog';
import { DELETE_CONFIRM, useCatalogList } from '../../components/admin/useCatalogAdmin';
import TrainingOverview from '../../components/admin/TrainingOverview';

export const AdminCoursesPage = () => {
  const [deleting, setDeleting] = useState(null);
  const { items, error, togglePublish, move, remove } = useCatalogList('courses');
  const [enrollments, setEnrollments] = useState(null);

  useEffect(() => {
    staffPortalAPI.enrollments().then(({ data }) => setEnrollments(data)).catch(() => setEnrollments([]));
  }, []);
  const requests = enrollments?.filter((e) => e.status === 'requested').length || 0;
  const published = items?.filter((c) => c.is_published).length;

  return (
    <PortalLayout
      title="Training programmes"
      subtitle="The tracks on the public Training page and in the site menu, in the order shown here."
      actions={
        <>
          <Link to="/admin/courses/new" className="btn btn--primary btn--sm"><i className="fas fa-plus" /> New programme</Link>
          <Link to="/courses" className="btn btn--outline btn--sm" target="_blank"><i className="fas fa-arrow-up-right-from-square" /> View page</Link>
        </>
      }
    >
      {/* Refreshes when a programme is added, removed, published or unpublished */}
      <TrainingOverview refreshKey={items ? items.map((c) => `${c.id}:${c.is_published}`).sort().join(',') : ''} />

      <section className="card table-card">
        <div className="table-card__head">
          <span className="muted small">
            {items ? `${published} of ${items.length} published` : 'Loading…'} · <i className="fas fa-arrows-up-down" /> Use the arrows to set the order
          </span>
        </div>

        {error && <Alert>{error}</Alert>}

        <div className="table-scroll">
          <table className="table table--catalog">
            <thead>
              <tr>
                <th className="table__order"><span className="sr-only">Order</span></th>
                <th>Programme</th>
                <th>Next intake</th>
                <th>Fee</th>
                <th>Status</th>
                <th className="col-edited">Last edited</th>
                <th className="table__actions">Actions</th>
              </tr>
            </thead>
            <tbody className={items ? '' : 'is-loading'}>
              {items?.length === 0 && (
                <tr>
                  <td colSpan="7" className="table__empty"><i className="fas fa-laptop-code" /> No programmes yet. Add the first one.</td>
                </tr>
              )}
              {items?.map((c, i) => (
                <tr key={c.id}>
                  <td className="table__order">
                    <span className="order-btns">
                      <button type="button" className="icon-btn" aria-label={`Move ${c.title} up`} disabled={i === 0} onClick={() => move(c, -1)}><i className="fas fa-chevron-up" /></button>
                      <button type="button" className="icon-btn" aria-label={`Move ${c.title} down`} disabled={i === items.length - 1} onClick={() => move(c, 1)}><i className="fas fa-chevron-down" /></button>
                    </span>
                  </td>
                  <td>
                    <Link to={`/admin/courses/${c.id}`} className="title-cell title-cell--icon">
                      <span className="title-cell__icon"><BrandIcon name={c.icon} size={22} /></span>
                      <span>
                        <strong>{c.title}</strong>
                        <small>{c.topics.join(' · ')}</small>
                      </span>
                    </Link>
                  </td>
                  <td>{c.next_intake ? formatDate(`${c.next_intake}T00:00`) : <span className="muted">Not set</span>}</td>
                  <td>{c.fee || <span className="muted">On request</span>}</td>
                  <td><PublishBadge published={c.is_published} /></td>
                  <td className="col-edited">
                    <div className="cell-stack">
                      <span>{timeAgo(c.updated_at)}</span>
                      {c.updated_by_name && <small>by {c.updated_by_name}</small>}
                    </div>
                  </td>
                  <td className="table__actions">
                    <span className="action-row">
                      <button type="button" className={`icon-btn${c.is_published ? '' : ' icon-btn--publish'}`} title={c.is_published ? 'Unpublish' : 'Publish'} aria-label={`${c.is_published ? 'Unpublish' : 'Publish'} ${c.title}`} onClick={() => togglePublish(c)}>
                        <i className={`fas ${c.is_published ? 'fa-eye-slash' : 'fa-globe'}`} />
                      </button>
                      <Link to={`/admin/courses/${c.id}`} className="icon-btn" title="Edit" aria-label={`Edit ${c.title}`}><i className="fas fa-pen" /></Link>
                      <button type="button" className="icon-btn icon-btn--danger" title="Delete" aria-label={`Delete ${c.title}`} onClick={() => setDeleting(c)}><i className="fas fa-trash-can" /></button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card table-card enrollments" id="enrollments">
        <div className="table-card__head">
          <div>
            <h2 className="h3">Enrollments</h2>
            <p className="muted small">Students who enrolled from the Training page. Open a student to confirm their place, set a start date and add a note.</p>
          </div>
          {requests > 0 && <span className="badge badge--amber"><i className="fas fa-bell" /> {requests} new request{requests === 1 ? '' : 's'}</span>}
        </div>
        <div className="table-scroll">
          <table className="table table--catalog">
            <thead>
              <tr><th>Student</th><th>Programme</th><th>Status</th><th>Starts</th><th className="col-edited">Requested</th></tr>
            </thead>
            <tbody className={enrollments ? '' : 'is-loading'}>
              {enrollments?.length === 0 && <tr><td colSpan="5" className="table__empty"><i className="fas fa-user-graduate" /> No enrollments yet.</td></tr>}
              {enrollments?.map((e) => (
                <tr key={e.id}>
                  <td>
                    <Link to={`/admin/students/${e.student_id}`} className="title-cell">
                      <strong>{e.student_name}</strong>
                      <small>{e.student_email}</small>
                    </Link>
                  </td>
                  <td>{e.course.title}</td>
                  <td><span className={`badge ${e.status === 'requested' ? 'badge--amber' : e.status === 'active' ? 'badge--green' : 'badge--blue'}`}>{e.status_display}</span></td>
                  <td>{e.start_date ? formatDate(`${e.start_date}T00:00`) : <span className="muted">Not set</span>}</td>
                  <td className="col-edited">{timeAgo(e.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {deleting && (
        <ConfirmDialog
          config={DELETE_CONFIRM('programme')}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await remove(deleting);
            setDeleting(null);
          }}
        />
      )}
    </PortalLayout>
  );
};

export default AdminCoursesPage;

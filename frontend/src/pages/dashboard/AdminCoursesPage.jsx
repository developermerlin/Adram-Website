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
import { StatusPill } from '../../components/lms/Price';
import CourseCard from '../../components/lms/CourseCard';
import { money } from '../../components/lms/courseUtils';
import '../../styles/marketplace.css';

export const AdminCoursesPage = () => {
  const [deleting, setDeleting] = useState(null);
  const { items, error, togglePublish, move, remove } = useCatalogList('courses');
  const [enrollments, setEnrollments] = useState(null);
  const [view, setView] = useState(() => {
    try {
      return localStorage.getItem('adram:admin-courses-view') || 'cards';
    } catch {
      return 'cards';
    }
  });
  const pickView = (next) => {
    setView(next);
    try {
      localStorage.setItem('adram:admin-courses-view', next);
    } catch {
      /* not remembered */
    }
  };

  useEffect(() => {
    staffPortalAPI.enrollments().then(({ data }) => setEnrollments(data)).catch(() => setEnrollments([]));
  }, []);
  const requests = enrollments?.filter((e) => e.status === 'requested').length || 0;
  const published = items?.filter((c) => c.is_published).length;

  return (
    <PortalLayout
      title="Courses"
      subtitle="Every course on the Training page, by ADRAM and by instructors, in the order shown here."
      actions={
        <>
          <Link to="/admin/courses/new" className="btn btn--primary btn--sm"><i className="fas fa-plus" /> New course</Link>
          <Link to="/admin/course-reviews" className="btn btn--outline btn--sm"><i className="fas fa-clipboard-check" /> Review queue</Link>
          <Link to="/courses" className="btn btn--outline btn--sm" target="_blank"><i className="fas fa-arrow-up-right-from-square" /> View page</Link>
        </>
      }
    >
      {/* Refreshes when a programme is added, removed, published or unpublished */}
      <TrainingOverview refreshKey={items ? items.map((c) => `${c.id}:${c.is_published}`).sort().join(',') : ''} />

      <div className="ac-bar">
        <div className="lms-tabs" role="tablist" aria-label="Show courses as">
          <button type="button" role="tab" aria-selected={view === 'cards'} className={view === 'cards' ? 'is-active' : ''} onClick={() => pickView('cards')}><i className="fas fa-grip" /> Cards</button>
          <button type="button" role="tab" aria-selected={view === 'table'} className={view === 'table' ? 'is-active' : ''} onClick={() => pickView('table')}><i className="fas fa-list" /> Table</button>
        </div>
        <span className="muted small">{items ? `${published} of ${items.length} published` : 'Loading…'}</span>
      </div>

      {view === 'cards' && (
        <div className="cc-grid ac-cards">
          {items?.map((c) => {
            const price = Number(c.price) || 0;
            const sale = c.discount_price != null && Number(c.discount_price) < price ? Number(c.discount_price) : price;
            const card = { ...c, sale_price: sale, is_free: !sale, instructor: { name: c.instructor_account?.name || c.instructor_name || 'ADRAM Technologies' } };
            return (
              <div key={c.id} className="ac-card">
                <CourseCard course={card} preview />
                <div className="ac-card__meta">
                  <PublishBadge published={c.is_published} />
                  {c.status && !['published', 'draft'].includes(c.status) && <StatusPill status={c.status} />}
                  <span className="muted small">{c.stats?.student_count || 0} students · {c.stats?.lesson_count || 0} lessons</span>
                </div>
                <div className="ac-card__actions">
                  <Link to={`/admin/courses/${c.id}`} className="btn btn--primary btn--sm"><i className="fas fa-pen" /> Edit card &amp; details</Link>
                  <Link to={`/admin/courses/${c.slug}/content`} className="btn btn--outline btn--sm"><i className="fas fa-clapperboard" /> Lessons</Link>
                  <a href={`/courses/${c.slug}`} target="_blank" rel="noreferrer" className="btn btn--text btn--sm">View</a>
                </div>
              </div>
            );
          })}
          {items?.length === 0 && <p className="muted">No courses yet. Add the first one.</p>}
        </div>
      )}

      {view === 'table' && <section className="card table-card">
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
                <th>Course</th>
                <th>Instructor</th>
                <th>Price</th>
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
                  <td>{c.instructor_account ? <><strong>{c.instructor_account.name}</strong><br /><small className="muted">{c.instructor_account.email}</small></> : <span className="muted">ADRAM</span>}</td>
                  <td>{Number(c.price) > 0 ? money(c.discount_price && Number(c.discount_price) < Number(c.price) ? c.discount_price : c.price) : c.fee || <span className="muted">Free</span>}{c.next_intake && <><br /><small className="muted">Intake {formatDate(`${c.next_intake}T00:00`)}</small></>}</td>
                  <td><div className="cell-stack"><PublishBadge published={c.is_published} />{c.status && c.status !== 'published' && c.status !== 'draft' && <StatusPill status={c.status} />}</div></td>
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
                      <Link to={`/admin/courses/${c.slug}/content`} className="icon-btn" title="Course content (lessons, videos, quizzes)" aria-label={`Course content for ${c.title}`}><i className="fas fa-clapperboard" /></Link>
                      <Link to={`/admin/courses/${c.id}`} className="icon-btn" title="Edit" aria-label={`Edit ${c.title}`}><i className="fas fa-pen" /></Link>
                      <button type="button" className="icon-btn icon-btn--danger" title="Delete" aria-label={`Delete ${c.title}`} onClick={() => setDeleting(c)}><i className="fas fa-trash-can" /></button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>}

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

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { instructorAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import PortalLayout from '../../components/layout/PortalLayout';
import { Alert } from '../../components/ui/Form';
import { StatTile } from '../../components/admin/StatTile';
import { StatusPill } from '../../components/lms/Price';
import Stars from '../../components/lms/Stars';
import { money, useCourseImage } from '../../components/lms/courseUtils';
import { assetUrl } from '../../utils/assets';
import { timeAgo } from '../../utils/format';
import '../../styles/marketplace.css';
import '../../styles/instructor.css';

const fmt = new Intl.NumberFormat();

/** The instructor's home: totals, earnings, their courses and what happened recently. */
export const InstructorDashboardPage = () => {
  const { user } = useAuth();
  const imageOf = useCourseImage();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    instructorAPI.dashboard().then(({ data: d }) => live && setData(d)).catch(() => live && setError('Your dashboard could not be loaded. Refresh the page to try again.'));
    return () => {
      live = false;
    };
  }, []);

  const t = data?.totals;
  const n = (v) => (t ? fmt.format(v) : null);
  const e = data?.earnings;

  return (
    <PortalLayout
      title={`Welcome${user?.first_name ? `, ${user.first_name}` : ''}`}
      subtitle="Your teaching at a glance."
      actions={<Link to="/instructor/courses?new=1" className="btn btn--primary btn--sm"><i className="fas fa-plus" /> Create course</Link>}
    >
      <div className="in-page viz-root">
        <Alert>{error}</Alert>
        <div className="in-kpis">
          <StatTile label="Courses" value={n(t?.courses)} icon="fa-chalkboard-user" to="/instructor/courses" action="Open my courses">
            <span className="kpi__note">{t ? `${t.published} published · ${t.drafts} draft${t.drafts === 1 ? '' : 's'}` : ''}</span>
          </StatTile>
          <StatTile label="Waiting for review" value={n(t?.pending)} icon="fa-hourglass-half" tone="amber">
            <span className="kpi__note">{t ? (t.approved ? `${t.approved} approved, ready to publish` : 'Submitted to ADRAM') : ''}</span>
          </StatTile>
          <StatTile label="Students" value={n(t?.students)} icon="fa-user-graduate" tone="cyan" to="/instructor/analytics" action="Open analytics" />
          <StatTile label="Revenue" value={t ? money(t.revenue) : null} icon="fa-sack-dollar" tone="green" to="/instructor/earnings" action="Open earnings">
            <span className="kpi__note">{e ? `You earned ${money(e.net)}` : ''}</span>
          </StatTile>
          <StatTile label="Rating" value={t ? (t.rating_average ? t.rating_average.toFixed(1) : '—') : null} icon="fa-star" tone="amber" to="/instructor/reviews" action="Open reviews">
            <span className="kpi__note">{t ? `${fmt.format(t.reviews)} review${t.reviews === 1 ? '' : 's'}` : ''}</span>
          </StatTile>
          <StatTile label="Unanswered questions" value={n(t?.unanswered_questions)} icon="fa-circle-question" tone={t?.unanswered_questions ? 'red' : 'violet'} to="/instructor/questions" action="Answer questions" />
        </div>

        {e && (
          <section className="card in-earn">
            <div><small>Net earnings</small><strong>{money(e.net)}</strong></div>
            <div><small>Paid to you</small><strong>{money(e.paid)}</strong></div>
            <div><small>Waiting to be paid</small><strong>{money(e.pending)}</strong></div>
            <Link to="/instructor/earnings" className="btn btn--outline btn--sm">Earnings details <i className="fas fa-arrow-right" /></Link>
          </section>
        )}

        <section className="card table-card">
          <div className="table-card__head">
            <div><h2 className="h3">My courses</h2><p className="muted small">Status, students, rating and revenue for each course.</p></div>
            <Link to="/instructor/courses" className="link-arrow">All courses <i className="fas fa-arrow-right" /></Link>
          </div>
          {!data ? <div className="skeleton skeleton--block" /> : data.courses.length === 0 ? (
            <div className="in-empty">
              <i className="fas fa-chalkboard-user" aria-hidden="true" />
              <strong>Create your first course</strong>
              <p className="muted">Give it a title, build the curriculum, then submit it for review.</p>
              <Link to="/instructor/courses?new=1" className="btn btn--primary btn--sm"><i className="fas fa-plus" /> Create course</Link>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="table">
                <thead><tr><th>Course</th><th>Status</th><th>Students</th><th>Rating</th><th>Revenue</th><th /></tr></thead>
                <tbody>
                  {data.courses.map((c) => {
                    const image = imageOf(c);
                    return (
                      <tr key={c.slug}>
                        <td>
                          <div className="in-course">
                            <span className="in-thumb">{image ? <img src={assetUrl(image)} alt="" /> : <i className="fas fa-laptop-code" aria-hidden="true" />}</span>
                            <Link to={`/instructor/courses/${c.slug}`}><strong>{c.title}</strong></Link>
                          </div>
                        </td>
                        <td><StatusPill status={c.status} label={c.status_display} /></td>
                        <td>{fmt.format(c.stats.student_count)}</td>
                        <td>{c.stats.rating_count ? <><Stars value={c.stats.rating_average} size={12} /> {c.stats.rating_average.toFixed(1)}</> : <span className="muted">—</span>}</td>
                        <td>{money(c.revenue)}</td>
                        <td className="in-actions">
                          <Link to={`/instructor/courses/${c.slug}`} className="btn btn--outline btn--sm">Edit</Link>
                          <Link to={`/instructor/courses/${c.slug}/curriculum`} className="btn btn--text btn--sm">Curriculum</Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="in-grid3">
          <section className="card panel">
            <h2 className="h3">Recent enrolments</h2>
            {data?.recent_enrollments.length === 0 && <p className="muted">No students yet.</p>}
            <ul className="in-feed">
              {data?.recent_enrollments.map((r) => (
                <li key={`${r.course_slug}-${r.created_at}`}><i className="fas fa-user-plus" aria-hidden="true" /><div><strong>{r.student}</strong><small>{r.course} · {timeAgo(r.created_at)}</small></div></li>
              ))}
            </ul>
          </section>
          <section className="card panel">
            <h2 className="h3">Recent questions</h2>
            {data?.recent_questions.length === 0 && <p className="muted">No questions yet.</p>}
            <ul className="in-feed">
              {data?.recent_questions.map((q) => (
                <li key={q.id}>
                  <i className={`fas ${q.answered ? 'fa-circle-check' : 'fa-circle-question'}`} aria-hidden="true" />
                  <div><Link to={`/instructor/courses/${q.course.slug}/qa?thread=${q.id}`}><strong>{q.title}</strong></Link><small>{q.course.title} · {q.author} · {timeAgo(q.created_at)}</small></div>
                </li>
              ))}
            </ul>
          </section>
          <section className="card panel">
            <h2 className="h3">Recent reviews</h2>
            {data?.recent_reviews.length === 0 && <p className="muted">No reviews yet.</p>}
            <ul className="in-feed">
              {data?.recent_reviews.map((r) => (
                <li key={r.id}><i className="fas fa-star" aria-hidden="true" /><div><strong><Stars value={r.rating} size={11} /> {r.course}</strong>{r.comment && <span>{r.comment}</span>}<small>{r.student} · {timeAgo(r.created_at)}</small></div></li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </PortalLayout>
  );
};

export default InstructorDashboardPage;

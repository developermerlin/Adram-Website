import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { catalogAPI, lmsAdminAPI, parseApiErrors } from '../../services/api';
import { StatusPill } from './Price';
import { money } from './courseUtils';
import { formatDate } from '../../utils/format';
import '../../styles/lms-admin.css';

/** In the admin's user panel: the person's courses and progress, orders, certificates, reviews and courses taught. */
export const UserLearningPanel = ({ userId }) => {
  const [data, setData] = useState(null);
  const [courses, setCourses] = useState([]);
  const [grant, setGrant] = useState('');
  const load = useCallback(() => lmsAdminAPI.userLearning(userId).then(({ data: d }) => setData(d)).catch(() => setData(false)), [userId]);
  useEffect(() => {
    load();
    let live = true;
    catalogAPI.manage('courses').list().then(({ data: d }) => live && setCourses(d)).catch(() => {});
    return () => {
      live = false;
    };
  }, [load]);

  const give = async () => {
    try {
      await lmsAdminAPI.grantCourse(userId, grant);
      toast.success('Course access given');
      setGrant('');
      load();
    } catch (err) {
      toast.error(parseApiErrors(err).form || 'Access could not be given.');
    }
  };

  if (data === false) return <p className="muted small">Learning details could not be loaded.</p>;
  if (!data) return <div className="skeleton skeleton--block" />;
  const owned = new Set(data.enrollments.filter((e) => ['active', 'completed'].includes(e.status)).map((e) => e.course.slug));

  return (
    <div className="la-learning">
      <div>
        <h5>Courses ({data.enrollments.length})</h5>
        {data.enrollments.length === 0 ? <p className="muted small">Not enrolled on any course.</p> : (
          <ul>
            {data.enrollments.map((e) => {
              const row = data.learning.find((r) => r.course.slug === e.course.slug);
              return (
                <li key={e.id}>
                  <span><Link to={`/courses/${e.course.slug}`}>{e.course.title}</Link> <small className="muted">· {e.status}</small></span>
                  {row && <><span className="la-bar"><span style={{ width: `${row.progress.percent}%` }} /></span><small>{row.progress.percent}%</small></>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="la-grant">
        <select className="input input--sm" aria-label="Course to give access to" value={grant} onChange={(e) => setGrant(e.target.value)}>
          <option value="">Give access to a course…</option>
          {courses.filter((c) => !owned.has(c.slug)).map((c) => <option key={c.slug} value={c.slug}>{c.title}</option>)}
        </select>
        <button type="button" className="btn btn--outline btn--sm" disabled={!grant} onClick={give}>Give access</button>
      </div>
      <div>
        <h5>Orders ({data.orders.length})</h5>
        {data.orders.length === 0 ? <p className="muted small">No purchases.</p> : (
          <ul>
            {data.orders.map((o) => (
              <li key={o.id}>
                <span><Link to={`/admin/course-sales?tab=orders`}>{o.number}</Link> <small className="muted">· {formatDate(o.created_at)} · {o.items.map((i) => i.title).join(', ')}</small></span>
                <strong>{money(o.total)}</strong>
                <StatusPill status={o.status} label={o.status_display} />
              </li>
            ))}
          </ul>
        )}
      </div>
      {data.certificates.length > 0 && (
        <div>
          <h5>Certificates</h5>
          <ul>{data.certificates.map((c) => <li key={c.code}><span><a href={`/certificate/${c.code}`} target="_blank" rel="noreferrer">{c.course_title}</a> <small className="muted">· {formatDate(c.issued_at)}</small></span>{c.revoked && <StatusPill status="refunded" label="Revoked" />}</li>)}</ul>
        </div>
      )}
      {data.reviews.length > 0 && (
        <div>
          <h5>Reviews</h5>
          <ul>{data.reviews.map((r) => <li key={r.id}><span>{r.course} · {r.rating}★ {r.comment && <small className="muted">“{r.comment.slice(0, 80)}”</small>}</span>{r.is_hidden && <span className="badge badge--gray">Hidden</span>}</li>)}</ul>
        </div>
      )}
      {data.teaching.length > 0 && (
        <div>
          <h5>Teaches</h5>
          <ul>{data.teaching.map((c) => <li key={c.slug}><span><Link to={`/admin/courses/${c.slug}/content`}>{c.title}</Link></span><StatusPill status={c.status} /></li>)}</ul>
        </div>
      )}
    </div>
  );
};

export default UserLearningPanel;

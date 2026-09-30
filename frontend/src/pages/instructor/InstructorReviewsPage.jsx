import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { instructorAPI } from '../../services/api';
import PortalLayout from '../../components/layout/PortalLayout';
import { Alert } from '../../components/ui/Form';
import Stars from '../../components/lms/Stars';
import { formatDate } from '../../utils/format';
import '../../styles/instructor.css';

/** What students said about the instructor's courses. */
export const InstructorReviewsPage = () => {
  const [course, setCourse] = useState('');
  const [courses, setCourses] = useState([]);
  const [reviews, setReviews] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    instructorAPI.courses().then(({ data }) => live && setCourses(data)).catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    let live = true;
    instructorAPI.reviews(course ? { course } : {}).then(({ data }) => live && setReviews(data)).catch(() => live && setError('The reviews could not be loaded.'));
    return () => {
      live = false;
    };
  }, [course]);

  const count = reviews?.length || 0;
  const average = count ? reviews.reduce((n, r) => n + r.rating, 0) / count : 0;
  const bars = [5, 4, 3, 2, 1].map((star) => [star, (reviews || []).filter((r) => r.rating === star).length]);

  return (
    <PortalLayout
      title="Reviews"
      subtitle="What students say about your courses."
      actions={(
        <select className="input input--sm" aria-label="Course" value={course} onChange={(e) => setCourse(e.target.value)}>
          <option value="">All courses</option>
          {courses.map((c) => <option key={c.slug} value={c.slug}>{c.title}</option>)}
        </select>
      )}
    >
      <Alert>{error}</Alert>
      {!reviews && !error && <div className="skeleton skeleton--block" />}
      {reviews && count === 0 && (
        <section className="card panel empty-state">
          <span className="empty-state__icon"><i className="far fa-star" /></span>
          <h3>No reviews yet</h3>
          <p className="muted">Students can rate a course once they’re enrolled.</p>
        </section>
      )}
      {reviews && count > 0 && (
        <>
          <section className="card in-rating">
            <div className="in-rating__score"><strong>{average.toFixed(1)}</strong><Stars value={average} size={16} /><small>{count} review{count === 1 ? '' : 's'}</small></div>
            <ul className="in-rating__bars">
              {bars.map(([star, n]) => (
                <li key={star}><span>{star} ★</span><span className="lms-progress"><span style={{ width: `${(100 * n) / count}%` }} /></span><small>{n}</small></li>
              ))}
            </ul>
          </section>
          <ul className="in-reviews">
            {reviews.map((r) => (
              <li key={r.id} className="card">
                <div className="in-reviews__head"><strong>{r.student}</strong><Stars value={r.rating} size={13} /><small className="muted">{formatDate(r.created_at)}</small></div>
                <Link to={`/courses/${r.course_slug}#reviews`} className="muted small">{r.course}</Link>
                {r.comment ? <p>{r.comment}</p> : <p className="muted">No comment.</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </PortalLayout>
  );
};

export default InstructorReviewsPage;

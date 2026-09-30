import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { instructorAPI } from '../../services/api';
import PortalLayout from '../../components/layout/PortalLayout';
import { Alert } from '../../components/ui/Form';
import { timeAgo } from '../../utils/format';
import '../../styles/instructor.css';

/** Q&A across every course the instructor teaches; each question opens in its course's Q&A tab. */
export const InstructorQuestionsPage = () => {
  const [filter, setFilter] = useState('unanswered');
  const [course, setCourse] = useState('');
  const [courses, setCourses] = useState([]);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    instructorAPI.courses().then(({ data: d }) => live && setCourses(d)).catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    let live = true;
    instructorAPI.questions({ ...(filter === 'unanswered' ? { filter } : {}), ...(course ? { course } : {}) })
      .then(({ data: d }) => live && setData(d))
      .catch(() => live && setError('The questions could not be loaded.'));
    return () => {
      live = false;
    };
  }, [filter, course]);

  return (
    <PortalLayout title="Q&A" subtitle={data ? `${data.unanswered} question${data.unanswered === 1 ? '' : 's'} waiting for an answer.` : 'Questions from your students.'}>
      <div className="in-toolbar">
        <div className="lms-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={filter === 'unanswered'} className={filter === 'unanswered' ? 'is-active' : ''} onClick={() => setFilter('unanswered')}>Unanswered</button>
          <button type="button" role="tab" aria-selected={filter === 'all'} className={filter === 'all' ? 'is-active' : ''} onClick={() => setFilter('all')}>All questions</button>
        </div>
        <select className="input input--sm" aria-label="Course" value={course} onChange={(e) => setCourse(e.target.value)}>
          <option value="">All courses</option>
          {courses.map((c) => <option key={c.slug} value={c.slug}>{c.title}</option>)}
        </select>
      </div>
      <Alert>{error}</Alert>
      {!data && !error && <div className="skeleton skeleton--block" />}
      {data && data.threads.length === 0 && (
        <section className="card panel empty-state">
          <span className="empty-state__icon"><i className="fas fa-circle-check" /></span>
          <h3>{filter === 'unanswered' ? 'Every question has an answer' : 'No questions yet'}</h3>
          <p className="muted">When students ask about your lessons, their questions appear here.</p>
        </section>
      )}
      <ul className="in-questions">
        {data?.threads.map((t) => (
          <li key={t.id} className="card">
            <Link to={`/instructor/courses/${t.course.slug}/qa?thread=${t.id}`}>
              <span className={`in-q__mark${t.answered ? ' is-done' : ''}`}><i className={`fas ${t.answered ? 'fa-circle-check' : 'fa-circle-question'}`} aria-hidden="true" /></span>
              <span className="in-q__text">
                <strong>{t.title}</strong>
                {t.body && <span className="muted">{t.body}</span>}
                <small className="muted">{t.course.title}{t.lesson ? ` · ${t.lesson.title}` : ''} · {t.author} · {timeAgo(t.created_at)} · {t.reply_count} {t.reply_count === 1 ? 'reply' : 'replies'}</small>
              </span>
              <span className="btn btn--outline btn--sm">{t.answered ? 'View' : 'Answer'}</span>
            </Link>
          </li>
        ))}
      </ul>
    </PortalLayout>
  );
};

export default InstructorQuestionsPage;

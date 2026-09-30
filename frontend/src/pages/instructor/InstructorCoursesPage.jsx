import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { instructorAPI, parseApiErrors } from '../../services/api';
import PortalLayout from '../../components/layout/PortalLayout';
import { Alert } from '../../components/ui/Form';
import { StatusPill } from '../../components/lms/Price';
import Stars from '../../components/lms/Stars';
import BrandIcon from '../../components/brand/BrandIcon';
import { money, useCourseImage } from '../../components/lms/courseUtils';
import { assetUrl } from '../../utils/assets';
import { formatDate } from '../../utils/format';
import '../../styles/marketplace.css';
import '../../styles/instructor.css';

const FILTERS = [
  ['all', 'All', () => true],
  ['drafts', 'Drafts', (c) => c.status === 'draft'],
  ['review', 'In review', (c) => ['submitted', 'in_review'].includes(c.status)],
  ['fix', 'Needs changes', (c) => ['changes_requested', 'rejected'].includes(c.status)],
  ['approved', 'Approved', (c) => c.status === 'approved'],
  ['published', 'Published', (c) => c.status === 'published'],
];

const NewCourseDialog = ({ onClose }) => {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await instructorAPI.createCourse({ title });
      toast.success('Course created. Now tell students about it.');
      navigate(`/instructor/courses/${data.slug}`);
    } catch (err) {
      setError(parseApiErrors(err).title || parseApiErrors(err).form || 'The course could not be created.');
      setBusy(false);
    }
  };
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="new-course-title">
      <button type="button" className="modal__backdrop" aria-label="Close" onClick={onClose} />
      <form className="modal__card" onSubmit={create}>
        <h2 id="new-course-title">Create a course</h2>
        <p className="muted">What’s a working title? You can change it later.</p>
        <div className="field">
          <label htmlFor="nc-title">Course title</label>
          <input id="nc-title" className="input" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Web Development from Scratch" autoFocus />
        </div>
        <Alert>{error}</Alert>
        <div className="modal__actions">
          <button type="button" className="btn btn--outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn--primary" disabled={busy || !title.trim()}>{busy ? <span className="btn-spinner" /> : null} Create course</button>
        </div>
      </form>
    </div>
  );
};

/** My courses: every course the instructor owns, by status, with the way into each. */
export const InstructorCoursesPage = () => {
  const imageOf = useCourseImage();
  const [params, setParams] = useSearchParams();
  const [courses, setCourses] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const creating = params.get('new') === '1';

  useEffect(() => {
    let live = true;
    instructorAPI.courses().then(({ data }) => live && setCourses(data)).catch(() => live && setError('Your courses could not be loaded.'));
    return () => {
      live = false;
    };
  }, []);

  const test = FILTERS.find(([id]) => id === filter)[2];
  const shown = (courses || []).filter(test);

  return (
    <PortalLayout
      title="My courses"
      subtitle="Create courses, build their curriculum and send them for review."
      actions={<button type="button" className="btn btn--primary btn--sm" onClick={() => setParams({ new: '1' })}><i className="fas fa-plus" /> New course</button>}
    >
      <Alert>{error}</Alert>
      {courses && courses.length > 0 && (
        <div className="chip-row" role="group" aria-label="Show courses">
          {FILTERS.map(([id, label, fn]) => (
            <button key={id} type="button" className={`chip${filter === id ? ' is-active' : ''}`} aria-pressed={filter === id} onClick={() => setFilter(id)}>
              {label} ({courses.filter(fn).length})
            </button>
          ))}
        </div>
      )}
      {!courses && !error && <div className="skeleton skeleton--block" />}
      {courses && courses.length === 0 && (
        <section className="card panel empty-state">
          <span className="empty-state__icon"><i className="fas fa-chalkboard-user" /></span>
          <h3>You haven’t created a course yet</h3>
          <p className="muted">Share what you know: create a course, add lessons, quizzes and assignments, and submit it for review.</p>
          <button type="button" className="btn btn--primary btn--sm" onClick={() => setParams({ new: '1' })}>Create your first course</button>
        </section>
      )}
      {courses && courses.length > 0 && shown.length === 0 && <p className="muted">No courses here.</p>}
      <div className="in-courses">
        {shown.map((c) => {
          const image = imageOf(c);
          return (
            <article key={c.slug} className="card in-ccard">
              <Link to={`/instructor/courses/${c.slug}`} className="in-ccard__thumb" tabIndex={-1} aria-hidden="true">
                {image ? <img src={assetUrl(image)} alt="" loading="lazy" /> : <span><BrandIcon name={c.icon} size={40} /></span>}
              </Link>
              <div className="in-ccard__body">
                <StatusPill status={c.status} label={c.status_display} />
                <Link to={`/instructor/courses/${c.slug}`} className="in-ccard__title">{c.title}</Link>
                {c.review_note && ['changes_requested', 'rejected'].includes(c.status) && <p className="in-ccard__note"><i className="fas fa-comment-dots" aria-hidden="true" /> {c.review_note}</p>}
                <div className="in-ccard__facts">
                  <span><i className="fas fa-user-graduate" aria-hidden="true" /> {c.stats.student_count}</span>
                  <span><i className="fas fa-list" aria-hidden="true" /> {c.stats.lesson_count} lessons</span>
                  {c.stats.rating_count > 0 && <span><Stars value={c.stats.rating_average} size={11} /> {c.stats.rating_average.toFixed(1)}</span>}
                  <span>{c.sale_price && Number(c.sale_price) > 0 ? money(c.sale_price) : 'Free'}</span>
                  <span>Revenue {money(c.revenue)}</span>
                </div>
                <small className="muted">Updated {formatDate(c.updated_at)}</small>
                <div className="in-ccard__actions">
                  <Link to={`/instructor/courses/${c.slug}`} className="btn btn--primary btn--sm"><i className="fas fa-pen" /> Edit</Link>
                  <Link to={`/instructor/courses/${c.slug}/curriculum`} className="btn btn--outline btn--sm"><i className="fas fa-layer-group" /> Curriculum</Link>
                  <Link to={`/instructor/courses/${c.slug}/students`} className="btn btn--text btn--sm">Students</Link>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {creating && <NewCourseDialog onClose={() => setParams({})} />}
    </PortalLayout>
  );
};

export default InstructorCoursesPage;

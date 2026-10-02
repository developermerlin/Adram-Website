import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { lmsAPI } from '../../services/api';
import '../../styles/lms.css';
import { formatDate } from '../../utils/format';
import PortalLayout from '../../components/layout/PortalLayout';
import BrandIcon from '../../components/brand/BrandIcon';
import { Alert } from '../../components/ui/Form';

const STATUS_BADGE = { requested: 'badge--amber', active: 'badge--green', completed: 'badge--blue', declined: 'badge--red' };
const STATUS_TEXT = {
  requested: 'ADRAM has your request and will contact you with dates and fees to confirm your place.',
  active: 'You’re enrolled. Class details and any updates from ADRAM appear here.',
  completed: 'Well done on completing this programme!',
  declined: 'ADRAM couldn’t accept this request. You can ask again from the course page.',
};

/** Training programmes the student enrolled in. Only reachable from the sidebar once they have one. */
export const StudentTrainingPage = () => {
  // The training side's own data (lms), not the scholarship portal's
  const [enrollments, setEnrollments] = useState(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => lmsAPI.enrollments().then(({ data: list }) => { setEnrollments(list); setFailed(false); }).catch(() => setFailed(true)), []);
  useEffect(() => {
    load();
  }, [load]);
  const cancel = async (id) => {
    try {
      await lmsAPI.cancelEnrollment(id);
      toast.success('Enrollment request cancelled');
      load();
    } catch {
      toast.error('The request could not be cancelled. Please try again.');
    }
  };
  const data = enrollments ? { training: enrollments } : null;
  // Programmes that have a course portal: progress and where to continue
  const [learning, setLearning] = useState({});
  useEffect(() => {
    lmsAPI.mine().then(({ data: list }) => setLearning(Object.fromEntries(list.map((l) => [l.course.slug, l])))).catch(() => {});
  }, []);

  return (
    <PortalLayout
      title="My training"
      subtitle="The ADRAM training programmes you’ve enrolled in."
      actions={<Link to="/courses" className="btn btn--outline btn--sm"><i className="fas fa-laptop-code" /> All programmes</Link>}
    >
      {failed && <Alert>Your training couldn’t be loaded. Refresh the page to try again.</Alert>}
      {!data && <div className="skeleton skeleton--block" />}
      {data?.training.length === 0 && (
        <section className="card panel empty-state">
          <span className="empty-state__icon"><i className="fas fa-laptop-code" /></span>
          <h3>You haven’t enrolled in a programme</h3>
          <p className="muted">Choose a programme on our Training page and select <strong>Enroll</strong>. It will appear here.</p>
          <Link to="/courses" className="btn btn--primary btn--sm">See training programmes</Link>
        </section>
      )}
      <div className="training-grid">
        {data?.training.map((t) => (
          <article key={t.id} className="card training-card">
            <header className="training-card__head">
              <span className="training-card__icon"><BrandIcon name={t.course.icon} size={28} /></span>
              <div>
                <h2 className="h3">{t.course.title}</h2>
                <span className={`badge ${STATUS_BADGE[t.status] || 'badge--gray'}`}>{t.status_display}</span>
              </div>
            </header>
            <p className="muted">{t.course.summary}</p>
            <dl className="service-facts">
              <div><dt>Starts</dt><dd>{t.start_date ? formatDate(`${t.start_date}T00:00`) : t.course.next_intake ? formatDate(`${t.course.next_intake}T00:00`) : 'To be confirmed'}</dd></div>
              {t.course.duration && <div><dt>Duration</dt><dd>{t.course.duration}</dd></div>}
              {t.course.fee && <div><dt>Fee</dt><dd>{t.course.fee}</dd></div>}
            </dl>
            {t.course.topics?.length > 0 && (
              <div className="program-card__topics">{t.course.topics.map((topic) => <span key={topic} className="tag">{topic}</span>)}</div>
            )}
            {learning[t.course.slug] && (
              <div className="training-card__learn">
                <div className="lms-progress"><span style={{ width: `${learning[t.course.slug].progress.percent}%` }} /></div>
                <small>{learning[t.course.slug].progress.percent}% complete · {learning[t.course.slug].progress.completed} of {learning[t.course.slug].progress.total} lessons</small>
                <Link to={`/learn/${t.course.slug}${learning[t.course.slug].progress.resume_id && !learning[t.course.slug].certificate_code ? `/lesson/${learning[t.course.slug].progress.resume_id}` : ''}`} className="btn btn--primary btn--sm">
                  <i className="fas fa-circle-play" /> {learning[t.course.slug].progress.completed ? 'Continue learning' : 'Start learning'}
                </Link>
                {learning[t.course.slug].certificate_code && (
                  <Link to={`/certificate/${learning[t.course.slug].certificate_code}`} className="btn btn--outline btn--sm"><i className="fas fa-certificate" /> My certificate</Link>
                )}
              </div>
            )}
            <p className="training-card__status">
              {STATUS_TEXT[t.status]}
              {t.decided_at && t.status !== 'requested' && <small className="muted"> ({t.status === 'declined' ? 'Decided' : 'Confirmed'} on {formatDate(t.decided_at)})</small>}
            </p>
            {t.note && <p className="training-card__note"><strong>From ADRAM:</strong> {t.note}</p>}
            {t.status === 'declined' && <Link to={`/courses/${t.course.slug}`} className="btn btn--outline btn--sm">Ask again</Link>}
            {t.status === 'requested' && (
              <button type="button" className="btn btn--text btn--sm text-danger training-card__cancel" onClick={() => cancel(t.id)}>
                Cancel my request
              </button>
            )}
          </article>
        ))}
      </div>
    </PortalLayout>
  );
};

export default StudentTrainingPage;

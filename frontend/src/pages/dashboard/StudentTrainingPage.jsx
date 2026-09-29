import { Link } from 'react-router-dom';
import usePortal from '../../data/usePortal';
import { formatDate } from '../../utils/format';
import PortalLayout from '../../components/layout/PortalLayout';
import BrandIcon from '../../components/brand/BrandIcon';
import { Alert } from '../../components/ui/Form';

const STATUS_BADGE = { requested: 'badge--amber', active: 'badge--green', completed: 'badge--blue' };
const STATUS_TEXT = {
  requested: 'ADRAM has your request and will contact you with dates and fees to confirm your place.',
  active: 'You’re enrolled. Class details and any updates from ADRAM appear here.',
  completed: 'Well done on completing this programme!',
};

/** Training programmes the student enrolled in. Only reachable from the sidebar once they have one. */
export const StudentTrainingPage = () => {
  const portal = usePortal();
  const { data } = portal;

  return (
    <PortalLayout
      title="My training"
      subtitle="The ADRAM training programmes you’ve enrolled in."
      actions={<Link to="/courses" className="btn btn--outline btn--sm"><i className="fas fa-laptop-code" /> All programmes</Link>}
    >
      {portal.error && <Alert>Your training couldn’t be loaded. Refresh the page to try again.</Alert>}
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
            <p className="training-card__status">{STATUS_TEXT[t.status]}</p>
            {t.note && <p className="training-card__note"><strong>From ADRAM:</strong> {t.note}</p>}
            {t.status === 'requested' && (
              <button type="button" className="btn btn--text btn--sm text-danger training-card__cancel" onClick={() => portal.cancelEnrollment(t.id)}>
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

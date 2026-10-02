import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { lmsAPI } from '../../services/api';
import PortalLayout from '../../components/layout/PortalLayout';
import { Alert } from '../../components/ui/Form';
import ShareButtons from '../../components/lms/ShareButtons';
import { formatDate } from '../../utils/format';
import '../../styles/shop.css';

/** Every certificate the student earned: view, download and share. */
export const MyCertificatesPage = () => {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [sharing, setSharing] = useState(null);

  useEffect(() => {
    let live = true;
    lmsAPI.myCertificates().then(({ data }) => live && setItems(data)).catch(() => live && setError('Your certificates could not be loaded.'));
    return () => {
      live = false;
    };
  }, []);

  return (
    <PortalLayout
      title="My certificates"
      subtitle="Certificates you earned by completing courses. Share them or add them to your LinkedIn profile."
      actions={<Link to="/verify" className="btn btn--outline btn--sm"><i className="fas fa-shield-halved" /> Verify a certificate</Link>}
    >
      <Alert>{error}</Alert>
      {!items && !error && <div className="skeleton skeleton--block" />}
      {items && items.length === 0 && (
        <section className="card panel empty-state">
          <span className="empty-state__icon"><i className="fas fa-certificate" /></span>
          <h3>No certificates yet</h3>
          <p className="muted">Finish every required lesson, quiz and assignment of a course and its certificate appears here.</p>
          <Link to="/student/learning" className="btn btn--primary btn--sm">Continue learning</Link>
        </section>
      )}
      {items && items.length > 0 && (
        <div className="mc-grid">
          {items.map((c) => (
            <article key={c.code} className="card mc-card">
              <div className="mc-card__art">
                <i className="fas fa-award" aria-hidden="true" />
                <strong>{c.course_title}</strong>
                <small>Certificate of completion</small>
              </div>
              <div className="mc-card__body">
                <span>Completed {formatDate(c.issued_at)}</span>
                <span className="muted small">Instructor: {c.instructor_name}</span>
                <span className="mc-card__code">ID {c.code}</span>
              </div>
              <div className="mc-card__actions">
                <Link to={`/certificate/${c.code}`} className="btn btn--primary btn--sm"><i className="fas fa-eye" /> View</Link>
                <Link to={`/certificate/${c.code}?print=1`} className="btn btn--outline btn--sm"><i className="fas fa-download" /> Download</Link>
                <a href={c.linkedin_url} className="btn btn--outline btn--sm" target="_blank" rel="noopener noreferrer"><i className="fab fa-linkedin" /> Add to LinkedIn</a>
                <button type="button" className="btn btn--text btn--sm" onClick={() => setSharing(sharing === c.code ? null : c.code)} aria-expanded={sharing === c.code}>
                  <i className="fas fa-share-nodes" /> Share
                </button>
              </div>
              {sharing === c.code && (
                <div className="mc-card__actions">
                  <ShareButtons url={`${window.location.origin}/certificate/${c.code}`} text={`I earned a certificate in ${c.course_title} from ${c.platform_name}!`} />
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </PortalLayout>
  );
};

export default MyCertificatesPage;

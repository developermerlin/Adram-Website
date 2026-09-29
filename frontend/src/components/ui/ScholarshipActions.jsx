import { Link } from 'react-router-dom';
import { portalAPI } from '../../services/api';

// Where signed-out visitors go when they want an official website or to save/track a scholarship.
const joinPath = (slug) => `/join?next=${encodeURIComponent(`/scholarships/${slug}`)}`;

/**
 * The provider's official website. The API only sends `url` to signed-in users; visitors get
 * `link_locked` and are sent to the Join page. Returns null when the admin has hidden the link.
 */
export const OfficialLink = ({ scholarship: s, className, children }) => {
  if (s.url) {
    return (
      // Recorded on the student's activity timeline (fire-and-forget; the link opens regardless).
      <a href={s.url} target="_blank" rel="noopener noreferrer" className={className} onClick={() => portalAPI.openedLink(s.slug).catch(() => {})}>
        {children}
      </a>
    );
  }
  if (s.link_locked) {
    return (
      <Link to={joinPath(s.slug)} className={className}>
        {children} <i className="fas fa-lock official-lock" aria-label="(free account needed)" />
      </Link>
    );
  }
  return null;
};

/** Save + Track buttons. Students act on their portal; visitors are invited to join first. */
export const PortalButtons = ({ scholarship: s, portal, signedIn, className = 'btn btn--ghost-light' }) => {
  if (!signedIn) {
    return (
      <Link to={joinPath(s.slug)} className={className}>
        <i className="far fa-bookmark" /> Save
      </Link>
    );
  }
  if (!portal.isStudent) return null;
  const saved = portal.isSaved(s.slug);
  const application = portal.applicationFor(s.slug);
  return (
    <>
      <button type="button" className={className} aria-pressed={saved} onClick={() => portal.toggleSave(s)} disabled={!portal.data}>
        <i className={`${saved ? 'fas' : 'far'} fa-bookmark`} /> {saved ? 'Saved' : 'Save'}
      </button>
      {application ? (
        <Link to="/student/applications" className={className}>
          <i className="fas fa-list-check" /> {application.stage_display}: view in portal
        </Link>
      ) : (
        <button type="button" className={className} onClick={() => portal.startApplication(s)} disabled={!portal.data}>
          <i className="fas fa-list-check" /> Track my application
        </button>
      )}
    </>
  );
};

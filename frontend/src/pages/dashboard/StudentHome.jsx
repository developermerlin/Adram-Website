import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { currentTrack, TRACK_ORDER, TRACKS } from '../../config/tracks';
import PortalLayout from '../../components/layout/PortalLayout';
import { JoinTrackCard } from '../../components/portal/TrackGate';
import { greeting } from '../../utils/format';

/**
 * /student/dashboard: sends students to the dashboard of the side they use (the last one, if they use both).
 * Accounts that haven't chosen yet (e.g. signed up with Google) pick here.
 */
export const StudentHome = () => {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const track = currentTrack(user, pathname);
  if (track) return <Navigate to={TRACKS[track].home} replace />;
  return (
    <PortalLayout title="Welcome to ADRAM" subtitle="Choose what you’re here for. You can add the other one at any time.">
      <section className="side-choose">
        <p className="side-choose__hello">{greeting()}, <strong>{user?.first_name}</strong>. What would you like to do?</p>
        <div className="side-choose__grid">
          {TRACK_ORDER.map((t) => <JoinTrackCard key={t} track={t} />)}
        </div>
      </section>
    </PortalLayout>
  );
};

export default StudentHome;

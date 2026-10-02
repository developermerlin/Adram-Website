import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { TRACKS, tracksOf } from '../../config/tracks';
import { Spinner } from '../ui/Section';

/** "Start training" / "Start with scholarships": adds that side to the account, then opens its dashboard. */
export const JoinTrackCard = ({ track, primary = true }) => {
  const { joinTrack } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const info = TRACKS[track];
  const join = async () => {
    setBusy(true);
    try {
      await joinTrack(track);
      toast.success(`${info.label} added to your account`);
      navigate(info.home);
    } catch {
      toast.error('That didn’t work. Please try again.');
      setBusy(false);
    }
  };
  return (
    <section className={`card panel side-join side-join--${track}`}>
      <span className="side-join__icon" aria-hidden="true"><i className={`fas ${info.icon}`} /></span>
      <h2 className="h3">{info.label}</h2>
      <p className="muted">{info.pitch}</p>
      <div className="side-join__actions">
        <button type="button" className={`btn ${primary ? 'btn--primary' : 'btn--outline'}`} onClick={join} disabled={busy}>
          {busy && <span className="btn-spinner" />} {info.join}
        </button>
        <Link to={info.browse} className="btn btn--text">Browse first</Link>
      </div>
    </section>
  );
};

/**
 * A page from one side of the portal, for students who signed up for that side. Anyone else is sent to their
 * own dashboard (or, with no side yet, to the chooser): a student only sees the side they joined for.
 */
const TrackGate = ({ track, children }) => {
  const { user, refreshUser } = useAuth();
  const mine = tracksOf(user);
  const allowed = mine.includes(track);
  // The server adds a side when they enrol or apply on the public site, so check again before sending them away.
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    if (allowed) return undefined;
    let live = true;
    refreshUser().catch(() => {}).finally(() => live && setChecked(true));
    return () => {
      live = false;
    };
  }, [allowed, refreshUser]);
  if (allowed) return children;
  if (!checked) return <Spinner label="Loading…" />;
  return <Navigate to={mine.length ? TRACKS[mine[0]].home : '/student/dashboard'} replace />;
};

export default TrackGate;

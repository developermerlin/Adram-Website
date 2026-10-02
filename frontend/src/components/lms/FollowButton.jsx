import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { lmsAPI, parseApiErrors } from '../../services/api';

/**
 * Follow an instructor: their followers hear about each new course. Signed-out visitors are sent to sign in first.
 * `profile` has {id, followers, following}; `onChange` gets the new numbers.
 */
export const FollowButton = ({ profile, onChange }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  if (user && user.id === profile.id) return null;

  const toggle = async () => {
    if (!user) {
      navigate('/login', { state: { from: location.pathname } });
      return;
    }
    setBusy(true);
    try {
      const { data } = await lmsAPI.follow(profile.id, !profile.following);
      onChange(data);
      if (data.following) toast.success('Following. You’ll hear about new courses.');
    } catch (err) {
      toast.error(parseApiErrors(err).detail || 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" className={`btn ${profile.following ? 'btn--outline' : 'btn--primary'} ip-follow`} onClick={toggle} disabled={busy} aria-pressed={Boolean(profile.following)}>
      <i className={`fas ${profile.following ? 'fa-user-check' : 'fa-user-plus'}`} aria-hidden="true" /> {profile.following ? 'Following' : 'Follow'}
    </button>
  );
};

export default FollowButton;

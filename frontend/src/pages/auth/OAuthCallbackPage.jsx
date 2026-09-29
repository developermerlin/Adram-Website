import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { dashboardPathFor } from '../../config/roles';
import { parseApiErrors } from '../../services/api';
import Brand from '../../components/ui/Brand';
import '../../styles/portal.css';

// Landing page after Google / Facebook / GitHub: swaps the one-time code for a session.
export const OAuthCallbackPage = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { loginWithOAuthCode } = useAuth();
  const [error, setError] = useState('');
  const started = useRef(false); // StrictMode runs effects twice in development; the code only works once

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const code = params.get('code');
    if (!code) {
      navigate('/login', { replace: true });
      return;
    }
    loginWithOAuthCode(code, params.get('new') === '1')
      .then((user) => {
        const next = params.get('next');
        navigate(next && next.startsWith('/') && !next.startsWith('//') ? next : dashboardPathFor(user.role), { replace: true });
      })
      .catch((err) => setError(parseApiErrors(err, 'We couldn’t complete your sign-in.').form));
  }, [params, navigate, loginWithOAuthCode]);

  return (
    <div className="oauth-callback">
      <Brand />
      {error ? (
        <div className="oauth-callback__box">
          <span className="oauth-callback__icon oauth-callback__icon--error"><i className="fas fa-triangle-exclamation" /></span>
          <h1>Sign-in didn’t complete</h1>
          <p>{error}</p>
          <Link to="/login" className="btn btn--primary"><i className="fas fa-right-to-bracket" /> Back to sign in</Link>
        </div>
      ) : (
        <div className="oauth-callback__box" role="status">
          <span className="spinner" />
          <h1>Signing you in…</h1>
          <p>Just a moment while we set up your session.</p>
        </div>
      )}
    </div>
  );
};

export default OAuthCallbackPage;

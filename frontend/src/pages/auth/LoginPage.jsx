import { useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { parseApiErrors } from '../../services/api';
import AuthLayout from '../../components/layout/AuthLayout';
import { Alert, PasswordField, TextField } from '../../components/ui/Form';
import OAuthButtons from '../../components/ui/OAuthButtons';
import OtpVerify from '../../components/ui/OtpVerify';
import { isInfoCode, oauthErrorMessage } from '../../utils/oauth';

const panel = {
  eyebrow: 'ADRAM portal',
  heading: 'Welcome back. Pick up right where you left off.',
  text: 'Sign in to manage your applications, training and account in one secure place.',
  points: [
    { icon: 'graduate', title: 'Scholarship applications', text: 'Track progress and deadlines for every application.' },
    { icon: 'shield', title: 'Protected with email codes', text: 'Every sign-in is confirmed with a one-time code.' },
    { icon: 'discover', title: 'Your counsellor', text: 'Stay in touch with the ADRAM team.' },
  ],
};

export const LoginPage = () => {
  const { login, verifyOtp } = useAuth();
  const location = useLocation();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ email: '', password: '' });
  const [remember, setRemember] = useState(true);
  const [challenge, setChallenge] = useState(null); // set once the password is accepted and a code is emailed
  // Messages come from a failed social sign-in (?oauth_error=) or a blocked account (403 with a code).
  const [message, setMessage] = useState(() => {
    const code = params.get('oauth_error');
    return code ? { type: isInfoCode(code) ? 'info' : 'error', text: oauthErrorMessage(code, params.get('provider')) } : null;
  });
  const [submitting, setSubmitting] = useState(false);

  // Set by ProtectedRoute when someone opens a portal page while signed out.
  const from = location.state?.from;

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setMessage(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      setChallenge(await login(form.email.trim(), form.password, remember));
    } catch (err) {
      const data = err.response?.data || {};
      if (err.response?.status === 401) {
        setMessage({ type: 'error', text: 'That email and password don’t match an account. Check them and try again.' });
      } else if (data.code) {
        setMessage({ type: isInfoCode(data.code) ? 'info' : 'error', text: data.detail });
      } else {
        const errors = parseApiErrors(err);
        setMessage({ type: 'error', text: errors.form || Object.values(errors)[0] });
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Signing in unlocks the portal; GuestRoute then redirects to the dashboard. A pending account gets a message instead.
  const handleCode = async (code) => {
    const data = await verifyOtp(challenge.challenge, code);
    if (!data.access) {
      setChallenge(null);
      setMessage({ type: isInfoCode(data.status) ? 'info' : 'error', text: data.detail });
    }
  };

  if (challenge) {
    const verifyingEmail = challenge.purpose === 'REGISTER';
    return (
      <AuthLayout
        title={verifyingEmail ? 'Verify your email' : 'Check your email'}
        subtitle={verifyingEmail ? 'Confirm your email address to finish setting up your account.' : 'Enter the code to finish signing in.'}
        panel={panel}
        switchTo={{ text: 'New to ADRAM?', to: '/register', label: 'Create an account' }}
      >
        <OtpVerify
          challenge={challenge.challenge}
          email={challenge.email}
          onSubmit={handleCode}
          onBack={() => setChallenge(null)}
          submitLabel={verifyingEmail ? 'Verify email' : 'Verify and sign in'}
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Sign in to your account"
      subtitle="Welcome back! Choose how you’d like to sign in."
      panel={panel}
      switchTo={{ text: 'New to ADRAM?', to: '/register', label: 'Create an account' }}
    >
      {from && !message && <Alert type="info">Please sign in to continue to that page.</Alert>}
      {message && <Alert type={message.type}>{message.text}</Alert>}

      <OAuthButtons action="Sign in" next={from} />
      <div className="auth__divider"><span>or sign in with email</span></div>

      <form className="form-grid form-grid--tight" onSubmit={handleSubmit}>
        <TextField name="email" label="Email address" type="email" autoComplete="email" placeholder="you@example.com" required value={form.email} onChange={handleChange} />
        <PasswordField
          name="password"
          label="Password"
          autoComplete="current-password"
          placeholder="Enter your password"
          required
          value={form.password}
          onChange={handleChange}
          labelAside={<Link to="/forgot-password" className="field__link">Forgot password?</Link>}
        />

        <label className="checkbox">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span>
          <span>
            Keep me signed in <small>Untick on shared or public computers.</small>
          </span>
        </label>

        <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={submitting}>
          {submitting ? <><span className="btn-spinner" /> Checking…</> : <><i className="fas fa-right-to-bracket" /> Continue</>}
        </button>
      </form>

      <p className="auth__alt">
        Don’t have an account? <Link to="/register">Sign up for free</Link>
        <span>We’ll email you a one-time code to confirm it’s you.</span>
      </p>
    </AuthLayout>
  );
};

export default LoginPage;

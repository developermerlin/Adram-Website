import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authAPI, parseApiErrors } from '../../services/api';
import AuthLayout from '../../components/layout/AuthLayout';
import { Alert, PasswordChecklist, PasswordField, TextField } from '../../components/ui/Form';
import OtpVerify from '../../components/ui/OtpVerify';
import { isStrongPassword } from '../../utils/password';

const panel = {
  eyebrow: 'Account recovery',
  heading: 'Locked out? We’ll help you get back in.',
  text: 'Resetting your password only takes a moment. Your applications and progress stay safe.',
  points: [
    { icon: 'mail', title: 'Get a code by email', text: 'We send a 6-digit code to the address on your account.' },
    { icon: 'shield', title: 'Choose a new password', text: 'Pick a strong password you don’t use elsewhere.' },
    { icon: 'support', title: 'Still stuck?', text: 'Our team can help you by phone, WhatsApp or email.' },
  ],
};

const switchTo = { text: 'Remembered it?', to: '/login', label: 'Sign in' };

export const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('');
  const [challenge, setChallenge] = useState(null);
  const [passwords, setPasswords] = useState({ new_password: '', new_password_confirm: '' });
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const requestCode = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      // Same answer whether or not the email has an account, so accounts can't be discovered here.
      const { data } = await authAPI.requestPasswordReset(email.trim());
      setChallenge(data);
    } catch (err) {
      setError(parseApiErrors(err).form);
    } finally {
      setSubmitting(false);
    }
  };

  const resetPassword = async (code) => {
    await authAPI.confirmPasswordReset({ challenge: challenge.challenge, code, ...passwords });
    setDone(true);
  };

  const setPassword = (e) => setPasswords((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  const passwordsOk = isStrongPassword(passwords.new_password) && passwords.new_password === passwords.new_password_confirm;
  const mismatch = passwords.new_password_confirm && passwords.new_password !== passwords.new_password_confirm;

  if (done) {
    return (
      <AuthLayout title="Password updated" panel={panel} switchTo={switchTo}>
        <div className="auth-success">
          <span className="auth-success__icon"><i className="fas fa-check" /></span>
          <p>Your password has been reset and any old sessions were signed out. You can now sign in with your new password.</p>
          <Link to="/login" className="btn btn--primary btn--block"><i className="fas fa-right-to-bracket" /> Sign in</Link>
        </div>
      </AuthLayout>
    );
  }

  if (challenge) {
    return (
      <AuthLayout title="Set a new password" subtitle="Enter the code from your email and choose a new password." panel={panel} switchTo={switchTo}>
        <OtpVerify
          challenge={challenge.challenge}
          email={challenge.email}
          onSubmit={resetPassword}
          onBack={() => setChallenge(null)}
          submitLabel="Reset password"
          canSubmit={passwordsOk}
        >
          <div className="form-grid form-grid--tight">
            <PasswordField name="new_password" label="New password" required autoComplete="new-password" placeholder="Create a strong password" value={passwords.new_password} onChange={setPassword} />
            {passwords.new_password && <PasswordChecklist password={passwords.new_password} />}
            <PasswordField
              name="new_password_confirm"
              label="Confirm new password"
              required
              autoComplete="new-password"
              placeholder="Type it again"
              value={passwords.new_password_confirm}
              onChange={setPassword}
              error={mismatch ? 'Passwords do not match.' : undefined}
            />
          </div>
        </OtpVerify>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter the email you signed up with and we’ll send you a 6-digit code."
      panel={panel}
      switchTo={switchTo}
      footer={<Link to="/login"><i className="fas fa-arrow-left" /> Back to sign in</Link>}
    >
      <Alert>{error}</Alert>
      <form className="form-grid" onSubmit={requestCode}>
        <TextField
          name="email"
          label="Email address"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
          autoFocus
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError('');
          }}
        />
        <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={submitting}>
          {submitting ? <><span className="btn-spinner" /> Sending…</> : <><i className="fas fa-paper-plane" /> Send code</>}
        </button>
      </form>
    </AuthLayout>
  );
};

export default ForgotPasswordPage;

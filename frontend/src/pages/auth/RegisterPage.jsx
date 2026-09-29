import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { parseApiErrors } from '../../services/api';
import { countries } from '../../data/countries';
import AuthLayout from '../../components/layout/AuthLayout';
import { Alert, PasswordChecklist, PasswordField, TextField } from '../../components/ui/Form';
import { isStrongPassword } from '../../utils/password';
import OAuthButtons from '../../components/ui/OAuthButtons';
import OtpVerify from '../../components/ui/OtpVerify';

const initialForm = {
  first_name: '',
  last_name: '',
  email: '',
  phone_number: '',
  country: 'Sierra Leone',
  password: '',
  password_confirm: '',
};

// Fields on step 1; server errors for these send the user back to that step.
const STEP_ONE_FIELDS = ['first_name', 'last_name', 'email', 'phone_number', 'country'];

const panel = {
  eyebrow: 'Free student account',
  heading: 'Start your journey with ADRAM today.',
  text: 'One account for scholarship applications, training programmes and support from our counsellors.',
  points: [
    { icon: 'award', title: 'Apply for scholarships', text: 'Find opportunities abroad and track every application.' },
    { icon: 'laptop', title: 'Enrol in training', text: 'Practical tech courses taught by professionals.' },
    { icon: 'support', title: 'Expert guidance', text: 'Counsellors who help you at every step.' },
  ],
};

const STEPS = ['About you', 'Secure account', 'Verify email'];

const Stepper = ({ step }) => (
  <ol className="stepper stepper--3" aria-label="Registration progress">
    {STEPS.map((label, i) => {
      const n = i + 1;
      const state = step > n ? 'is-done' : step === n ? 'is-current' : '';
      return (
        <li key={label} className={state} aria-current={step === n ? 'step' : undefined}>
          <span className="stepper__num">{step > n ? <i className="fas fa-check" /> : n}</span>
          <span className="stepper__label">
            <small>Step {n} of {STEPS.length}</small>
            {label}
          </span>
        </li>
      );
    })}
  </ol>
);

export const RegisterPage = () => {
  const { register, verifyOtp } = useAuth();
  const location = useLocation(); // state.from: where to go after sign-up (set by the Join page)
  const [step, setStep] = useState(1);
  const [challenge, setChallenge] = useState(null);
  const [done, setDone] = useState(null); // { detail } once the email is verified
  const [form, setForm] = useState(initialForm);
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name] || errors.form) setErrors((prev) => ({ ...prev, [name]: undefined, form: undefined }));
  };

  // Step 1 uses the browser's own validation (required, email format) before moving on.
  const goToSecurity = (e) => {
    e.preventDefault();
    setErrors({});
    setStep(2);
  };

  // Creates the account; the API emails a code and the form moves to step 3.
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isStrongPassword(form.password)) {
      setErrors({ password: 'Your password doesn’t meet all the requirements below.' });
      return;
    }
    if (form.password !== form.password_confirm) {
      setErrors({ password_confirm: 'Passwords do not match.' });
      return;
    }
    setSubmitting(true);
    try {
      const data = await register({
        ...form,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        phone_number: form.phone_number.replace(/[\s-]/g, ''),
      });
      setChallenge(data);
      setStep(3);
    } catch (err) {
      const parsed = parseApiErrors(err, 'Registration failed. Please check your details.');
      setErrors(parsed);
      if (STEP_ONE_FIELDS.some((f) => parsed[f])) setStep(1);
    } finally {
      setSubmitting(false);
    }
  };

  // Students are approved when their email is verified, so they're signed in and GuestRoute sends them
  // on to state.from (or their dashboard). Accounts that still need approval see the screen below.
  const handleCode = async (code) => {
    const data = await verifyOtp(challenge.challenge, code);
    if (!data.access) setDone(data);
  };

  if (done) {
    return (
      <AuthLayout title="Email verified" panel={panel} switchTo={{ text: 'Already approved?', to: '/login', label: 'Sign in' }}>
        <div className="auth-success">
          <span className="auth-success__icon"><i className="fas fa-check" /></span>
          <h2 className="auth-success__title">You’re all set, {form.first_name}!</h2>
          <p>{done.detail}</p>
          <ol className="next-steps">
            <li className="is-done"><i className="fas fa-circle-check" /> Account created</li>
            <li className="is-done"><i className="fas fa-circle-check" /> Email verified</li>
            <li><i className="fas fa-hourglass-half" /> Waiting for administrator approval</li>
          </ol>
          <div className="auth-success__actions">
            <Link to="/scholarships" className="btn btn--primary"><i className="fas fa-graduation-cap" /> Explore scholarships</Link>
            <Link to="/" className="btn btn--outline"><i className="fas fa-house" /> Back to website</Link>
          </div>
        </div>
      </AuthLayout>
    );
  }

  const confirmMismatch = form.password_confirm && form.password !== form.password_confirm;

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Free for students and trainees. It takes about two minutes."
      panel={panel}
      switchTo={{ text: 'Already have an account?', to: '/login', label: 'Sign in' }}
      wide
    >
      <Stepper step={step} />
      <Alert>{errors.form}</Alert>

      {step === 3 && challenge ? (
        <OtpVerify challenge={challenge.challenge} email={challenge.email} onSubmit={handleCode} submitLabel="Verify email" />
      ) : step === 1 ? (
        <form className="form-grid form-grid--tight" onSubmit={goToSecurity}>
          <OAuthButtons action="Sign up" next={location.state?.from} />
          <div className="auth__divider auth__divider--flush"><span>or sign up with email</span></div>

          <fieldset className="form-section">
            <legend>Personal details</legend>
            <div className="form-row">
              <TextField name="first_name" label="First name" required autoComplete="given-name" autoFocus placeholder="e.g. Fatmata" value={form.first_name} onChange={handleChange} error={errors.first_name} />
              <TextField name="last_name" label="Last name" required autoComplete="family-name" placeholder="e.g. Sesay" value={form.last_name} onChange={handleChange} error={errors.last_name} />
            </div>
          </fieldset>

          <fieldset className="form-section">
            <legend>Contact details</legend>
            <TextField
              name="email"
              label="Email address"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={handleChange}
              error={errors.email}
            />
            <div className="form-row">
              <TextField
                name="phone_number"
                label={<>Phone number <span className="optional">(optional)</span></>}
                type="tel"
                autoComplete="tel"
                placeholder="+232 76 000 000"
                value={form.phone_number}
                onChange={handleChange}
                error={errors.phone_number}
              />
              <div className="field">
                <label htmlFor="country">Country of residence</label>
                <select id="country" name="country" className="input" autoComplete="country-name" value={form.country} onChange={handleChange} aria-invalid={Boolean(errors.country)}>
                  {countries.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                {errors.country && <p className="field-error">{errors.country}</p>}
              </div>
            </div>
          </fieldset>

          <button type="submit" className="btn btn--primary btn--block btn--lg">
            Continue <i className="fas fa-arrow-right" />
          </button>
        </form>
      ) : (
        <form className="form-grid form-grid--tight" onSubmit={handleSubmit}>
          <div className="review-box">
            <div>
              <strong>{form.first_name} {form.last_name}</strong>
              <span>{form.email}{form.country ? ` · ${form.country}` : ''}</span>
            </div>
            <button type="button" className="btn btn--text btn--sm" onClick={() => setStep(1)}>
              <i className="fas fa-pen" /> Edit
            </button>
          </div>

          <fieldset className="form-section">
            <PasswordField name="password" label="Password" required autoComplete="new-password" autoFocus placeholder="Create a strong password" value={form.password} onChange={handleChange} error={errors.password} />
            <PasswordChecklist password={form.password} />
            <PasswordField
              name="password_confirm"
              label="Confirm password"
              required
              autoComplete="new-password"
              placeholder="Type it again"
              value={form.password_confirm}
              onChange={handleChange}
              error={errors.password_confirm || (confirmMismatch ? 'Passwords do not match.' : undefined)}
            />
          </fieldset>

          <label className="checkbox">
            <input type="checkbox" required checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span>
            <span>
              I confirm my details are accurate and agree to be contacted about my account and applications.
            </span>
          </label>

          <div className="form-actions form-actions--split">
            <button type="button" className="btn btn--outline" onClick={() => setStep(1)}>
              <i className="fas fa-arrow-left" /> Back
            </button>
            <button type="submit" className="btn btn--primary btn--lg" disabled={submitting || !agreed}>
              {submitting ? <><span className="btn-spinner" /> Creating account…</> : <><i className="fas fa-user-check" /> Create account</>}
            </button>
          </div>
        </form>
      )}

      {step === 1 && (
      <p className="auth__alt">
        Already have an account? <Link to="/login">Sign in</Link>
        <span>For students and trainees. Staff accounts are created by an administrator.</span>
      </p>
      )}
    </AuthLayout>
  );
};

export default RegisterPage;

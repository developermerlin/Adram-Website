import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { lmsAdminAPI, parseApiErrors } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { ROLES } from '../../config/roles';
import { Alert } from '../ui/Form';
import '../../styles/dialog.css';

// What each role is for, shown under the role picker.
const ROLE_HINTS = {
  TEAM_MEMBER: 'Gets a portfolio page on the Team page (created now, published by you) and an inbox for people who message them.',
  INSTRUCTOR: 'Creates and teaches courses.',
  SCHOLARSHIP_MANAGER: 'Manages the scholarship listings.',
  FINANCE_MANAGER: 'Works with payments.',
  COUNSELLOR: 'Advises students.',
  STUDENT: 'Uses the student portal for training and scholarships.',
  ADMIN: 'Full access to the admin dashboard.',
};

/** A strong temporary password: letters, numbers and a symbol, without look-alike characters. */
const makePassword = () => {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '!@#$%&*?'];
  const all = sets.join('');
  const pick = (chars) => chars[crypto.getRandomValues(new Uint32Array(1))[0] % chars.length];
  const chars = [...sets.map(pick), ...Array.from({ length: 10 }, () => pick(all))];
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
};

const Field = ({ id, label, error, hint, children, wide = false }) => (
  <div className={`cu-field${wide ? ' cu-field--wide' : ''}`}>
    <label htmlFor={id}>{label}</label>
    {children}
    {error ? <p className="field-error" id={`${id}-error`}>{error}</p> : hint && <p className="cu-hint">{hint}</p>}
  </div>
);

/**
 * An administrator creates an account (an instructor, a team member, ...) with a temporary password; it is approved
 * and verified straight away. With `initialRole="TEAM_MEMBER"` it is the "New team member" form.
 */
export const CreateUserDialog = ({ onClose, onCreated, initialRole = 'INSTRUCTOR' }) => {
  const { user: me } = useAuth();
  const [form, setForm] = useState({ email: '', first_name: '', last_name: '', role: initialRole, password: '', job_title: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const first = useRef(null);
  const set = (key) => (e) => { setForm((f) => ({ ...f, [key]: e.target.value })); setErrors((x) => ({ ...x, [key]: undefined })); };
  const roles = Object.entries(ROLES).filter(([value]) => value !== 'ADMIN' || me?.is_superuser);
  const teamForm = initialRole === 'TEAM_MEMBER';
  const isTeam = form.role === 'TEAM_MEMBER';

  // Escape closes; the page behind doesn't scroll; the first field is ready to type in
  useEffect(() => {
    first.current?.focus();
    const onKey = (e) => e.key === 'Escape' && !busy && onClose();
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = before; };
  }, [onClose, busy]);

  const generate = () => {
    setForm((f) => ({ ...f, password: makePassword() }));
    setShowPassword(true);
    setErrors((x) => ({ ...x, password: undefined }));
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(form.password);
      toast.success('Password copied.');
    } catch {
      toast.error('Couldn’t copy. Select the password and copy it.');
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await lmsAdminAPI.createUser(form);
      toast.success(data.team_profile_id
        ? `${form.first_name}’s account and team profile are ready. Share the temporary password with them.`
        : `Account created for ${data.email}. Share the temporary password with them.`);
      onCreated(data);
    } catch (err) {
      setErrors(parseApiErrors(err));
      setBusy(false);
    }
  };

  return (
    <div className="modal cu" role="dialog" aria-modal="true" aria-labelledby="create-user-title">
      <button type="button" className="modal__backdrop" aria-label="Close" tabIndex={-1} onClick={() => !busy && onClose()} />
      <form className="cu-card" onSubmit={submit} noValidate>
        <header className="cu-head">
          <span className="cu-head__icon" aria-hidden="true"><i className={`fas ${isTeam ? 'fa-id-badge' : 'fa-user-plus'}`} /></span>
          <div>
            <h2 id="create-user-title">{teamForm ? 'New team member' : 'Create a user'}</h2>
            <p>{isTeam ? 'Creates their account and their team portfolio. You can fill in and publish the portfolio next.'
              : 'The account is approved and ready to use straight away.'}</p>
          </div>
          <button type="button" className="cu-close" aria-label="Close" onClick={onClose} disabled={busy}><i className="fas fa-xmark" /></button>
        </header>

        <div className="cu-body">
          <fieldset className="cu-group">
            <legend>Person</legend>
            <div className="cu-grid">
              <Field id="cu-first" label="First name" error={errors.first_name}>
                <input ref={first} id="cu-first" name="first_name" className="input" autoComplete="off" placeholder="e.g. Aminata"
                  value={form.first_name} onChange={set('first_name')} aria-invalid={Boolean(errors.first_name)} />
              </Field>
              <Field id="cu-last" label="Last name" error={errors.last_name}>
                <input id="cu-last" name="last_name" className="input" autoComplete="off" placeholder="e.g. Conteh"
                  value={form.last_name} onChange={set('last_name')} aria-invalid={Boolean(errors.last_name)} />
              </Field>
              <Field id="cu-email" label="Email address" error={errors.email} hint="They sign in with this email." wide>
                <input id="cu-email" name="email" type="email" className="input" autoComplete="off" placeholder="name@example.com"
                  value={form.email} onChange={set('email')} aria-invalid={Boolean(errors.email)} />
              </Field>
            </div>
          </fieldset>

          <fieldset className="cu-group">
            <legend>Role</legend>
            <div className="cu-grid">
              <Field id="cu-role" label="Role" error={errors.role} wide={!isTeam}>
                <select id="cu-role" className="input" value={form.role} onChange={set('role')}>
                  {roles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
              {isTeam && (
                <Field id="cu-title" label="Job title" error={errors.job_title}>
                  <input id="cu-title" name="job_title" className="input" placeholder="e.g. Lead Software Engineer" maxLength={120}
                    value={form.job_title} onChange={set('job_title')} />
                </Field>
              )}
            </div>
            {ROLE_HINTS[form.role] && <p className="cu-note"><i className="fas fa-circle-info" aria-hidden="true" /> {ROLE_HINTS[form.role]}</p>}
          </fieldset>

          <fieldset className="cu-group">
            <legend>Sign-in</legend>
            <Field id="cu-password" label="Temporary password" error={errors.password}
              hint="At least 8 characters with letters, numbers and a symbol. They should change it after signing in.">
              <div className="cu-password">
                <input id="cu-password" name="password" className="input" type={showPassword ? 'text' : 'password'} autoComplete="new-password"
                  value={form.password} onChange={set('password')} aria-invalid={Boolean(errors.password)} />
                <button type="button" className="cu-icon-btn" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'} title={showPassword ? 'Hide' : 'Show'}>
                  <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`} />
                </button>
                {form.password && (
                  <button type="button" className="cu-icon-btn" onClick={copy} aria-label="Copy password" title="Copy"><i className="far fa-copy" /></button>
                )}
              </div>
            </Field>
            <button type="button" className="btn btn--outline btn--sm cu-generate" onClick={generate}><i className="fas fa-key" /> Generate a strong password</button>
          </fieldset>
          <Alert>{errors.form || errors.detail}</Alert>
        </div>

        <footer className="cu-foot">
          <button type="button" className="btn btn--outline" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? <span className="btn-spinner" /> : <i className={`fas ${isTeam ? 'fa-id-badge' : 'fa-user-plus'}`} />} Create<span className="cu-long">{isTeam ? ' team member' : ' user'}</span>
          </button>
        </footer>
      </form>
    </div>
  );
};

export default CreateUserDialog;

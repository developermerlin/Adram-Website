import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { parseApiErrors } from '../../services/api';
import { ROLES } from '../../config/roles';
import { formatDate } from '../../utils/format';
import PortalLayout from '../../components/layout/PortalLayout';
import Avatar from '../../components/ui/Avatar';
import { Alert, PasswordChecklist, PasswordField, TextField } from '../../components/ui/Form';
import { isStrongPassword } from '../../utils/password';
import LearningProfileCard from '../../components/lms/LearningProfileCard';
import EmailPrefsCard from '../../components/account/EmailPrefsCard';
import { DevicesCard, TwoStepCard } from '../../components/account/SecurityCards';

const MAX_PHOTO_MB = 5;
const emptyPasswords = { old_password: '', new_password: '', new_password_confirm: '' };

const PhotoCard = () => {
  const { user, uploadProfilePicture, removeProfilePicture } = useAuth();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const run = async (action) => {
    setBusy(true);
    try {
      await action();
    } catch (err) {
      const errors = parseApiErrors(err, 'Could not update your photo.');
      toast.error(errors.profile_picture || errors.form);
    } finally {
      setBusy(false);
    }
  };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow choosing the same file again
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error('Please choose an image file.');
    if (file.size > MAX_PHOTO_MB * 1024 * 1024) return toast.error(`Photos must be smaller than ${MAX_PHOTO_MB} MB.`);
    run(() => uploadProfilePicture(file));
  };

  return (
    <section className="card profile-card">
      <Avatar person={user} size={96} className="profile-card__avatar" />
      <div className="profile-card__info">
        <h2 className="h3">{user?.full_name}</h2>
        <p className="muted">{user?.email}</p>
        <div className="profile-card__badges">
          <span className="badge badge--blue">{ROLES[user?.role] || user?.role}</span>
          <span className={`badge ${user?.is_verified ? 'badge--green' : 'badge--amber'}`}>
            {user?.is_verified ? 'Verified' : 'Verification pending'}
          </span>
          <span className="tag">Member since {formatDate(user?.created_at)}</span>
        </div>
      </div>
      <div className="profile-card__actions">
        <input ref={inputRef} type="file" accept="image/*" hidden onChange={handleFile} />
        <button type="button" className="btn btn--outline btn--sm" disabled={busy} onClick={() => inputRef.current?.click()}>
          <i className="fas fa-camera" /> {user?.profile_picture ? 'Change photo' : 'Upload photo'}
        </button>
        {user?.profile_picture && (
          <button type="button" className="btn btn--text btn--sm" disabled={busy} onClick={() => run(removeProfilePicture)}>
            Remove
          </button>
        )}
      </div>
    </section>
  );
};

const ProfileForm = () => {
  const { user, updateProfile } = useAuth();
  const initial = {
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
    phone_number: user?.phone_number || '',
    country: user?.country || '',
  };
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const dirty = Object.keys(initial).some((key) => form[key] !== initial[key]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateProfile({ ...form, phone_number: form.phone_number.replace(/\s/g, '') });
      setErrors({});
    } catch (err) {
      setErrors(parseApiErrors(err, 'Could not save your profile.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="card panel form-grid" onSubmit={handleSubmit}>
      <div>
        <h2 className="h3">Personal details</h2>
        <p className="muted">This is how ADRAM staff will see and contact you.</p>
      </div>
      <Alert>{errors.form}</Alert>
      <div className="form-row">
        <TextField name="first_name" label="First name" required autoComplete="given-name" value={form.first_name} onChange={handleChange} error={errors.first_name} />
        <TextField name="last_name" label="Last name" required autoComplete="family-name" value={form.last_name} onChange={handleChange} error={errors.last_name} />
      </div>
      <TextField name="email" label="Email address" value={user?.email || ''} disabled hint="Contact us if you need to change the email on your account." />
      <div className="form-row">
        <TextField name="phone_number" label="Phone" type="tel" autoComplete="tel" placeholder="+232 76 000 000" value={form.phone_number} onChange={handleChange} error={errors.phone_number} />
        <TextField name="country" label="Country" autoComplete="country-name" value={form.country} onChange={handleChange} error={errors.country} />
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn--text" disabled={!dirty || saving} onClick={() => { setForm(initial); setErrors({}); }}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary" disabled={!dirty || saving}>
          {saving ? <><span className="btn-spinner" /> Saving…</> : 'Save changes'}
        </button>
      </div>
    </form>
  );
};

const PasswordForm = () => {
  const { changePassword } = useAuth();
  const [form, setForm] = useState(emptyPasswords);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name] || errors.form) setErrors((prev) => ({ ...prev, [name]: undefined, form: undefined }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isStrongPassword(form.new_password)) {
      setErrors({ new_password: 'Your new password doesn’t meet all the requirements.' });
      return;
    }
    if (form.new_password !== form.new_password_confirm) {
      setErrors({ new_password_confirm: 'New passwords do not match.' });
      return;
    }
    setSaving(true);
    try {
      await changePassword(form);
      setForm(emptyPasswords);
      setErrors({});
    } catch (err) {
      setErrors(parseApiErrors(err, 'Could not change your password.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="card panel form-grid" onSubmit={handleSubmit}>
      <div>
        <h2 className="h3">Password</h2>
        <p className="muted">Choose a strong password you don’t use anywhere else.</p>
      </div>
      <Alert>{errors.form}</Alert>
      <PasswordField name="old_password" label="Current password" required autoComplete="current-password" value={form.old_password} onChange={handleChange} error={errors.old_password} />
      <PasswordField name="new_password" label="New password" required autoComplete="new-password" value={form.new_password} onChange={handleChange} error={errors.new_password} />
      {form.new_password && <PasswordChecklist password={form.new_password} />}
      <PasswordField name="new_password_confirm" label="Confirm new password" required autoComplete="new-password" value={form.new_password_confirm} onChange={handleChange} error={errors.new_password_confirm} />
      <div className="form-actions">
        <button type="submit" className="btn btn--primary" disabled={saving}>
          {saving ? <><span className="btn-spinner" /> Updating…</> : 'Update password'}
        </button>
      </div>
    </form>
  );
};

export const ProfilePage = () => {
  const { user } = useAuth();
  return (
    <PortalLayout title="Profile & security" subtitle="Manage your personal details and keep your account secure.">
      <PhotoCard />
      <div className="grid grid-2 align-start">
        <ProfileForm />
        <PasswordForm />
      </div>
      <div className="grid grid-2 align-start">
        <TwoStepCard />
        <DevicesCard />
      </div>
      {['STUDENT', 'INSTRUCTOR'].includes(user?.role) && <LearningProfileCard />}
      {['STUDENT', 'INSTRUCTOR'].includes(user?.role) && <EmailPrefsCard />}
    </PortalLayout>
  );
};

export default ProfilePage;

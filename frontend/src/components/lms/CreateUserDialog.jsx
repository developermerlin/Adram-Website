import { useState } from 'react';
import toast from 'react-hot-toast';
import { lmsAdminAPI, parseApiErrors } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { ROLES } from '../../config/roles';
import { Alert, TextField } from '../ui/Form';

/** An administrator creates an account (e.g. an instructor) with a temporary password; it is approved and verified. */
export const CreateUserDialog = ({ onClose, onCreated }) => {
  const { user: me } = useAuth();
  const [form, setForm] = useState({ email: '', first_name: '', last_name: '', role: 'INSTRUCTOR', password: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const roles = Object.entries(ROLES).filter(([value]) => value !== 'ADMIN' || me?.is_superuser);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await lmsAdminAPI.createUser(form);
      toast.success(`Account created for ${data.email}. Share the temporary password with them.`);
      onCreated(data);
    } catch (err) {
      setErrors(parseApiErrors(err));
      setBusy(false);
    }
  };

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="create-user-title">
      <button type="button" className="modal__backdrop" aria-label="Close" onClick={onClose} />
      <form className="modal__card" onSubmit={submit} noValidate>
        <h2 id="create-user-title">Create a user</h2>
        <p className="muted">The account is approved and ready to use. The person should change the password after signing in.</p>
        <div className="form-row">
          <TextField label="First name" name="first_name" value={form.first_name} error={errors.first_name} onChange={set('first_name')} />
          <TextField label="Last name" name="last_name" value={form.last_name} error={errors.last_name} onChange={set('last_name')} />
        </div>
        <TextField label="Email" type="email" name="email" value={form.email} error={errors.email} onChange={set('email')} />
        <div className="field">
          <label htmlFor="cu-role">Role</label>
          <select id="cu-role" className="input" value={form.role} onChange={set('role')}>
            {roles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          {errors.role && <p className="field-error">{errors.role}</p>}
        </div>
        <TextField label="Temporary password" type="text" name="password" autoComplete="new-password" value={form.password} error={errors.password} onChange={set('password')} hint="At least 8 characters with letters, numbers and a symbol." />
        <Alert>{errors.form}</Alert>
        <div className="modal__actions">
          <button type="button" className="btn btn--outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? <span className="btn-spinner" /> : null} Create user</button>
        </div>
      </form>
    </div>
  );
};

export default CreateUserDialog;

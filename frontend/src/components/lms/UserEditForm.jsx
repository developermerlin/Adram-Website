import { useState } from 'react';
import toast from 'react-hot-toast';
import { lmsAdminAPI, parseApiErrors } from '../../services/api';
import { Alert, TextField } from '../ui/Form';

const FIELDS = [['first_name', 'First name'], ['last_name', 'Last name'], ['email', 'Email'], ['phone_number', 'Phone'], ['country', 'Country']];

/** In the admin's user panel: edit a person's name, email, phone and country (and a student's dashboards). */
export const UserEditForm = ({ user, onSaved }) => {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => ({
    ...Object.fromEntries(FIELDS.map(([k]) => [k, user[k] || ''])),
    ...(user.role === 'STUDENT' ? { in_training: Boolean(user.in_training), in_scholarships: Boolean(user.in_scholarships) } : {}),
  }));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  if (!open) return <button type="button" className="btn btn--outline btn--sm btn--block" onClick={() => setOpen(true)}><i className="fas fa-user-pen" /> Edit details</button>;

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await lmsAdminAPI.editUser(user.id, form);
      toast.success('Details saved');
      setErrors({});
      setOpen(false);
      onSaved();
    } catch (err) {
      setErrors(parseApiErrors(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="card panel la-form" onSubmit={save} noValidate>
      <div className="form-row">
        {FIELDS.slice(0, 2).map(([k, label]) => <TextField key={k} label={label} name={k} value={form[k]} error={errors[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} />)}
      </div>
      {FIELDS.slice(2).map(([k, label]) => <TextField key={k} label={label} name={k} type={k === 'email' ? 'email' : 'text'} value={form[k]} error={errors[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} />)}
      {user.role === 'STUDENT' && (
        <fieldset className="field">
          <legend className="field__label">Dashboards</legend>
          {[['in_training', 'Training', 'Courses, learning, certificates, purchases'], ['in_scholarships', 'Scholarships', 'Applications, saved scholarships, documents']].map(([k, label, hint]) => (
            <label key={k} className="checkbox">
              <input type="checkbox" checked={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.checked }))} />
              <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span>
              <span>{label}<small>{hint}</small></span>
            </label>
          ))}
        </fieldset>
      )}
      <Alert>{errors.form}</Alert>
      <div className="la-form__actions">
        <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>{busy ? <span className="btn-spinner" /> : null} Save details</button>
        <button type="button" className="btn btn--text btn--sm" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
};

export default UserEditForm;

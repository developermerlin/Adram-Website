import { useState } from 'react';
import { passwordRules } from '../../utils/password';

export const Alert = ({ type = 'error', children }) => {
  if (!children) return null;
  const icon = type === 'success' ? 'fa-circle-check' : type === 'info' ? 'fa-circle-info' : 'fa-circle-exclamation';
  return (
    <div className={`alert alert--${type}`} role={type === 'error' ? 'alert' : 'status'}>
      <i className={`fas ${icon}`} aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
};

export const TextField = ({ name, label, error, hint, labelAside, ...props }) => (
  <div className="field">
    <div className="field__label-row">
      <label htmlFor={name}>{label}</label>
      {labelAside}
    </div>
    <input id={name} name={name} className="input" aria-invalid={Boolean(error)} {...props} />
    {error ? <p className="field-error">{error}</p> : hint && <p className="hint">{hint}</p>}
  </div>
);

export const PasswordField = ({ name, label, error, hint, labelAside, ...props }) => {
  const [visible, setVisible] = useState(false);
  return (
    <div className="field">
      <div className="field__label-row">
        <label htmlFor={name}>{label}</label>
        {labelAside}
      </div>
      <div className="input-group">
        <input id={name} name={name} type={visible ? 'text' : 'password'} className="input" aria-invalid={Boolean(error)} {...props} />
        <button
          type="button"
          className="input-group__btn"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
        >
          <i className={`fas ${visible ? 'fa-eye-slash' : 'fa-eye'}`} />
        </button>
      </div>
      {error ? <p className="field-error">{error}</p> : hint && <p className="hint">{hint}</p>}
    </div>
  );
};

export const PasswordChecklist = ({ password }) => {
  const passed = passwordRules.filter((rule) => rule.test(password)).length;
  const level = passed <= 2 ? 'weak' : passed < passwordRules.length ? 'fair' : 'strong';
  return (
    <div className="pw-check" aria-live="polite">
      <div className={`pw-meter pw-meter--${password ? level : 'empty'}`}>
        {passwordRules.map((rule) => (
          <span key={rule.label} />
        ))}
      </div>
      <ul>
        {passwordRules.map((rule) => {
          const ok = rule.test(password);
          return (
            <li key={rule.label} className={ok ? 'is-met' : ''}>
              <i className={`fas ${ok ? 'fa-circle-check' : 'fa-circle'}`} aria-hidden="true" />
              {rule.label}
              <span className="sr-only">{ok ? ' (done)' : ' (missing)'}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

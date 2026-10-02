import { useState } from 'react';
import { Alert } from './Form';
import '../../styles/security.css';

/**
 * The second step of signing in for accounts with two-step sign-in on: the 6-digit code from the authenticator app,
 * or one of the recovery codes. `onSubmit(code)` signs in and throws on a wrong code.
 */
export const AuthenticatorStep = ({ onSubmit, onBack }) => {
  const [recovery, setRecovery] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const ready = recovery ? code.replace(/[^A-Za-z0-9]/g, '').length === 10 : code.length === 6;
  const submit = async (value = code) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await onSubmit(recovery ? value.trim().toUpperCase() : value);
    } catch (err) {
      setError(err.response?.data?.detail || err.response?.data?.code?.[0] || 'That code isn’t right. Please try again.');
      setCode('');
    } finally {
      setBusy(false);
    }
  };
  const change = (e) => {
    const value = recovery ? e.target.value.toUpperCase().slice(0, 11) : e.target.value.replace(/\D/g, '').slice(0, 6);
    setCode(value);
    if (!recovery && value.length === 6) submit(value); // the app's code: sign in as soon as it's typed
  };

  return (
    <form className="form-grid form-grid--tight auth-step" onSubmit={(e) => { e.preventDefault(); if (ready) submit(); }} noValidate>
      <div className="auth-step__icon" aria-hidden="true"><i className={`fas ${recovery ? 'fa-key' : 'fa-mobile-screen-button'}`} /></div>
      <p className="muted">
        {recovery ? 'Enter one of the recovery codes you saved when you turned on two-step sign-in. Each code works once.'
          : 'Open your authenticator app and enter the 6-digit code for ADRAM Technologies.'}
      </p>
      <div className="field">
        <label htmlFor="auth-code">{recovery ? 'Recovery code' : 'Authenticator code'}</label>
        <input
          id="auth-code" className="input auth-step__input" value={code} onChange={change} autoFocus autoComplete="one-time-code"
          inputMode={recovery ? 'text' : 'numeric'} placeholder={recovery ? 'ABCDE-FGH23' : '123456'} aria-invalid={Boolean(error)}
        />
      </div>
      <Alert>{error}</Alert>
      <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={!ready || busy}>
        {busy ? <span className="btn-spinner" /> : <i className="fas fa-right-to-bracket" />} Verify and sign in
      </button>
      <div className="auth-step__links">
        <button type="button" className="link-button" onClick={() => { setRecovery((v) => !v); setCode(''); setError(''); }}>
          {recovery ? 'Use the authenticator app instead' : 'Lost your phone? Use a recovery code'}
        </button>
        {onBack && <button type="button" className="link-button" onClick={onBack}>Back</button>}
      </div>
    </form>
  );
};

export default AuthenticatorStep;

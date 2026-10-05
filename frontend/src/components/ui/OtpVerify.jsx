import { useEffect, useRef, useState } from 'react';
import { authAPI, parseApiErrors } from '../../services/api';
import { Alert } from './Form';

const LENGTH = 6;
const RESEND_SECONDS = 60;

// Six single-digit boxes: typing moves forward, Backspace moves back, pasting fills them all.
export const OtpInput = ({ value, onChange, disabled, invalid }) => {
  const refs = useRef([]);
  const digits = Array.from({ length: LENGTH }, (_, i) => value[i] || '');

  const setAt = (index, digit) => {
    const next = digits.slice();
    next[index] = digit;
    onChange(next.join(''));
  };

  const handleChange = (index, e) => {
    const typed = e.target.value.replace(/\D/g, '');
    if (!typed) return setAt(index, '');
    if (typed.length > 1) {
      // Autofill or paste into one box
      onChange((value.slice(0, index) + typed).slice(0, LENGTH));
      refs.current[Math.min(index + typed.length, LENGTH - 1)]?.focus();
      return undefined;
    }
    setAt(index, typed);
    if (index < LENGTH - 1) refs.current[index + 1]?.focus();
    return undefined;
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      setAt(index - 1, '');
      refs.current[index - 1]?.focus();
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' && index > 0) refs.current[index - 1]?.focus();
    else if (e.key === 'ArrowRight' && index < LENGTH - 1) refs.current[index + 1]?.focus();
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, LENGTH);
    if (!pasted) return;
    e.preventDefault();
    onChange(pasted);
    refs.current[Math.min(pasted.length, LENGTH - 1)]?.focus();
  };

  return (
    <div className={`otp${invalid ? ' otp--invalid' : ''}`} role="group" aria-label="6-digit code">
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          className="otp__box"
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={LENGTH}
          aria-label={`Digit ${i + 1}`}
          value={digit}
          disabled={disabled}
          autoFocus={i === 0}
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  );
};

/**
 * The "check your email" step. `onSubmit(code)` does the verifying (so password reset can add fields)
 * and should throw on failure; the component handles resend and error display.
 */
export const OtpVerify = ({ challenge, email, onSubmit, onBack, submitLabel = 'Verify and continue', children, canSubmit = true }) => {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);
  const submittedFor = useRef('');

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const submit = async (value = code) => {
    if (value.length !== LENGTH || busy) return;
    submittedFor.current = value;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await onSubmit(value);
    } catch (err) {
      const errors = parseApiErrors(err, 'That code didn’t work. Please try again.');
      // `form` is the API's sentence ("That code is incorrect. 4 attempts left."); `code` may be a
      // machine code like "invalid_code" or a field message, so it only fills in when there's no sentence.
      setError(errors.form || errors.code || Object.values(errors)[0]);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  // Submit as soon as all six digits are in (unless the form needs more fields, like a new password).
  const handleChange = (value) => {
    setCode(value);
    setError('');
    if (value.length === LENGTH && !children && value !== submittedFor.current) submit(value);
  };

  // One click to paste the code copied from the email (the boxes also accept Ctrl+V / long-press paste)
  const canPaste = typeof navigator !== 'undefined' && Boolean(navigator.clipboard?.readText);
  const pasteCode = async () => {
    try {
      const digits = (await navigator.clipboard.readText()).replace(/\D/g, '');
      if (digits.length === LENGTH) handleChange(digits);
      else setError('No 6-digit code found. Copy the code from the email first, then press Paste code.');
    } catch {
      setError('Your browser didn’t allow pasting. Tap the first box and paste the code there.');
    }
  };

  const resend = async () => {
    setError('');
    setNotice('');
    try {
      const { data } = await authAPI.resendOtp(challenge);
      setNotice(data.detail);
      setCooldown(RESEND_SECONDS);
      submittedFor.current = '';
    } catch (err) {
      const wait = err.response?.data?.retry_after;
      if (wait && wait < 120) setCooldown(wait);
      setError(parseApiErrors(err).form);
    }
  };

  return (
    <form
      className="otp-step"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="otp-step__mail">
        <span className="otp-step__icon"><i className="fas fa-envelope-open-text" /></span>
        <p>
          We sent a 6-digit code to <strong>{email}</strong>. It expires in 10 minutes.
        </p>
      </div>

      <Alert>{error}</Alert>
      {notice && <Alert type="success">{notice}</Alert>}

      <OtpInput value={code} onChange={handleChange} disabled={busy} invalid={Boolean(error)} />
      {canPaste && (
        <button type="button" className="btn btn--text btn--sm otp-step__paste" onClick={pasteCode} disabled={busy}>
          <i className="fas fa-paste" aria-hidden="true" /> Paste code
        </button>
      )}

      {children}

      <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={busy || code.length !== LENGTH || !canSubmit}>
        {busy ? <><span className="btn-spinner" /> Verifying…</> : <><i className="fas fa-shield-halved" /> {submitLabel}</>}
      </button>

      <div className="otp-step__foot">
        {onBack && (
          <button type="button" className="btn btn--text btn--sm" onClick={onBack}>
            <i className="fas fa-arrow-left" /> Back
          </button>
        )}
        <span>
          Didn’t get it?{' '}
          {cooldown > 0 ? (
            <span className="otp-step__wait">Resend in {cooldown}s</span>
          ) : (
            <button type="button" className="link-button" onClick={resend}>Resend code</button>
          )}
        </span>
      </div>
      <p className="otp-step__hint">Check your spam folder if you can’t find the email.</p>
    </form>
  );
};

export default OtpVerify;

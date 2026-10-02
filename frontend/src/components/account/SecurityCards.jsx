import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { authAPI, parseApiErrors } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { formatDateTime, timeAgo } from '../../utils/format';
import { Alert, PasswordField } from '../ui/Form';
import '../../styles/security.css';

const errorOf = (err, fallback) => err.response?.data?.detail || parseApiErrors(err).form || fallback;

/** Shown once, right after turning two-step sign-in on or making new codes. */
const RecoveryCodes = ({ codes, onDone }) => {
  const text = `ADRAM Technologies recovery codes\nEach code works once if you lose your authenticator app.\n\n${codes.join('\n')}\n`;
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'adram-recovery-codes.txt' });
    a.click();
    URL.revokeObjectURL(url);
  };
  const copy = () => navigator.clipboard?.writeText(text).then(() => toast.success('Codes copied'), () => {});
  return (
    <div className="sec-codes">
      <Alert type="info">Save these recovery codes somewhere safe now. They’re shown only once. Each one lets you sign in if you lose your phone.</Alert>
      <ol className="sec-codes__list">{codes.map((c) => <li key={c}><code>{c}</code></li>)}</ol>
      <div className="sec-actions">
        <button type="button" className="btn btn--outline btn--sm" onClick={download}><i className="fas fa-download" /> Download</button>
        <button type="button" className="btn btn--outline btn--sm" onClick={copy}><i className="far fa-copy" /> Copy</button>
        <button type="button" className="btn btn--primary btn--sm" onClick={onDone}>I’ve saved them</button>
      </div>
    </div>
  );
};

/** Two-step sign-in with an authenticator app: set up with a QR code, confirm, recovery codes, turn off. */
export const TwoStepCard = () => {
  const { refreshUser } = useAuth();
  const [info, setInfo] = useState(null);
  const [setup, setSetup] = useState(null); // {secret, uri, qr_svg}
  const [codes, setCodes] = useState(null);
  const [mode, setMode] = useState(''); // 'off' | 'codes'
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => authAPI.twoStep().then(({ data }) => setInfo(data)).catch(() => setInfo({ enabled: false })), []);
  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(errorOf(err, 'That didn’t work. Please try again.'));
    } finally {
      setBusy(false);
    }
  };
  const start = () => run(async () => {
    const { data } = await authAPI.twoStepSetup();
    setSetup(data);
    setCode('');
  });
  const confirm = (e) => {
    e.preventDefault();
    run(async () => {
      const { data } = await authAPI.twoStepConfirm(code);
      setSetup(null);
      setCodes(data.recovery_codes);
      setInfo(data);
      setCode('');
      refreshUser().catch(() => {});
      toast.success('Two-step sign-in is on');
    });
  };
  const turnOff = (e) => {
    e.preventDefault();
    run(async () => {
      const { data } = await authAPI.twoStepDisable(password, code);
      setInfo(data);
      setMode('');
      setPassword('');
      setCode('');
      refreshUser().catch(() => {});
      toast.success('Two-step sign-in is off');
    });
  };
  const newCodes = (e) => {
    e.preventDefault();
    run(async () => {
      const { data } = await authAPI.recoveryCodes(code);
      setCodes(data.recovery_codes);
      setInfo(data);
      setMode('');
      setCode('');
    });
  };

  return (
    <section className="card panel sec-card">
      <div className="sec-card__head">
        <span className={`sec-card__icon${info?.enabled ? ' is-on' : ''}`} aria-hidden="true"><i className="fas fa-shield-halved" /></span>
        <div>
          <h2 className="h3">Two-step sign-in</h2>
          <p className="muted">
            {info?.enabled
              ? `On since ${formatDateTime(info.enabled_at)}. Signing in asks for a code from your authenticator app.`
              : 'Protect your account with an authenticator app (Google Authenticator, Microsoft Authenticator, Authy…). Signing in will then ask for a code from your phone instead of your email.'}
          </p>
        </div>
        {info && <span className={`badge ${info.enabled ? 'badge--green' : 'badge--gray'}`}>{info.enabled ? 'On' : 'Off'}</span>}
      </div>

      {info && !info.enabled && info.recommended && !setup && !codes && (
        <Alert type="info">Strongly recommended for administrators: your account can confirm payments and change the website.</Alert>
      )}
      {error && <Alert>{error}</Alert>}
      {codes && <RecoveryCodes codes={codes} onDone={() => setCodes(null)} />}

      {info && !info.enabled && !setup && !codes && (
        <div className="sec-actions"><button type="button" className="btn btn--primary" onClick={start} disabled={busy}>{busy && <span className="btn-spinner" />} Set up the authenticator app</button></div>
      )}

      {setup && (
        <form className="sec-setup" onSubmit={confirm}>
          <ol className="sec-steps">
            <li>Install an authenticator app on your phone if you don’t have one.</li>
            <li>In the app, add an account and scan this QR code.</li>
            <li>Enter the 6-digit code the app shows.</li>
          </ol>
          <div className="sec-setup__grid">
            {/* the QR code is generated by our own server (segno), not user content */}
            <div className="sec-qr" dangerouslySetInnerHTML={{ __html: setup.qr_svg }} aria-label="QR code to scan with your authenticator app" role="img" />
            <div className="sec-setup__side">
              <p className="muted small">Can’t scan? Type this key into the app instead:</p>
              <code className="sec-secret">{setup.secret.match(/.{1,4}/g).join(' ')}</code>
              <div className="field">
                <label htmlFor="sec-code">Code from the app</label>
                <input id="sec-code" className="input sec-code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="123456" />
              </div>
              <div className="sec-actions">
                <button type="submit" className="btn btn--primary" disabled={busy || code.length !== 6}>{busy && <span className="btn-spinner" />} Turn on</button>
                <button type="button" className="btn btn--text" onClick={() => setSetup(null)}>Cancel</button>
              </div>
            </div>
          </div>
        </form>
      )}

      {info?.enabled && !codes && (
        <>
          <p className="muted small">{info.recovery_left} recovery {info.recovery_left === 1 ? 'code' : 'codes'} left.</p>
          {!mode && (
            <div className="sec-actions">
              <button type="button" className="btn btn--outline btn--sm" onClick={() => { setMode('codes'); setError(''); }}><i className="fas fa-key" /> New recovery codes</button>
              <button type="button" className="btn btn--text btn--sm text-danger" onClick={() => { setMode('off'); setError(''); }}>Turn off</button>
            </div>
          )}
          {mode && (
            <form className="sec-confirm" onSubmit={mode === 'off' ? turnOff : newCodes}>
              {mode === 'off' && <PasswordField name="sec-password" label="Your password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
              <div className="field">
                <label htmlFor="sec-confirm-code">Code from your authenticator app (or a recovery code)</label>
                <input id="sec-confirm-code" className="input" value={code} maxLength={11} onChange={(e) => setCode(e.target.value.toUpperCase())} />
              </div>
              <div className="sec-actions">
                <button type="submit" className={`btn btn--sm ${mode === 'off' ? 'btn--danger' : 'btn--primary'}`} disabled={busy || code.length < 6 || (mode === 'off' && !password)}>
                  {busy && <span className="btn-spinner" />} {mode === 'off' ? 'Turn off two-step sign-in' : 'Make new codes'}
                </button>
                <button type="button" className="btn btn--text btn--sm" onClick={() => { setMode(''); setCode(''); setPassword(''); }}>Cancel</button>
              </div>
            </form>
          )}
        </>
      )}
    </section>
  );
};

const DEVICE_ICON = (name) => (/Android|iPhone/.test(name) ? 'fa-mobile-screen' : /iPad/.test(name) ? 'fa-tablet-screen-button' : 'fa-laptop');

/** Every browser or phone signed in to this account, with "sign out" for each and for all the others. */
export const DevicesCard = () => {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState('');
  const load = useCallback(() => authAPI.sessions().then(({ data }) => setRows(data)).catch(() => setRows([])), []);
  useEffect(() => {
    load();
  }, [load]);

  const signOut = async (row) => {
    setBusy(String(row.id));
    try {
      await authAPI.revokeSession(row.id);
      toast.success(`${row.device} signed out`);
      load();
    } catch (err) {
      toast.error(errorOf(err, 'That device could not be signed out.'));
    } finally {
      setBusy('');
    }
  };
  const signOutOthers = async () => {
    setBusy('others');
    try {
      const { data } = await authAPI.revokeOtherSessions();
      toast.success(data.signed_out ? `${data.signed_out} other device${data.signed_out === 1 ? '' : 's'} signed out` : 'No other devices were signed in');
      load();
    } catch (err) {
      toast.error(errorOf(err, 'That didn’t work.'));
    } finally {
      setBusy('');
    }
  };
  const others = (rows || []).filter((r) => !r.current).length;

  return (
    <section className="card panel sec-card">
      <div className="sec-card__head">
        <span className="sec-card__icon" aria-hidden="true"><i className="fas fa-display" /></span>
        <div>
          <h2 className="h3">Signed-in devices</h2>
          <p className="muted">Where your account is signed in. If you don’t recognise one, sign it out and change your password.</p>
        </div>
      </div>
      {!rows && <div className="skeleton skeleton--block" />}
      {rows?.length === 0 && <p className="muted small">No devices to show yet. Devices appear here from your next sign-in.</p>}
      <ul className="sec-devices">
        {rows?.map((r) => (
          <li key={r.id}>
            <i className={`fas ${DEVICE_ICON(r.device)}`} aria-hidden="true" />
            <span className="sec-devices__main">
              <strong>{r.device}{r.current && <span className="badge badge--green">This device</span>}</strong>
              <small className="muted">{r.ip_address || 'Unknown address'} · signed in {formatDateTime(r.created_at)}{r.method ? ` with ${r.method}` : ''} · active {timeAgo(r.last_seen_at)}</small>
            </span>
            {!r.current && (
              <button type="button" className="btn btn--outline btn--sm" onClick={() => signOut(r)} disabled={busy === String(r.id)}>
                {busy === String(r.id) && <span className="btn-spinner" />} Sign out
              </button>
            )}
          </li>
        ))}
      </ul>
      {others > 0 && (
        <div className="sec-actions">
          <button type="button" className="btn btn--text btn--sm text-danger" onClick={signOutOthers} disabled={busy === 'others'}>
            {busy === 'others' && <span className="btn-spinner" />} Sign out all other devices
          </button>
        </div>
      )}
    </section>
  );
};

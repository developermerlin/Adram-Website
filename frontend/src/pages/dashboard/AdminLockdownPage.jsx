import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import PortalLayout from '../../components/layout/PortalLayout';
import { parseApiErrors, siteLockAPI } from '../../services/api';
import { formatDateTime } from '../../utils/format';
import '../../styles/lockdown.css';

const DEFAULT_MESSAGE = 'The website is temporarily locked while we make some changes. Please check back soon.';
const MAX = 300;

/** Admin → Lock website: switch the whole website to look-only for everyone but administrators. */
export const AdminLockdownPage = () => {
  const [lock, setLock] = useState(null);
  const [message, setMessage] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    siteLockAPI.manage().then(({ data }) => {
      setLock(data);
      setMessage(data.message);
    }).catch(() => toast.error('Could not load the lock settings.'));
  }, []);

  const save = async (patch, done) => {
    setBusy(true);
    try {
      const { data } = await siteLockAPI.save(patch);
      setLock(data);
      setMessage(data.message);
      setConfirming(false);
      window.dispatchEvent(new Event('site:lock-changed'));
      toast.success(done);
    } catch (err) {
      const errs = parseApiErrors(err);
      toast.error(errs.message || errs.detail || 'Could not save. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!lock) {
    return <PortalLayout title="Lock website"><div className="card panel"><p className="muted">Loading…</p></div></PortalLayout>;
  }

  const shown = message.trim() || DEFAULT_MESSAGE;
  return (
    <PortalLayout
      title="Lock website"
      subtitle="Make the whole website look-only for visitors, for example during maintenance. You and other administrators keep full access."
    >
      <div className="lockdown">
        <section className={`card lockdown__status${lock.locked ? ' is-locked' : ''}`}>
          <span className="lockdown__icon" aria-hidden="true"><i className={`fas ${lock.locked ? 'fa-lock' : 'fa-lock-open'}`} /></span>
          <div className="lockdown__status-text">
            <span className={`badge ${lock.locked ? 'badge--red' : 'badge--green'}`}>{lock.locked ? 'Locked' : 'Open'}</span>
            <h2 className="h3">{lock.locked ? 'The website is locked' : 'The website is open'}</h2>
            <p className="muted small">
              {lock.locked
                ? 'Visitors, students and staff can see the website but cannot click, sign up, pay or send anything.'
                : 'Everyone can use the website normally.'}
              {lock.updated_by_name && <> Last changed {formatDateTime(lock.updated_at)} by {lock.updated_by_name}.</>}
            </p>
          </div>
          <div className="lockdown__actions">
            {lock.locked ? (
              <button type="button" className="btn btn--success" disabled={busy} onClick={() => save({ locked: false }, 'The website is open again.')}>
                {busy ? <span className="btn-spinner" /> : <i className="fas fa-lock-open" />} Unlock the website
              </button>
            ) : !confirming ? (
              <button type="button" className="btn btn--danger" onClick={() => setConfirming(true)}>
                <i className="fas fa-lock" /> Lock the website
              </button>
            ) : null}
          </div>
          {confirming && !lock.locked && (
            <div className="lockdown__confirm" role="alert">
              <p><strong>Lock the website now?</strong> Nobody except administrators will be able to use it until you unlock it. People in the middle of something (a payment, a form) will be stopped.</p>
              <div>
                <button type="button" className="btn btn--danger btn--sm" disabled={busy} onClick={() => save({ locked: true, message }, 'The website is locked.')}>
                  {busy ? <span className="btn-spinner" /> : <i className="fas fa-lock" />} Yes, lock it now
                </button>
                <button type="button" className="btn btn--text btn--sm" onClick={() => setConfirming(false)}>Cancel</button>
              </div>
            </div>
          )}
        </section>

        <div className="lockdown__grid">
          <section className="card panel lockdown__message">
            <h2 className="h3">Message for visitors</h2>
            <div className="field">
              <label htmlFor="lock-message">What visitors read on the lock notice</label>
              <textarea id="lock-message" className="input" rows={4} maxLength={MAX} value={message} placeholder={DEFAULT_MESSAGE}
                onChange={(e) => setMessage(e.target.value)} />
              <p className="hint">{message.length} / {MAX}. Leave empty to use the standard message. Say when you expect to be back if you know.</p>
            </div>
            <div>
              <button type="button" className="btn btn--primary btn--sm" disabled={busy || message.trim() === (lock.message || '').trim()}
                onClick={() => save({ message }, 'Message saved.')}>
                <i className="fas fa-floppy-disk" /> Save message
              </button>
            </div>

            <h3 className="h5 lockdown__rules-title">While locked</h3>
            <ul className="lockdown__rules">
              <li className="is-blocked"><i className="fas fa-ban" aria-hidden="true" /> Links, buttons, forms, sign-up, payments, enrolments and course videos stop working for visitors, students and staff.</li>
              <li className="is-open"><i className="fas fa-check" aria-hidden="true" /> Administrators can sign in and use everything, including this page.</li>
              <li className="is-open"><i className="fas fa-check" aria-hidden="true" /> Nothing is deleted. Unlocking puts everything back as it was.</li>
            </ul>
          </section>

          <section className="card panel lockdown__preview-card">
            <h2 className="h3">What visitors see</h2>
            <div className="lockdown__preview" aria-hidden="true">
              <div className="lockdown__fake-site">
                <span /><span /><span className="is-wide" /><span />
              </div>
              <div className="site-lock__card lockdown__mini">
                <span className="site-lock__icon"><i className="fas fa-lock" /></span>
                <h2>Website temporarily locked</h2>
                <p>{shown}</p>
                <span className="site-lock__staff"><i className="fas fa-user-shield" /> Administrator sign in</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </PortalLayout>
  );
};

export default AdminLockdownPage;

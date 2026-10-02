import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { lmsAPI, parseApiErrors } from '../../services/api';
import { Alert } from '../ui/Form';
import '../../styles/bundles.css';

/**
 * Buying a course or a bundle for someone else: their name, email and a message. Places a gift order and opens it
 * to pay; once paid, the recipient is emailed a link to redeem it. `target` is {course} or {bundle} (a slug).
 */
export const GiftDialog = ({ target, title, price, onClose }) => {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data } = await lmsAPI.giftBuy({ ...target, ...form });
      navigate(`/orders/${data.id}`);
    } catch (err) {
      const errs = parseApiErrors(err);
      setError(errs.gift || errs.detail || errs.form || 'Your gift could not be started.');
      setBusy(false);
    }
  };

  return (
    <div className="modal la-dialog" role="dialog" aria-modal="true" aria-labelledby="gift-title">
      <button type="button" className="modal__backdrop" aria-label="Close" onClick={onClose} />
      <form className="modal__card gift-dialog" onSubmit={submit}>
        <h2 id="gift-title"><i className="fas fa-gift" aria-hidden="true" /> Give {title}</h2>
        <p className="muted small">You pay {price} as usual (Orange Money, Afrimoney or card). As soon as the payment is confirmed, we email them a link to start learning.</p>
        <div className="field">
          <label htmlFor="gift-name">Their name</label>
          <input id="gift-name" className="input" value={form.name} maxLength={120} onChange={set('name')} autoComplete="off" required />
        </div>
        <div className="field">
          <label htmlFor="gift-email">Their email address</label>
          <input id="gift-email" type="email" className="input" value={form.email} onChange={set('email')} autoComplete="off" required />
        </div>
        <div className="field">
          <label htmlFor="gift-message">A message <span className="optional">(optional)</span></label>
          <textarea id="gift-message" className="input" rows={3} maxLength={1000} value={form.message} onChange={set('message')} placeholder="e.g. Happy birthday! Good luck with your new career." />
        </div>
        <Alert>{error}</Alert>
        <div className="modal__actions">
          <button type="button" className="btn btn--outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn--primary" disabled={busy || !form.name.trim() || !form.email.trim()}>
            {busy ? <span className="btn-spinner" /> : <i className="fas fa-gift" />} Continue to payment
          </button>
        </div>
      </form>
    </div>
  );
};

export default GiftDialog;

import { useEffect, useState } from 'react';
import { Alert } from '../ui/Form';

/**
 * A dialog asking for a decision with a note (reject a course, refund an order, revoke a certificate…).
 * `required` makes the note mandatory; `onConfirm(note, extra)` may throw to show an error.
 * `checkbox` adds one option, e.g. { label: 'Also hide the review' }.
 * `suggestions` are ready-made notes the person can click to fill in (and then edit).
 */
export const NoteDialog = ({ title, text, label = 'Note', placeholder, confirm, tone = 'primary', required = false, checkbox, suggestions, onConfirm, onClose }) => {
  const [note, setNote] = useState('');
  const [checked, setChecked] = useState(Boolean(checkbox?.checked));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onConfirm(note.trim(), checked);
    } catch (err) {
      setError(err?.message || 'That did not work.');
      setBusy(false);
    }
  };

  return (
    <div className="modal la-dialog" role="dialog" aria-modal="true" aria-labelledby="note-dialog-title">
      <button type="button" className="modal__backdrop" aria-label="Close" onClick={onClose} />
      <form className="modal__card" onSubmit={submit}>
        <h2 id="note-dialog-title">{title}</h2>
        {text && <p className="muted">{text}</p>}
        <div className="field">
          <label htmlFor="note-dialog-note">{label}{!required && <span className="optional"> (optional)</span>}</label>
          <textarea id="note-dialog-note" className="input" rows={4} maxLength={3000} value={note} onChange={(e) => setNote(e.target.value)} placeholder={placeholder} autoFocus />
        </div>
        {suggestions?.length > 0 && (
          <div className="pay-reasons" aria-label="Common reasons">
            {suggestions.map((s) => <button key={s} type="button" onClick={() => setNote(s)}>{s}</button>)}
          </div>
        )}
        {checkbox && (
          <label className="la-inline-check"><input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} /> {checkbox.label}</label>
        )}
        <Alert>{error}</Alert>
        <div className="modal__actions">
          <button type="button" className="btn btn--outline" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className={`btn btn--${tone}`} disabled={busy || (required && !note.trim())}>{busy ? <span className="btn-spinner" /> : null} {confirm}</button>
        </div>
      </form>
    </div>
  );
};

export default NoteDialog;

import { useEffect, useState } from 'react';

// Confirmation dialog; `reason` adds an optional message that is emailed to the user.
export const ConfirmDialog = ({ config, count = 1, onConfirm, onClose }) => {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm(reason.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <button type="button" className="modal__backdrop" aria-label="Close" onClick={onClose} />
      <div className="modal__card">
        <h2 id="confirm-title">{count > 1 ? config.title.replace('this account', `${count} accounts`) : config.title}</h2>
        <p className="muted">{config.text}</p>
        {config.reason && (
          <div className="field">
            <label htmlFor="reject-reason">Reason <span className="optional">(optional, included in the email)</span></label>
            <textarea id="reject-reason" className="input" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. We couldn’t verify the details you provided." />
          </div>
        )}
        <div className="modal__actions">
          <button type="button" className="btn btn--outline" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn btn--danger" onClick={confirm} disabled={busy}>
            {busy ? <span className="btn-spinner" /> : null} {config.confirm}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;

import toast from 'react-hot-toast';

/**
 * Ask for confirmation in a toast instead of the browser's confirm() box.
 *   if (!(await confirmToast('Publish all 24 notes?', { confirmLabel: 'Publish' }))) return;
 * Resolves true when the person confirms, false when they cancel or press Escape.
 */
export const confirmToast = (message, { title, confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'primary', icon = 'fa-circle-question' } = {}) =>
  new Promise((resolve) => {
    let done = false;
    const finish = (answer, id) => {
      if (done) return;
      done = true;
      window.removeEventListener('keydown', onKey);
      toast.dismiss(id);
      resolve(answer);
    };
    let toastId;
    const onKey = (e) => { if (e.key === 'Escape') finish(false, toastId); };
    window.addEventListener('keydown', onKey);
    toastId = toast.custom((t) => (
      <div className={`confirm-toast${t.visible ? ' is-in' : ''}`} role="alertdialog" aria-live="assertive" aria-label={title || message}>
        <span className={`confirm-toast__icon confirm-toast__icon--${tone}`} aria-hidden="true"><i className={`fas ${icon}`} /></span>
        <div className="confirm-toast__body">
          {title && <strong>{title}</strong>}
          <p>{message}</p>
          <div className="confirm-toast__actions">
            <button type="button" className="btn btn--text btn--sm" onClick={() => finish(false, t.id)}>{cancelLabel}</button>
            {/* autoFocus: Enter confirms, Escape cancels */}
            <button type="button" className={`btn btn--sm ${tone === 'danger' ? 'btn--danger' : 'btn--primary'}`} onClick={() => finish(true, t.id)} autoFocus>{confirmLabel}</button>
          </div>
        </div>
      </div>
    ), { duration: Infinity, position: 'top-center' });
  });

export default confirmToast;

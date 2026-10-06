import { useState } from 'react';
import toast from 'react-hot-toast';
import { learningAPI } from '../../services/api';

/** Downloads a field's notes as one PDF book (made on the server: cover, contents, every level, topic and note). */
export const DownloadPdfButton = ({ slug, name, drafts = false, className = 'btn btn--outline', label = 'Download PDF' }) => {
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      const { data } = await learningAPI.pdf(slug, drafts);
      const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name} - ADRAM learning notes${drafts ? ' (with drafts)' : ''}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {
      toast.error('The PDF couldn’t be prepared. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" className={className} onClick={download} disabled={busy}>
      {busy ? <span className="btn-spinner" /> : <i className="fas fa-file-pdf" aria-hidden="true" />} {busy ? 'Preparing PDF…' : label}
    </button>
  );
};

export default DownloadPdfButton;

import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { portalAPI, parseApiErrors } from '../../services/api';

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif';
const MAX_FILES = 20;
const MAX_BYTES = 10 * 1024 * 1024;
const kb = (b) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const STEP_ICONS = ['fa-file-arrow-down', 'fa-pen-nib', 'fa-cloud-arrow-up'];

/**
 * The paper route for the service agreement: download it, sign it by hand, upload a scan or photos.
 * `steps` is the admin's wording (one step per line); the last step holds the upload.
 */
export const AgreementPaperUpload = ({ id, steps, onDone }) => {
  const [files, setFiles] = useState([]);
  const [declared, setDeclared] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(null);
  const [over, setOver] = useState(false);
  const input = useRef(null);
  const lines = String(steps || '').split('\n').map((l) => l.trim()).filter(Boolean);

  const add = (list) => {
    const next = [...files];
    for (const f of list) {
      if (!/\.(pdf|jpe?g|png|webp|heic|heif)$/i.test(f.name)) { setError(`“${f.name}” isn’t a PDF or photo.`); continue; }
      if (f.size > MAX_BYTES) { setError(`“${f.name}” is larger than 10 MB.`); continue; }
      if (next.length >= MAX_FILES) { setError(`You can upload up to ${MAX_FILES} files. Tip: combine the pages into one PDF.`); break; }
      if (!next.some((x) => x.name === f.name && x.size === f.size)) next.push(f);
    }
    setFiles(next);
  };
  const submit = async () => {
    if (!files.length) { setError('Add the scan or photos of every page of your signed agreement.'); return; }
    if (!declared) { setError('Please confirm that you signed the agreement yourself.'); return; }
    setError('');
    setProgress(0);
    try {
      const { data } = await portalAPI.uploadAgreement(id, files, declared, setProgress);
      toast.success('Your signed agreement has been uploaded.');
      onDone(data);
    } catch (err) {
      const errs = parseApiErrors(err);
      setError(err.response?.data?.files || errs.files || errs.declared || err.response?.data?.detail || errs.detail || 'The upload didn’t work. Please try again.');
    } finally {
      setProgress(null);
    }
  };

  const drop = (
    <>
      <div className={`af-drop${over ? ' is-over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add([...e.dataTransfer.files]); }}>
        <i className="fas fa-cloud-arrow-up" aria-hidden="true" />
        <p><strong>Drag your files here</strong> or</p>
        <button type="button" className="btn btn--primary btn--sm" onClick={() => input.current?.click()}><i className="fas fa-folder-open" /> Choose files</button>
        <input ref={input} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { add([...e.target.files]); e.target.value = ''; }} />
      </div>
      <p className="muted small">A PDF scan or clear photos (JPG, PNG, HEIC). Up to {MAX_FILES} files, 10 MB each.</p>
      {files.length > 0 && (
        <ul className="af-files">
          {files.map((f, i) => (
            <li key={f.name + f.size}>
              <i className={`fas ${/\.pdf$/i.test(f.name) ? 'fa-file-pdf' : 'fa-file-image'}`} aria-hidden="true" />
              <span>{f.name}<small>{kb(f.size)}</small></span>
              <button type="button" className="btn btn--text btn--sm" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, k) => k !== i))}><i className="fas fa-xmark" /></button>
            </li>
          ))}
        </ul>
      )}
    </>
  );

  return (
    <section className="card ags-sign af-paper">
      <ol className="af-paper__steps">
        {lines.map((line, i) => (
          <li key={i}>
            <span className="af-paper__num">{i + 1}</span>
            <div className={i === lines.length - 1 ? 'af-paper__upload' : ''}>
              <h4><i className={`fas ${STEP_ICONS[Math.min(i, 2)]}`} aria-hidden="true" /> {line}</h4>
              {i === 0 && (
                <Link to={`/student/applications/${id}/agreement/print?paper=1`} target="_blank" className="btn btn--outline btn--sm">
                  <i className="fas fa-file-arrow-down" /> Download the agreement to sign
                </Link>
              )}
              {i === lines.length - 1 && drop}
            </div>
          </li>
        ))}
        {lines.length === 0 && <li><span className="af-paper__num">1</span><div className="af-paper__upload">{drop}</div></li>}
      </ol>
      <label className="af-declare">
        <input type="checkbox" checked={declared} onChange={(e) => setDeclared(e.target.checked)} />
        <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span>
        <span><strong>Declaration</strong>I read this agreement, filled in my details and signed it myself, and I agree to be legally bound by its terms.</span>
      </label>
      {error && <p className="ags-error" role="alert">{error}</p>}
      <div>
        <button type="button" className="btn btn--primary" disabled={progress !== null} onClick={submit}>
          {progress !== null ? <><span className="btn-spinner" /> Uploading {progress}%</> : <><i className="fas fa-paper-plane" /> Upload my signed agreement</>}
        </button>
      </div>
    </section>
  );
};

export default AgreementPaperUpload;

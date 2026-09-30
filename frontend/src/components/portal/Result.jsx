import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { openPrivateFile, parseApiErrors, privateFileUrl } from '../../services/api';
import { telHref } from '../../config/site';
import { useSite } from '../../content/useContent';
import { formatDate, formatDateTime } from '../../utils/format';
import { daysUntil, resultState } from '../../utils/applicationStages';

const openResult = (id) => openPrivateFile('results', id).catch(() => toast.error('Could not open the file.'));

// datetime-local inputs work in local time; the API stores UTC.
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (value) => (value ? new Date(value).toISOString() : null);

/** An image the student is allowed to see (fetched with their sign-in, shown from a temporary URL). */
const PrivateImage = ({ id, alt }) => {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let objectUrl;
    let live = true;
    privateFileUrl('results', id)
      .then((u) => {
        objectUrl = u;
        if (live) setUrl(u);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);
  // An image the browser can't show (e.g. HEIC, or a damaged file) still opens from the tile.
  if (failed) return <span className="result-files__icon" aria-hidden="true"><i className="fas fa-file-image" /></span>;
  return url ? <img src={url} alt={alt} onError={() => setFailed(true)} /> : <span className="skeleton skeleton--block result-files__loading" />;
};

/** Result documents ADRAM uploaded: images as thumbnails, PDFs and other files as tiles. */
export const ResultFiles = ({ files, onRemove }) => {
  if (!files?.length) return null;
  return (
    <ul className="result-files">
      {files.map((f) => (
        <li key={f.id} className={`result-files__item result-files__item--${f.kind}`}>
          <button type="button" className="result-files__open" onClick={() => openResult(f.id)} title={`Open ${f.title || f.file_name}`}>
            {f.kind === 'image' ? (
              <PrivateImage id={f.id} alt={f.title || f.file_name} />
            ) : (
              <span className="result-files__icon" aria-hidden="true"><i className={`fas ${f.kind === 'pdf' ? 'fa-file-pdf' : 'fa-file-lines'}`} /></span>
            )}
            <span className="result-files__name">{f.title || f.file_name}</span>
            <small>{formatDate(f.uploaded_at)}</small>
          </button>
          {onRemove && (
            <button type="button" className="icon-btn icon-btn--danger result-files__remove" aria-label={`Remove ${f.title || f.file_name}`} onClick={() => onRemove(f.id)}>
              <i className="fas fa-xmark" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
};

const InterviewDetails = ({ application: a }) => {
  if (!a.interview_at && !a.interview_link && !a.interview_note) return null;
  const days = a.interview_at ? daysUntil(a.interview_at.slice(0, 10)) : null;
  return (
    <div className="interview-card">
      <p className="interview-card__title"><i className="fas fa-video" /> Your interview</p>
      {a.interview_at && (
        <p className="interview-card__when">
          <strong>{formatDateTime(a.interview_at)}</strong>
          {days !== null && days >= 0 && <em> · {days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`}</em>}
        </p>
      )}
      {a.interview_note && <p className="interview-card__note">{a.interview_note}</p>}
      {a.interview_link && (
        <a href={a.interview_link} target="_blank" rel="noopener noreferrer" className="btn btn--primary btn--sm">
          <i className="fas fa-arrow-up-right-from-square" /> Join interview
        </a>
      )}
    </div>
  );
};

/** The scholarship result as the student sees it: amber while waiting, green when awarded, red when not. */
export const ResultBanner = ({ application: a }) => {
  const site = useSite();
  const whatsapp = site.whatsappHref;
  const r = resultState(a.stage);
  if (!r) return null;
  const resultsIn = a.result_expected_on ? daysUntil(a.result_expected_on) : null;
  return (
    <div className={`result-banner result-banner--${r.key}`} role="status">
      <span className="result-banner__icon" aria-hidden="true"><i className={`fas ${r.icon}`} /></span>
      <div className="result-banner__body">
        <p className="result-banner__title">{r.title}</p>
        {r.key === 'waiting' && a.result_expected_on && (
          <p className="result-banner__date">
            <i className="far fa-calendar" /> Results expected on <strong>{formatDate(`${a.result_expected_on}T00:00`)}</strong>
            {resultsIn !== null && resultsIn >= 0 && <em> · {resultsIn === 0 ? 'today' : `in ${resultsIn} day${resultsIn === 1 ? '' : 's'}`}</em>}
          </p>
        )}
        {a.result_message && (
          <p className="result-banner__message">
            <strong>{r.key === 'unsuccessful' ? 'Reason: ' : 'Message from ADRAM: '}</strong>
            {a.result_message}
          </p>
        )}
        {r.key === 'waiting' && !a.result_message && !a.result_expected_on && (
          <p className="result-banner__message">We’ll let you know as soon as the provider announces the result.</p>
        )}
        {a.stage === 'interview' && <InterviewDetails application={a} />}
        {r.key === 'awarded' && (
          <div className="result-banner__contact">
            <p><strong>Please contact ADRAM as soon as possible for further processing of your scholarship.</strong></p>
            <div className="result-banner__contact-actions">
              {whatsapp && <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="btn btn--success btn--sm"><i className="fab fa-whatsapp" /> WhatsApp us</a>}
              <a href={`mailto:${site.email}?subject=${encodeURIComponent(`Scholarship awarded: ${a.scholarship_name}`)}`} className="btn btn--outline btn--sm"><i className="fas fa-envelope" /> Email</a>
              <a href={telHref(site.phones[0])} className="btn btn--outline btn--sm"><i className="fas fa-phone" /> {site.phones[0]}</a>
              <Link to={`/contact?subject=${encodeURIComponent(`Scholarship awarded: ${a.scholarship_name}`)}`} className="btn btn--text btn--sm">Contact form</Link>
            </div>
          </div>
        )}
        {a.result_files?.length > 0 && (
          <div className="result-banner__files">
            <p className="result-banner__files-title"><i className="fas fa-paperclip" /> Your result documents</p>
            <ResultFiles files={a.result_files} />
          </div>
        )}
      </div>
    </div>
  );
};

const RESULT_OPTIONS = [
  { stage: 'preparing', label: 'Still preparing' },
  { stage: 'submitted', label: 'Submitted: waiting for result' },
  { stage: 'interview', label: 'Interview stage' },
  { stage: 'accepted', label: 'Awarded' },
  { stage: 'unsuccessful', label: 'Not successful' },
];

const formFrom = (a) => ({
  stage: RESULT_OPTIONS.some((o) => o.stage === a.stage) ? a.stage : 'preparing',
  result_message: a.result_message || '',
  result_expected_on: a.result_expected_on || '',
  interview_at: toLocalInput(a.interview_at),
  interview_link: a.interview_link || '',
  interview_note: a.interview_note || '',
});

/** Staff: set the scholarship result, results date, interview details and result documents. */
export const ResultEditor = ({ application: a, onSave, files }) => {
  const [form, setForm] = useState(() => formFrom(a));
  const [saved, setSaved] = useState(() => formFrom(a));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [fileTitle, setFileTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef(null);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const changed = JSON.stringify(form) !== JSON.stringify(saved);
  const r = resultState(form.stage);
  const waiting = form.stage === 'submitted' || form.stage === 'interview';

  const save = async () => {
    setBusy(true);
    const payload = {
      ...form,
      result_expected_on: form.result_expected_on || null,
      interview_at: fromLocalInput(form.interview_at),
    };
    const errs = await onSave(a.id, payload);
    setBusy(false);
    if (errs && typeof errs === 'object') setErrors(errs);
    else {
      setErrors({});
      setSaved(form);
    }
  };

  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      await files.upload(a.id, file, fileTitle.trim());
      setFileTitle('');
    } catch (err) {
      const e = parseApiErrors(err);
      toast.error(e.file || e.form);
    } finally {
      setUploading(false);
      fileInput.current.value = '';
    }
  };

  return (
    <div className={`result-editor${r ? ` result-editor--${r.key}` : ''}`}>
      <h4>Scholarship result <span className="muted small">(the student sees this and gets an email)</span></h4>
      <div className="result-editor__options" role="radiogroup" aria-label="Scholarship result">
        {RESULT_OPTIONS.map((o) => (
          <button key={o.stage} type="button" role="radio" aria-checked={form.stage === o.stage} className={`chip${form.stage === o.stage ? ' is-active' : ''}`} onClick={() => setForm((f) => ({ ...f, stage: o.stage }))}>
            {o.label}
          </button>
        ))}
      </div>

      {waiting && (
        <div className="field">
          <label htmlFor={`expected-${a.id}`}>Results expected on <span className="optional">(optional)</span></label>
          <input id={`expected-${a.id}`} type="date" className="input result-editor__date" value={form.result_expected_on} onChange={set('result_expected_on')} />
        </div>
      )}

      {form.stage === 'interview' && (
        <div className="result-editor__interview">
          <div className="form-row">
            <div className="field">
              <label htmlFor={`int-at-${a.id}`}>Interview date &amp; time <span className="optional">(optional)</span></label>
              <input id={`int-at-${a.id}`} type="datetime-local" className="input" value={form.interview_at} onChange={set('interview_at')} />
            </div>
            <div className="field">
              <label htmlFor={`int-link-${a.id}`}>Interview link <span className="optional">(optional)</span></label>
              <input id={`int-link-${a.id}`} type="url" className="input" maxLength={500} placeholder="https://meet.google.com/…" value={form.interview_link} aria-invalid={Boolean(errors.interview_link)} onChange={set('interview_link')} />
              {errors.interview_link && <p className="field-error">{errors.interview_link}</p>}
            </div>
          </div>
          <div className="field">
            <label htmlFor={`int-note-${a.id}`}>Interview instructions <span className="optional">(optional)</span></label>
            <input id={`int-note-${a.id}`} className="input" maxLength={500} placeholder="e.g. Join 10 minutes early with your passport ready." value={form.interview_note} onChange={set('interview_note')} />
          </div>
        </div>
      )}

      <div className="field">
        <label htmlFor={`result-${a.id}`}>
          {form.stage === 'unsuccessful' ? 'Reason it wasn’t successful' : form.stage === 'accepted' ? 'Message and next steps' : 'Message for the student'}{' '}
          <span className="optional">(optional)</span>
        </label>
        <textarea
          id={`result-${a.id}`}
          className="input"
          rows={3}
          value={form.result_message}
          onChange={set('result_message')}
          placeholder={form.stage === 'unsuccessful' ? 'e.g. The provider received many strong applications this year. We recommend trying again next cycle.' : form.stage === 'accepted' ? 'e.g. The award letter is below. We’ll help you with your visa next.' : 'e.g. Results are usually announced in June.'}
        />
      </div>
      <button type="button" className="btn btn--primary btn--sm" disabled={!changed || busy} onClick={save}>
        <i className="fas fa-paper-plane" /> Save and notify the student
      </button>

      {files && (form.stage === 'accepted' || form.stage === 'unsuccessful' || a.result_files?.length > 0) && (
        <div className="result-editor__files">
          <h5>Result documents <span className="muted small">(award letter, result screenshot…; the student can view them)</span></h5>
          <ResultFiles files={a.result_files} onRemove={files.remove} />
          <div className="doc-list__add">
            <input className="input" maxLength={150} placeholder="Title, e.g. Award letter" aria-label="Document title" value={fileTitle} onChange={(e) => setFileTitle(e.target.value)} />
            <input ref={fileInput} type="file" hidden accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx" onChange={(e) => upload(e.target.files[0])} />
            <button type="button" className="btn btn--outline btn--sm" disabled={uploading} onClick={() => fileInput.current.click()}>
              {uploading ? <span className="btn-spinner" /> : <i className="fas fa-upload" />} Upload image or PDF
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

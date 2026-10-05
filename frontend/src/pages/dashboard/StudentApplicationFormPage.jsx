import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import PortalLayout from '../../components/layout/PortalLayout';
import FormQuestion from '../../components/portal/FormQuestion';
import { AgreementInvite } from '../../components/portal/AgreementCard';
import ApplicationFormDocument from '../../components/portal/ApplicationFormDocument';
import { UploadedPages } from './ApplicationFormPrintPage';
import { portalAPI, parseApiErrors } from '../../services/api';
import { displayValue, isEmpty, prefilled, progressOf, sectionDone } from '../../utils/applicationForm';
import { formatDateTime } from '../../utils/format';
import '../../styles/application-form.css';

const REVIEW = 'review';
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif';
const MAX_FILES = 10;
const MAX_BYTES = 10 * 1024 * 1024;
const kb = (b) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** The paper route: download the blank form, fill it in by hand, upload a scan or photos. */
const PaperRoute = ({ id, data, onDone }) => {
  const [files, setFiles] = useState([]);
  const [declared, setDeclared] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(null);
  const [over, setOver] = useState(false);
  const input = useRef(null);

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
    if (!files.length) { setError('Add the scan or photos of every page of your completed form.'); return; }
    if (data.form.declaration && !declared) { setError('Please confirm the declaration below.'); return; }
    setError('');
    setProgress(0);
    try {
      const { data: d } = await portalAPI.uploadApplicationForm(id, files, declared, setProgress);
      toast.success('Your completed form has been uploaded.');
      onDone(d);
    } catch (err) {
      const errs = parseApiErrors(err);
      setError(errs.files || errs.declared || errs.detail || 'The upload didn’t work. Please try again.');
    } finally {
      setProgress(null);
    }
  };

  return (
    <section className="af-panel card af-paper">
      <header className="af-panel__head">
        <span className="af-panel__count">Paper form</span>
        <h3>Fill it in by hand, then upload it</h3>
        <p className="muted">Prefer pen and paper? Follow these three steps. ADRAM receives your upload straight away.</p>
      </header>
      <ol className="af-paper__steps">
        <li>
          <span className="af-paper__num">1</span>
          <div>
            <h4>Download and print the form</h4>
            <p className="muted">It has every question, with space to write and boxes to tick. Your name and reference are already on it.</p>
            <Link to={`/student/applications/${id}/form/blank`} target="_blank" className="btn btn--outline btn--sm"><i className="fas fa-file-arrow-down" /> Download the blank form</Link>
          </div>
        </li>
        <li>
          <span className="af-paper__num">2</span>
          <div>
            <h4>Fill it in and sign it</h4>
            <p className="muted">Write clearly in capital letters, answer every question marked *, and sign and date the declaration at the end.</p>
          </div>
        </li>
        <li>
          <span className="af-paper__num">3</span>
          <div className="af-paper__upload">
            <h4>Scan or photograph every page and upload</h4>
            <p className="muted">A PDF scan or clear photos (JPG, PNG, HEIC) in good light. Up to {MAX_FILES} files, 10 MB each.</p>
            <div className={`af-drop${over ? ' is-over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); add([...e.dataTransfer.files]); }}>
              <i className="fas fa-cloud-arrow-up" aria-hidden="true" />
              <p><strong>Drag your files here</strong> or</p>
              <button type="button" className="btn btn--primary btn--sm" onClick={() => input.current?.click()}><i className="fas fa-folder-open" /> Choose files</button>
              <input ref={input} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { add([...e.target.files]); e.target.value = ''; }} />
            </div>
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
          </div>
        </li>
      </ol>
      {data.form.declaration && (
        <label className="af-declare">
          <input type="checkbox" checked={declared} onChange={(e) => setDeclared(e.target.checked)} />
          <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span>
          <span><strong>Declaration</strong>I filled in and signed this form myself. {data.form.declaration}</span>
        </label>
      )}
      {error && <p className="af-q__error af-paper__error" role="alert"><i className="fas fa-circle-exclamation" aria-hidden="true" /> {error}</p>}
      {progress !== null && <div className="form-card__bar af-paper__progress" aria-label={`Uploading ${progress}%`}><span style={{ width: `${progress}%` }} /><small>Uploading… {progress}%</small></div>}
      <footer className="af-panel__foot">
        <span className="muted small">{files.length ? `${files.length} file${files.length === 1 ? '' : 's'} ready` : 'No files added yet'}</span>
        <button type="button" className="btn btn--primary" onClick={submit} disabled={progress !== null}>
          {progress !== null ? <span className="btn-spinner" /> : <i className="fas fa-paper-plane" />} Submit my completed form
        </button>
      </footer>
    </section>
  );
};

/** /student/applications/:id/form — the application form, section by section, saved as the student types. */
export const StudentApplicationFormPage = () => {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState('');
  const [answers, setAnswers] = useState({});
  const [declared, setDeclared] = useState(false);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState({});
  const [saveState, setSaveState] = useState('saved'); // saved | dirty | saving | error
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState(null); // 'online' | 'paper' (null until the form has loaded)
  const top = useRef(null);

  useEffect(() => {
    portalAPI.applicationForm(id).then(({ data: d }) => {
      setData(d);
      const start = Object.keys(d.answers || {}).length ? d.answers : prefilled(d.form.sections, d.prefill);
      setAnswers(start);
      setDeclared(d.declared);
      setMode(!d.allow_online || (d.allow_upload && d.method === 'upload' && d.status === 'returned') ? 'paper' : 'online');
      if (Object.keys(d.answers || {}).length === 0 && Object.keys(start).length) setSaveState('dirty');
    }).catch((err) => setFailed(parseApiErrors(err).detail || 'This form could not be opened.'));
  }, [id]);

  const save = useCallback(async (nextAnswers, nextDeclared) => {
    setSaveState('saving');
    try {
      await portalAPI.saveApplicationForm(id, { answers: nextAnswers, declared: nextDeclared });
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }, [id]);

  // Save a draft a moment after the student stops typing
  useEffect(() => {
    if (saveState !== 'dirty' || !data?.editable || mode === 'paper' || !data?.allow_online) return undefined;
    const t = setTimeout(() => save(answers, declared), 1200);
    return () => clearTimeout(t);
  }, [answers, declared, saveState, data, save, mode]);

  if (failed) {
    return (
      <PortalLayout title="Application form">
        <div className="card panel af-blocked"><i className="fas fa-lock" aria-hidden="true" /><p>{failed}</p>
          <Link to={`/student/applications/${id}/apply`} className="btn btn--outline btn--sm">Back to my application</Link></div>
      </PortalLayout>
    );
  }
  if (!data) return <PortalLayout title="Application form"><div className="card panel"><p className="muted">Loading your form…</p></div></PortalLayout>;

  const { form } = data;
  const sections = form.sections;
  const overall = progressOf(sections, answers);
  const percent = overall.required ? Math.round((overall.answered / overall.required) * 100) : 100;
  const back = <Link to={`/student/applications/${id}/apply`}><i className="fas fa-arrow-left" /> {data.scholarship_name}</Link>;

  // Submitted (or reviewed): a read-only copy with the download button
  if (!data.editable) {
    return (
      <PortalLayout title="Application form" subtitle={back}>
        <section className={`card panel af-status af-status--${data.status}`}>
          <span className="af-status__icon" aria-hidden="true"><i className={`fas ${data.status === 'reviewed' ? 'fa-circle-check' : 'fa-paper-plane'}`} /></span>
          <div>
            <h2 className="af-title">{data.status === 'reviewed' ? 'Your form has been approved' : 'Your form has been submitted'}</h2>
            <p className="muted">
              Submitted {formatDateTime(data.submitted_at)}.{' '}
              {data.status === 'reviewed' ? 'ADRAM reviewed it, everything is complete, and we’re using it for your application.' : 'ADRAM will review it and email you once it’s approved, or if anything needs to change.'}
            </p>
            {data.approval && (
              <div className="af-approval-line">
                {data.approval.signature && <img src={data.approval.signature} alt="" />}
                <span className="small">Approved by <strong>{data.approval.name}</strong>{data.approval.title && `, ${data.approval.title}`} on {formatDateTime(data.approval.at)}</span>
              </div>
            )}
          </div>
          {data.method === 'upload'
            ? <Link to={`/student/applications/${id}/form/blank`} target="_blank" className="btn btn--outline btn--sm af-status__btn"><i className="fas fa-file-arrow-down" /> Blank form</Link>
            : <Link to={`/student/applications/${id}/form/print`} target="_blank" className="btn btn--primary btn--sm af-status__btn"><i className="fas fa-file-arrow-down" /> Download PDF</Link>}
        </section>
        {data.method === 'upload'
          ? <UploadedPages files={data.files} title="Your uploaded form" />
          : <div className="card af-doc-wrap"><ApplicationFormDocument data={{ ...data, answers }} /></div>}
      </PortalLayout>
    );
  }

  const set = (fid) => (value) => {
    setAnswers((a) => ({ ...a, [fid]: value }));
    setErrors((e) => ({ ...e, [fid]: undefined }));
    setSaveState('dirty');
  };
  const go = (next) => {
    setStep(next);
    top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const current = step === REVIEW ? null : sections[step];
  const flaggedIds = data.flagged_fields || [];
  const flagged = sections.flatMap((s, i) => s.fields.filter((f) => flaggedIds.includes(f.id)).map((field) => ({ field, section: i })));

  const submit = async () => {
    setSubmitting(true);
    try {
      const { data: d } = await portalAPI.saveApplicationForm(id, { answers, declared, submit: true });
      setData(d);
      setErrors({});
      setSaveState('saved');
      toast.success('Your application form has been submitted.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      const problems = err.response?.data?.errors || {};
      setErrors(problems);
      const firstSection = sections.findIndex((s) => s.fields.some((f) => problems[f.id]));
      toast.error(err.response?.data?.detail || parseApiErrors(err).detail || 'Please check your answers.');
      if (firstSection >= 0) go(firstSection);
    } finally {
      setSubmitting(false);
    }
  };

  const saveLabel = { saved: 'All changes saved', dirty: 'Unsaved changes…', saving: 'Saving…', error: 'Couldn’t save. Check your connection.' }[saveState];

  return (
    <PortalLayout title="Application form" subtitle={back}>
      <div ref={top} className="af-hero card">
        <div className="af-hero__text">
          <span className="eyebrow">{data.scholarship_name} · {data.reference}</span>
          <h2 className="af-hero__title">{form.title}</h2>
          {form.intro && <p className="muted">{form.intro}</p>}
        </div>
        <div className="af-hero__progress" aria-label={`${percent}% complete`}>
          <svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15.9" className="af-ring__bg" /><circle cx="18" cy="18" r="15.9" className="af-ring__fg" style={{ strokeDasharray: `${percent} 100` }} /></svg>
          <span><strong>{percent}%</strong>complete</span>
        </div>
      </div>

      {data.agreement?.status === 'pending' && <AgreementInvite applicationId={id} agreement={data.agreement} scholarship={data.scholarship_name} compact />}

      {data.status === 'returned' && (data.return_note || flagged.length > 0) && (
        <div className="af-returned" role="alert">
          <i className="fas fa-rotate-left" aria-hidden="true" />
          <div>
            <strong>ADRAM asked you to update your form</strong>
            {data.return_note && <p>{data.return_note}</p>}
            {flagged.length > 0 && (
              <ul>
                {flagged.map(({ field, section }) => (
                  <li key={field.id}><button type="button" onClick={() => { setMode('online'); go(section); setTimeout(() => document.getElementById(`question-${field.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 350); }}>{field.label}</button></li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {data.allow_online && data.allow_upload && (
        <div className="af-modes" role="radiogroup" aria-label="How would you like to complete the form?">
          <p className="af-modes__q">How would you like to complete it?</p>
          <button type="button" role="radio" aria-checked={mode === 'online'} className={`af-mode${mode === 'online' ? ' is-active' : ''}`} onClick={() => setMode('online')}>
            <span className="af-mode__icon" aria-hidden="true"><i className="fas fa-laptop" /></span>
            <span><strong>Fill in online <em>Recommended</em></strong><small>About 15 minutes. Saved as you go, nothing to print or scan.</small></span>
            <i className="fas fa-circle-check af-mode__tick" aria-hidden="true" />
          </button>
          <button type="button" role="radio" aria-checked={mode === 'paper'} className={`af-mode${mode === 'paper' ? ' is-active' : ''}`} onClick={() => setMode('paper')}>
            <span className="af-mode__icon" aria-hidden="true"><i className="fas fa-file-signature" /></span>
            <span><strong>Paper form</strong><small>Download, fill in by hand and sign, then upload a scan or photos.</small></span>
            <i className="fas fa-circle-check af-mode__tick" aria-hidden="true" />
          </button>
        </div>
      )}

      {mode === 'paper' ? <PaperRoute id={id} data={data} onDone={(d) => { setData(d); window.scrollTo({ top: 0, behavior: 'smooth' }); }} /> : (
      <div className="af-layout">
        <nav className="af-steps card" aria-label="Form sections">
          <ol>
            {sections.map((s, i) => {
              const done = sectionDone(s, answers);
              const hasError = s.fields.some((f) => errors[f.id]);
              const hasFlag = s.fields.some((f) => flaggedIds.includes(f.id));
              return (
                <li key={s.id}>
                  <button type="button" className={`af-step${step === i ? ' is-current' : ''}${done ? ' is-done' : ''}${hasError ? ' has-error' : ''}${hasFlag && !hasError ? ' has-flag' : ''}`}
                    aria-current={step === i ? 'step' : undefined} onClick={() => go(i)}>
                    <span className="af-step__dot" aria-hidden="true">{hasError ? <i className="fas fa-exclamation" /> : hasFlag ? <i className="fas fa-flag" /> : done ? <i className="fas fa-check" /> : i + 1}</span>
                    <span className="af-step__text">{s.title}<small>{progressOf([s], answers).answered}/{progressOf([s], answers).required} required</small></span>
                  </button>
                </li>
              );
            })}
            <li>
              <button type="button" className={`af-step${step === REVIEW ? ' is-current' : ''}`} onClick={() => go(REVIEW)}>
                <span className="af-step__dot" aria-hidden="true"><i className="fas fa-flag-checkered" /></span>
                <span className="af-step__text">Review &amp; submit</span>
              </button>
            </li>
          </ol>
          <p className={`af-save af-save--${saveState}`} aria-live="polite"><i className={`fas ${saveState === 'error' ? 'fa-triangle-exclamation' : saveState === 'saved' ? 'fa-cloud' : 'fa-rotate'}`} aria-hidden="true" /> {saveLabel}</p>
        </nav>

        <section className="af-panel card">
          {current ? (
            <>
              <header className="af-panel__head">
                <span className="af-panel__count">Section {step + 1} of {sections.length}</span>
                <h3>{current.title}</h3>
                {current.description && <p className="muted">{current.description}</p>}
              </header>
              <div className="af-grid">
                {current.fields.map((f, k) => <FormQuestion key={f.id} number={`${step + 1}.${k + 1}`} field={f} value={answers[f.id]} onChange={set(f.id)} error={errors[f.id]} flagged={flaggedIds.includes(f.id)} />)}
              </div>
              <footer className="af-panel__foot">
                {step > 0 ? <button type="button" className="btn btn--outline" onClick={() => go(step - 1)}><i className="fas fa-arrow-left" /> Back</button> : <span />}
                <button type="button" className="btn btn--primary" onClick={() => go(step + 1 < sections.length ? step + 1 : REVIEW)}>
                  {step + 1 < sections.length ? <>Save &amp; continue <i className="fas fa-arrow-right" /></> : <>Review your answers <i className="fas fa-arrow-right" /></>}
                </button>
              </footer>
            </>
          ) : (
            <>
              <header className="af-panel__head">
                <span className="af-panel__count">Final step</span>
                <h3>Review your answers</h3>
                <p className="muted">Check everything carefully. You can go back to any section to change an answer.</p>
              </header>
              <div className="af-review">
                {sections.map((s, i) => (
                  <div key={s.id} className="af-review__section">
                    <div className="af-review__head">
                      <h4>{s.title}</h4>
                      <button type="button" className="btn btn--text btn--sm" onClick={() => go(i)}><i className="fas fa-pen" /> Edit</button>
                    </div>
                    <dl>
                      {s.fields.map((f) => (
                        <div key={f.id} className={errors[f.id] || (f.required && isEmpty(answers[f.id])) ? 'is-missing' : ''}>
                          <dt>{f.label}</dt>
                          <dd>{displayValue(f, answers[f.id]) || (f.required ? <span className="af-missing">Missing: required</span> : <span className="muted">Not answered</span>)}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </div>
              {form.declaration && (
                <label className={`af-declare${errors._declaration ? ' has-error' : ''}`}>
                  <input type="checkbox" checked={declared} onChange={(e) => { setDeclared(e.target.checked); setErrors((x) => ({ ...x, _declaration: undefined })); setSaveState('dirty'); }} />
                  <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span>
                  <span><strong>Declaration</strong>{form.declaration}</span>
                </label>
              )}
              {errors._declaration && <p className="af-q__error" role="alert">{errors._declaration}</p>}
              <footer className="af-panel__foot">
                <button type="button" className="btn btn--outline" onClick={() => go(sections.length - 1)}><i className="fas fa-arrow-left" /> Back</button>
                <button type="button" className="btn btn--primary" onClick={submit} disabled={submitting}>
                  {submitting ? <span className="btn-spinner" /> : <i className="fas fa-paper-plane" />} Submit application form
                </button>
              </footer>
              {overall.answered < overall.required && <p className="muted small af-left">{overall.required - overall.answered} required question{overall.required - overall.answered === 1 ? '' : 's'} still to answer.</p>}
            </>
          )}
        </section>
      </div>
      )}
    </PortalLayout>
  );
};

export default StudentApplicationFormPage;

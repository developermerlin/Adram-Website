import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import ApplicationFormDocument from '../../components/portal/ApplicationFormDocument';
import SignaturePad from '../../components/portal/SignaturePad';
import { Spinner } from '../../components/ui/Section';
import { openPrivateFile, portalAPI, staffPortalAPI, parseApiErrors } from '../../services/api';
import { formatDateTime } from '../../utils/format';
import '../../styles/application-form.css';

const TONE = { draft: 'badge--gray', submitted: 'badge--blue', returned: 'badge--amber', reviewed: 'badge--green' };
const size = (bytes) => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** The pages of a paper form the student uploaded (opened privately: only the student and administrators can). */
export const UploadedPages = ({ files, title = 'Uploaded form' }) => (
  <div className="afp__files">
    <h2><i className="fas fa-file-pdf" aria-hidden="true" /> {title} ({files.length} file{files.length === 1 ? '' : 's'})</h2>
    <ul>
      {files.map((f) => (
        <li key={f.id}>
          <i className={`fas ${/\.pdf$/i.test(f.name) ? 'fa-file-pdf' : 'fa-file-image'}`} aria-hidden="true" />
          <span>{f.name} <small className="muted">· {size(f.size)} · {formatDateTime(f.uploaded_at)}</small></span>
          <button type="button" className="btn btn--outline btn--sm" onClick={() => openPrivateFile('forms', f.id).catch(() => toast.error('Could not open the file.'))}>
            <i className="fas fa-up-right-from-square" /> Open
          </button>
        </li>
      ))}
    </ul>
  </div>
);

/** Approve the form: sign (or reuse a saved signature), with name and job title. */
const ApprovePanel = ({ onApprove, onCancel, busy }) => {
  const [saved, setSaved] = useState(null);
  const [useSaved, setUseSaved] = useState(true);
  const [signature, setSignature] = useState('');
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [remember, setRemember] = useState(true);
  useEffect(() => {
    staffPortalAPI.mySignature().then(({ data }) => {
      setSaved(data);
      setName(data.name);
      setTitle(data.title);
      setUseSaved(Boolean(data.image));
    }).catch(() => setSaved({ image: '', title: '', name: '' }));
  }, []);
  if (!saved) return <div className="afp__panel"><p className="muted">Loading…</p></div>;
  const ready = (useSaved && saved.image) || signature;
  return (
    <div className="afp__panel afp__panel--approve">
      <div className="afp__panel-head">
        <span className="afp__panel-icon" aria-hidden="true"><i className="fas fa-file-signature" /></span>
        <div><h2>Approve and sign this form</h2><p className="muted small">Your signature, name and title are added to the form and its PDF. The student gets an email that it’s approved.</p></div>
      </div>
      {saved.image && useSaved ? (
        <div className="afp__saved">
          <img src={saved.image} alt="Your saved signature" />
          <button type="button" className="btn btn--text btn--sm" onClick={() => setUseSaved(false)}><i className="fas fa-pen" /> Sign again instead</button>
        </div>
      ) : (
        <>
          <SignaturePad onChange={setSignature} defaultName={name} />
          {saved.image && <button type="button" className="btn btn--text btn--sm" onClick={() => setUseSaved(true)}>Use my saved signature</button>}
        </>
      )}
      <div className="afp__panel-row">
        <label className="field"><span className="field__label">Name</span><input className="input" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field"><span className="field__label">Job title</span><input className="input" value={title} maxLength={120} placeholder="e.g. Scholarship Officer" onChange={(e) => setTitle(e.target.value)} /></label>
      </div>
      {!(saved.image && useSaved) && (
        <label className="checkbox">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span>
          <span>Save this signature for next time</span>
        </label>
      )}
      <div className="afp__panel-actions">
        <button type="button" className="btn btn--success btn--sm" disabled={busy || !ready || !name.trim()}
          onClick={() => onApprove({ action: 'approve', name, title, ...(useSaved && saved.image ? {} : { signature, save_signature: remember }) })}>
          {busy ? <span className="btn-spinner" /> : <i className="fas fa-circle-check" />} Sign and approve
        </button>
        <button type="button" className="btn btn--text btn--sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
};

/** Send the form back: tick the questions to check and/or write a note. */
const ReturnPanel = ({ data, onReturn, onCancel, busy }) => {
  const [note, setNote] = useState('');
  const [fields, setFields] = useState([]);
  const online = data.method !== 'upload';
  const toggle = (id) => setFields((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  return (
    <div className="afp__panel afp__panel--return">
      <div className="afp__panel-head">
        <span className="afp__panel-icon" aria-hidden="true"><i className="fas fa-rotate-left" /></span>
        <div><h2>Return for changes</h2><p className="muted small">The student gets an email with your note{online ? ' and the questions you tick, which are highlighted on their form' : ''}.</p></div>
      </div>
      {online && (
        <div className="afp__checklist">
          <span className="field__label">Which answers need attention? <small className="muted">({fields.length} selected)</small></span>
          {data.form.sections.map((s, i) => (
            <fieldset key={s.id}>
              <legend>{i + 1}. {s.title}</legend>
              {s.fields.map((f, k) => (
                <label key={f.id} className={`afp__check${fields.includes(f.id) ? ' is-on' : ''}`}>
                  <input type="checkbox" checked={fields.includes(f.id)} onChange={() => toggle(f.id)} />
                  <span><b>{i + 1}.{k + 1}</b> {f.label}</span>
                </label>
              ))}
            </fieldset>
          ))}
        </div>
      )}
      <label className="field"><span className="field__label">Message to the student{online ? ' (optional if you ticked questions)' : ''}</span>
        <textarea className="input" rows={3} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)}
          placeholder={online ? 'e.g. Please add your passport expiry date and a second referee.' : 'e.g. Page 2 of your scan is blurry. Please upload it again.'} /></label>
      <div className="afp__panel-actions">
        <button type="button" className="btn btn--primary btn--sm" disabled={busy || (!note.trim() && !fields.length)} onClick={() => onReturn({ action: 'return', note, fields })}>
          {busy && <span className="btn-spinner" />} Send back to the student
        </button>
        <button type="button" className="btn btn--text btn--sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
};

/**
 * The application form as a document, without the portal around it, ready to print or save as a PDF.
 *   Students: /student/applications/:id/form/print (their answers) and /form/blank (the paper form to fill in by hand)
 *   Administrators: /admin/applications/:id/form, with the uploaded pages and the review actions
 */
export const ApplicationFormPrintPage = ({ staff = false, blank = false }) => {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState('');
  const [panel, setPanel] = useState(null); // 'approve' | 'return' | null
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (staff ? staffPortalAPI.applicationForm(id) : portalAPI.applicationForm(id))
      .then(({ data: d }) => setData(d))
      .catch((err) => setFailed(parseApiErrors(err).detail || 'This form could not be opened.'));
  }, [id, staff]);

  // The saved PDF is named after the document title
  useEffect(() => {
    if (!data) return undefined;
    const before = document.title;
    const who = (data.student?.name || 'applicant').replace(/[^\w ]+/g, '').trim().replace(/\s+/g, '-');
    document.title = `ADRAM-application-form-${data.reference}-${who}${blank ? '-blank' : ''}`;
    return () => { document.title = before; };
  }, [data, blank]);

  if (failed) return <main className="afp"><p className="afp__msg">{failed} <Link to={staff ? '/admin/settings/application-form' : `/student/applications/${id}/apply`}>Go back</Link></p></main>;
  if (!data) return <Spinner label="Preparing the form…" />;

  const act = async (payload, message) => {
    setBusy(true);
    try {
      const { data: d } = await staffPortalAPI.applicationFormAction(id, payload);
      setData(d);
      setPanel(null);
      toast.success(message);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      const errs = parseApiErrors(err);
      toast.error(errs.note || errs.signature || errs.detail || 'Could not update the form.');
    } finally {
      setBusy(false);
    }
  };
  const submitted = data.status !== 'draft';
  const paper = data.method === 'upload' && submitted;

  return (
    <main className="afp">
      <div className="afp__tools">
        <Link to={staff ? '/admin/settings/application-form' : `/student/applications/${id}/form`} className="btn btn--outline btn--sm"><i className="fas fa-arrow-left" /> Back</Link>
        {staff && <span className={`badge ${TONE[data.status]}`}>{data.status_display}{submitted && ` · ${data.method_display}`}</span>}
        <span className="afp__spacer" />
        {staff && !submitted && (
          <button type="button" className="btn btn--outline btn--sm" disabled={busy} onClick={() => act({ action: 'remind' }, `Reminder sent to ${data.student.email}.`)}>
            <i className="fas fa-bell" /> {data.reminded_at ? 'Send another reminder' : 'Send a reminder'}
          </button>
        )}
        {staff && submitted && data.status !== 'reviewed' && data.status !== 'returned' && !panel && (
          <>
            <button type="button" className="btn btn--outline btn--sm" onClick={() => setPanel('return')}><i className="fas fa-rotate-left" /> Return for changes</button>
            <button type="button" className="btn btn--success btn--sm" onClick={() => setPanel('approve')}><i className="fas fa-file-signature" /> Approve &amp; sign</button>
          </>
        )}
        {staff && data.status === 'reviewed' && (
          <button type="button" className="btn btn--outline btn--sm" disabled={busy} onClick={() => act({ action: 'reopen' }, 'The student can change the form again.')}><i className="fas fa-lock-open" /> Let the student change it</button>
        )}
        {!(staff && paper) && (
          <button type="button" className="btn btn--primary btn--sm" onClick={() => window.print()}>
            <i className={`fas ${blank ? 'fa-print' : 'fa-file-arrow-down'}`} /> {blank ? 'Print / save the blank form' : 'Download PDF'}
          </button>
        )}
      </div>

      {staff && panel === 'approve' && <ApprovePanel busy={busy} onCancel={() => setPanel(null)} onApprove={(payload) => act(payload, 'Approved and signed. The student has been emailed.')} />}
      {staff && panel === 'return' && <ReturnPanel data={data} busy={busy} onCancel={() => setPanel(null)} onReturn={(payload) => act(payload, 'Sent back to the student.')} />}
      {staff && data.status === 'reviewed' && data.approval && (
        <p className="afp__msg afp__msg--ok"><i className="fas fa-circle-check" aria-hidden="true" /> Approved by <strong>{data.approval.name}</strong>{data.approval.title && `, ${data.approval.title}`} on {formatDateTime(data.approval.at)}.</p>
      )}
      {staff && data.status === 'returned' && (data.return_note || data.flagged_fields.length > 0) && (
        <p className="afp__msg"><strong>Returned to the student:</strong> {data.return_note}{data.flagged_fields.length > 0 && ` (${data.flagged_fields.length} question${data.flagged_fields.length === 1 ? '' : 's'} to check)`}</p>
      )}
      {staff && !submitted && (
        <p className="afp__msg">
          The student hasn’t submitted the form yet ({data.progress.answered} of {data.progress.required} required answers filled in online).
          {data.reminded_at && <> Last reminder sent {formatDateTime(data.reminded_at)}.</>}
        </p>
      )}
      {staff && paper && data.files.length > 0 && <UploadedPages files={data.files} title="The student’s scanned form" />}

      {(!paper || !staff) && (
        <>
          <p className="afp__hint">
            {blank
              ? <>Print this form, fill it in by hand and sign it. Then scan or photograph every page and upload it on your application form page. In the print window you can also choose <strong>Save as PDF</strong>.</>
              : <>In the print window choose <strong>Save as PDF</strong> as the printer to download a PDF copy.</>}
          </p>
          <div className="afp__paper"><ApplicationFormDocument data={data} blank={blank} /></div>
        </>
      )}
      {staff && paper && <p className="afp__hint">The student filled in the paper form by hand and uploaded it. Open each file to read it.</p>}
    </main>
  );
};

export default ApplicationFormPrintPage;

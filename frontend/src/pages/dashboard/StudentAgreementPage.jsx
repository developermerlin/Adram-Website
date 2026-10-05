import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import PortalLayout from '../../components/layout/PortalLayout';
import AgreementDocument from '../../components/portal/AgreementDocument';
import SignaturePad from '../../components/portal/SignaturePad';
import AgreementPayments from '../../components/portal/AgreementPayments';
import AgreementPaperUpload from '../../components/portal/AgreementPaperUpload';
import { openPrivateFile, portalAPI, parseApiErrors } from '../../services/api';
import { formatDateTime } from '../../utils/format';
import { fillText, INPUT_TYPES } from '../../utils/agreement';
import '../../styles/application-form.css';
import '../../styles/agreement.css';

/** One field the admin set up (student information, or beside the signature). */
const FieldInput = ({ field, value, error, onChange }) => (
  <label className={`field${field.type === 'long' ? ' is-wide' : ''}`}>
    <span className="field__label">{field.label}{!field.required && <small className="muted"> (optional)</small>}</span>
    {field.type === 'long'
      ? <textarea className="input" rows={3} value={value} maxLength={1000} aria-invalid={Boolean(error)} onChange={(e) => onChange(e.target.value)} />
      : <input className="input" type={INPUT_TYPES[field.type] || 'text'} value={value} maxLength={300} aria-invalid={Boolean(error)} onChange={(e) => onChange(e.target.value)} />}
    {error && <small className="ags-error">{error}</small>}
  </label>
);

/** /student/applications/:id/agreement — read the service agreement, confirm your details and sign it. */
export const StudentAgreementPage = () => {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState('');
  const [details, setDetails] = useState({});
  const [sigEdits, setSigEdits] = useState({});
  const [agree, setAgree] = useState(false);
  const [signature, setSignature] = useState('');
  const [readToEnd, setReadToEnd] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState(null); // 'online' or 'paper' (null = the first one allowed)
  const docRef = useRef(null);
  const endRef = useRef(null);

  useEffect(() => {
    portalAPI.agreement(id).then(({ data: d }) => {
      setData(d);
      setDetails(d.prefill || {});
    }).catch((err) => setFailed(parseApiErrors(err).detail || 'This agreement could not be opened.'));
  }, [id]);

  // The agreement must be scrolled to the end before it can be accepted (unless the admin switched that off)
  useEffect(() => {
    if (!data || data.status !== 'pending' || !data.require_read || !endRef.current) return undefined;
    const watch = new IntersectionObserver(([entry]) => entry.isIntersecting && setReadToEnd(true), { root: docRef.current, threshold: 1 });
    watch.observe(endRef.current);
    return () => watch.disconnect();
  }, [data]);

  const back = <Link to={`/student/applications/${id}/apply`}><i className="fas fa-arrow-left" /> Back to my application</Link>;
  if (failed) {
    return (
      <PortalLayout title="Service agreement" subtitle={back}>
        <div className="card panel af-blocked"><i className="fas fa-file-contract" aria-hidden="true" /><p>{failed}</p></div>
      </PortalLayout>
    );
  }
  if (!data) return <PortalLayout title="Service agreement"><div className="card panel"><p className="muted">Loading your agreement…</p></div></PortalLayout>;

  const w = data.wording;
  const signed = data.status === 'signed';
  const uploaded = data.status === 'uploaded';
  const pending = data.status === 'pending';
  const how = mode || (data.allow_online ? 'online' : 'paper');
  const onPaper = data.paper_signed;
  const canAgree = readToEnd || !data.require_read;
  const name = details.full_name || data.student.name;
  const values = { ...data.values, title: data.content.title, company_name: data.content.company_name, student_name: name, reference: data.reference, scholarship: data.scholarship_name };
  // Beside the signature: until the student edits a field, "same as" fields follow their details and the rest keep their starting value
  const sigValue = (f) => {
    if (f.id in sigEdits) return sigEdits[f.id];
    if (f.prefill?.startsWith('field:')) return details[f.prefill.slice(6)] || '';
    return data.signature_prefill?.[f.id] || '';
  };
  const signedWith = Object.fromEntries(data.signature_fields.map((f) => [f.id, sigValue(f)]));
  const clearError = (key) => setErrors((x) => ({ ...x, [key]: undefined }));

  const onScroll = (e) => {
    const el = e.currentTarget;
    setProgress(Math.min(100, Math.round(((el.scrollTop + el.clientHeight) / el.scrollHeight) * 100)));
  };
  const sign = async () => {
    setBusy(true);
    try {
      const { data: d } = await portalAPI.signAgreement(id, { details, signature_details: signedWith, agree, signature });
      setData(d);
      setErrors({});
      toast.success('Thank you, your agreement is signed.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setErrors(err.response?.data?.errors || {});
      toast.error(err.response?.data?.detail || parseApiErrors(err).detail || 'Please check the form.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PortalLayout title="Service agreement" subtitle={back}>
      <section className={`card ags-hero${signed ? ' ags-done' : ''}`}>
        <span className="ags-hero__icon" aria-hidden="true"><i className={`fas ${signed ? 'fa-file-circle-check' : uploaded ? 'fa-hourglass-half' : data.awarded ? 'fa-award' : 'fa-file-signature'}`} /></span>
        <div>
          <h2>{signed ? 'Your agreement is signed' : uploaded ? 'Signed copy received' : fillText(data.awarded ? w.hero_title_awarded : w.hero_title, values)}</h2>
          <p className="muted">
            {signed && onPaper && `You signed agreement ${data.reference} on paper and ADRAM accepted your signed copy on ${formatDateTime(data.accepted_at)}. Keep a copy for your records.`}
            {signed && !onPaper && `You signed agreement ${data.reference} on ${formatDateTime(data.signed_at)}. Keep a copy for your records.`}
            {uploaded && `${fillText(w.uploaded_note, values)} (Uploaded ${formatDateTime(data.uploaded_at)}.)`}
            {pending && fillText(data.awarded ? w.intro_awarded : w.intro, values)}
          </p>
        </div>
        {signed && <Link to={`/student/applications/${id}/agreement/print`} target="_blank" className="btn btn--primary btn--sm"><i className="fas fa-file-arrow-down" /> Download PDF</Link>}
      </section>

      {pending && data.return_note && (
        <div className="af-returned" role="alert">
          <i className="fas fa-rotate-left" aria-hidden="true" />
          <div><strong>ADRAM asked you to upload your signed agreement again</strong><p>{data.return_note}</p></div>
        </div>
      )}

      {(uploaded || onPaper) && data.files.length > 0 && (
        <section className="card ags-files">
          <h3>Your signed copy</h3>
          <ul className="af-files">
            {data.files.map((f) => (
              <li key={f.id}>
                <i className={`fas ${/\.pdf$/i.test(f.name) ? 'fa-file-pdf' : 'fa-file-image'}`} aria-hidden="true" />
                <span>{f.name}<small>Uploaded {formatDateTime(f.uploaded_at)}</small></span>
                <button type="button" className="btn btn--text btn--sm" onClick={() => openPrivateFile('agreements', f.id)}><i className="fas fa-eye" /> Open</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div ref={docRef} className="ags-doc" onScroll={onScroll} tabIndex={0} aria-label="The agreement">
        {!signed && data.require_read && progress < 100 && !readToEnd && <div className="ags-progress"><span>Keep reading · {progress}%</span></div>}
        <AgreementDocument data={data} details={signed || uploaded ? undefined : details} signedWith={signed || uploaded ? undefined : signedWith} />
        <div ref={endRef} className="ags-end" aria-hidden="true" />
      </div>

      {signed && <AgreementPayments money={data.money} payments={data.payments} title={fillText(w.payments_heading, values)} />}

      {pending && !data.ready && (
        <section className="card ags-sign ags-wait" role="status">
          <h3><i className="fas fa-hourglass-half" aria-hidden="true" /> {fillText(w.sign_heading, values)}</h3>
          <p className="muted">{fillText(w.not_ready, values)}</p>
        </section>
      )}

      {pending && data.ready && data.allow_online && data.allow_upload && (
        <div className="af-modes ags-modes" role="radiogroup" aria-label={fillText(w.choose_heading, values)}>
          <p className="af-modes__q">{fillText(w.choose_heading, values)}</p>
          <button type="button" role="radio" aria-checked={how === 'online'} className={`af-mode${how === 'online' ? ' is-active' : ''}`} onClick={() => setMode('online')}>
            <span className="af-mode__icon" aria-hidden="true"><i className="fas fa-laptop" /></span>
            <span><strong>{fillText(w.online_option, values)} <em>Recommended</em></strong><small>{fillText(w.online_hint, values)}</small></span>
            <i className="fas fa-circle-check af-mode__tick" aria-hidden="true" />
          </button>
          <button type="button" role="radio" aria-checked={how === 'paper'} className={`af-mode${how === 'paper' ? ' is-active' : ''}`} onClick={() => setMode('paper')}>
            <span className="af-mode__icon" aria-hidden="true"><i className="fas fa-file-signature" /></span>
            <span><strong>{fillText(w.paper_option, values)}</strong><small>{fillText(w.paper_hint, values)}</small></span>
            <i className="fas fa-circle-check af-mode__tick" aria-hidden="true" />
          </button>
        </div>
      )}

      {pending && data.ready && how === 'paper' && (
        <AgreementPaperUpload id={id} steps={w.paper_steps} onDone={(d) => { setData(d); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
      )}

      {pending && data.ready && how === 'online' && (
        <section className="card ags-sign">
          <h3>{fillText(w.details_heading, values)}</h3>
          <div className="ags-details">
            {data.student_fields.map((f) => (
              <FieldInput key={f.id} field={f} value={details[f.id] || ''} error={errors[f.id]}
                onChange={(v) => { setDetails((d) => ({ ...d, [f.id]: v })); clearError(f.id); }} />
            ))}
          </div>

          <h3>{fillText(w.sign_heading, values)}</h3>
          <label className={`ags-agree${canAgree ? '' : ' is-disabled'}`}>
            <input type="checkbox" checked={agree} disabled={!canAgree} onChange={(e) => { setAgree(e.target.checked); clearError('agree'); }} />
            <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span>
            <span>
              {fillText(w.agree_statement, values)}
              {!canAgree && <small className="muted"> Scroll to the end of the agreement first.</small>}
            </span>
          </label>
          {errors.agree && <p className="ags-error">{errors.agree}</p>}
          <SignaturePad onChange={(v) => { setSignature(v); clearError('signature'); }} defaultName={name || ''} />
          {errors.signature && <p className="ags-error">{errors.signature}</p>}

          {data.signature_fields.length > 0 && (
            <div className="ags-beside">
              <p className="ags-beside__label">{fillText(w.signature_fields_heading, values)}</p>
              <div className="ags-details">
                {data.signature_fields.map((f) => (
                  <FieldInput key={f.id} field={f} value={sigValue(f)} error={errors[`sig_${f.id}`]}
                    onChange={(v) => { setSigEdits((x) => ({ ...x, [f.id]: v })); clearError(`sig_${f.id}`); }} />
                ))}
              </div>
            </div>
          )}

          {w.esign_note && <p className="muted small">{fillText(w.esign_note, values)}</p>}
          <div>
            <button type="button" className="btn btn--primary" onClick={sign} disabled={busy || !agree || !signature}>
              {busy ? <span className="btn-spinner" /> : <i className="fas fa-file-signature" />} {fillText(w.sign_button, values)}
            </button>
          </div>
        </section>
      )}
    </PortalLayout>
  );
};

export default StudentAgreementPage;

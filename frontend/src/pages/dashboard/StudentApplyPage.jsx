import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { openPrivateFile, parseApiErrors, portalAPI } from '../../services/api';
import { formatDate, formatDateTime, formatMoney } from '../../utils/format';
import PortalLayout from '../../components/layout/PortalLayout';
import { Alert } from '../../components/ui/Form';
import { Spinner } from '../../components/ui/Section';
import { ReceiptButton } from '../../components/portal/ServiceStatus';
import { ProgressSummary, ProgressTimeline, ReturnReason, ReviewBadge } from '../../components/portal/Progress';
import { ResultBanner } from '../../components/portal/Result';
import { resultState } from '../../utils/applicationStages';

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx';

const copy = (text) => navigator.clipboard?.writeText(text).then(() => toast.success('Copied'), () => {});

const METHODS = [
  { id: 'afrimoney', label: 'Afrimoney', numberKey: 'afrimoney_number', nameKey: 'afrimoney_name' },
  { id: 'orange_money', label: 'Orange Money', numberKey: 'orange_money_number', nameKey: 'orange_money_name' },
];

// One checklist item with its upload.
const DocumentUpload = ({ doc, onChanged }) => {
  const input = useRef(null);
  const accepted = doc.review_status === 'accepted'; // locked once ADRAM accepts it
  const returned = doc.review_status === 'returned';
  const [busy, setBusy] = useState(false);

  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      await portalAPI.uploadDocument(doc.id, file);
      toast.success(`${doc.name} uploaded`);
      await onChanged();
    } catch (err) {
      const e = parseApiErrors(err);
      toast.error(e.file || e.form);
    } finally {
      setBusy(false);
      input.current.value = '';
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await portalAPI.removeDocumentFile(doc.id);
      await onChanged();
    } catch {
      toast.error('Could not remove the file.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={`upload-row${doc.has_file ? ' is-done' : ''}${returned ? ' is-returned' : ''}${accepted ? ' is-accepted' : ''}`}>
      <span className="upload-row__icon" aria-hidden="true">
        <i className={`fas ${returned ? 'fa-rotate-left' : doc.has_file ? 'fa-circle-check' : 'fa-file-arrow-up'}`} />
      </span>
      <div className="upload-row__main">
        <span className="upload-row__title"><strong>{doc.name}</strong> {(doc.has_file || doc.review_status) && <ReviewBadge doc={doc} />}</span>
        <small>{doc.has_file ? `${doc.file_name} · uploaded ${formatDateTime(doc.uploaded_at)}` : 'Not uploaded yet'}</small>
        <ReturnReason doc={doc} />
      </div>
      <div className="upload-row__actions">
        {doc.has_file && (
          <button type="button" className="btn btn--text btn--sm" onClick={() => openPrivateFile('documents', doc.id).catch(() => toast.error('Could not open the file.'))}>View</button>
        )}
        <input ref={input} type="file" accept={ACCEPT} hidden onChange={(e) => upload(e.target.files[0])} />
        {!accepted && (
          <button type="button" className={`btn btn--sm ${doc.has_file && !returned ? 'btn--outline' : 'btn--primary'}`} disabled={busy} onClick={() => input.current.click()}>
            {busy ? <span className="btn-spinner" /> : <i className="fas fa-upload" />} {returned ? 'Re-upload' : doc.has_file ? 'Replace' : 'Upload'}
          </button>
        )}
        {doc.has_file && !accepted && (
          <button type="button" className="icon-btn icon-btn--danger" aria-label={`Remove the file for ${doc.name}`} disabled={busy} onClick={remove}>
            <i className="fas fa-xmark" />
          </button>
        )}
      </div>
    </li>
  );
};

export const StudentApplyPage = () => {
  const { id } = useParams();
  const [a, setA] = useState(null);
  const [error, setError] = useState('');
  const [method, setMethod] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(
    () =>
      portalAPI
        .application(id)
        .then(({ data }) => setA(data))
        .catch(() => setError('This application couldn’t be found.')),
    [id],
  );

  useEffect(() => {
    load();
  }, [load]);

  const back = <Link to="/student/applications" className="back-link"><i className="fas fa-arrow-left" /> My applications</Link>;

  if (error) return <PortalLayout title="Payment & documents" subtitle={back}><Alert>{error}</Alert></PortalLayout>;
  if (!a) return <PortalLayout title="Payment & documents"><Spinner label="Loading…" /></PortalLayout>;

  const s = a.service;
  if (!s?.unlocked || !s.terms_accepted_at) {
    return (
      <PortalLayout title="Payment & documents" subtitle={back}>
        <Alert type="info">
          {!s?.unlocked
            ? 'This step opens once ADRAM has approved your request and shared your guidelines.'
            : 'Please read and accept the terms and conditions in your portal first.'}
        </Alert>
      </PortalLayout>
    );
  }

  const pay = s.payment || {};
  const canPay = s.status === 'approved' || s.status === 'payment_rejected';
  const uploaded = a.documents.filter((d) => d.has_file).length;
  const acceptedCount = a.documents.filter((d) => d.review_status === 'accepted').length;
  const returnedCount = a.documents.filter((d) => d.review_status === 'returned').length;
  const paid = s.status === 'paid';
  const cutoff = a.scholarship_info?.service_cutoff;

  const submit = async (e) => {
    e.preventDefault();
    const missing = {};
    if (!method) missing.payment_method = 'Choose how you paid.';
    if (!transactionId.trim()) missing.transaction_id = 'Enter the transaction ID from your confirmation SMS.';
    if (!receipt) missing.receipt = 'Upload a photo or PDF of your receipt.';
    setErrors(missing);
    if (Object.keys(missing).length) return;
    setSubmitting(true);
    try {
      await portalAPI.submitPayment(a.id, { paymentMethod: method, transactionId: transactionId.trim(), receipt });
      toast.success('Payment submitted. We’ll confirm it shortly.');
      setReceipt(null);
      await load();
    } catch (err) {
      const parsed = parseApiErrors(err);
      setErrors(parsed);
      toast.error(parsed.form || parsed.receipt || 'Please check the form.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PortalLayout title={paid ? 'Application progress' : 'Payment & documents'} subtitle={back}>
      <section className="card panel apply-head">
        <div>
          <span className="eyebrow">ADRAM applies for you</span>
          <h2>{a.scholarship_name}</h2>
          <p className="muted">
            {paid
              ? 'Follow each step of your application below, and keep your documents up to date.'
              : 'Pay the application fee by mobile money, upload your receipt, then upload each document below.'}
          </p>
        </div>
        <dl className="service-facts">
          {!paid && <div><dt>Amount to pay</dt><dd className="apply-head__amount">{formatMoney(s.amount)}</dd></div>}
          <div><dt>Stage</dt><dd>{a.stage_display}</dd></div>
          <div>
            <dt>Payment reference</dt>
            <dd>{s.reference} <button type="button" className="icon-btn" aria-label="Copy reference" onClick={() => copy(s.reference)}><i className="far fa-copy" /></button></dd>
          </div>
          {cutoff && <div><dt>Send everything by</dt><dd>{formatDate(`${cutoff}T00:00`)}</dd></div>}
        </dl>
      </section>

      {s.status === 'payment_submitted' && <Alert type="info">Your payment was submitted on {formatDateTime(s.payment_submitted_at)}. ADRAM is checking it; you’ll get an email when it’s confirmed. You can still upload documents below.</Alert>}
      {paid && (
        <section className={`card panel in-progress${resultState(a.stage) ? ` in-progress--${resultState(a.stage).key}` : ''}`}>
          {resultState(a.stage) ? (
            <ResultBanner application={a} />
          ) : (
            <div className="in-progress__head">
              <span className="in-progress__icon" aria-hidden="true"><i className="fas fa-person-running" /></span>
              <div>
                <h2 className="h3">Your application is in progress</h2>
                <p className="muted small">Payment confirmed on {formatDateTime(s.verified_at)}. ADRAM keeps this timeline up to date as your application moves forward.</p>
              </div>
            </div>
          )}
          <ProgressSummary milestones={a.milestones} />
          <ProgressTimeline milestones={a.milestones} />
          {returnedCount > 0 && (
            <Alert>{returnedCount} document{returnedCount === 1 ? ' was' : 's were'} returned for changes. See the reasons below and upload {returnedCount === 1 ? 'it' : 'them'} again.</Alert>
          )}
        </section>
      )}
      {s.status === 'payment_rejected' && <Alert>We couldn’t confirm your last payment{s.decision_note ? `: ${s.decision_note}` : '.'} Please check the details and upload your receipt again.</Alert>}

      {paid && (
        <section className="card panel paid-summary">
          <span className="paid-summary__icon" aria-hidden="true"><i className="fas fa-circle-check" /></span>
          <dl className="service-facts">
            <div><dt>Paid</dt><dd>{formatMoney(s.amount)}</dd></div>
            <div><dt>Method</dt><dd>{s.payment_method_display}</dd></div>
            <div><dt>Transaction ID</dt><dd>{s.transaction_id}</dd></div>
            <div><dt>Reference</dt><dd>{s.reference}</dd></div>
          </dl>
          <ReceiptButton service={s} />
        </section>
      )}

      {!paid && (
      <div className="apply-grid">
        <section className="card panel">
          <h2 className="h3"><span className="apply-step">1</span> Pay by mobile money</h2>
          <p className="muted small">Send <strong>{formatMoney(s.amount)}</strong> to one of these numbers and use <strong>{s.reference}</strong> as the reference.</p>
          <div className="pay-methods">
            {METHODS.map((m) => (
              <div key={m.id} className={`pay-method pay-method--${m.id}`}>
                <span className="pay-method__name">{m.label}</span>
                {pay[m.numberKey] ? (
                  <>
                    <span className="pay-method__number">
                      {pay[m.numberKey]}
                      <button type="button" className="icon-btn" aria-label={`Copy ${m.label} number`} onClick={() => copy(pay[m.numberKey])}><i className="far fa-copy" /></button>
                    </span>
                    {pay[m.nameKey] && <small>Account name: {pay[m.nameKey]}</small>}
                  </>
                ) : (
                  <small>Not available yet</small>
                )}
              </div>
            ))}
          </div>
          {pay.instructions && <div className="pay-instructions">{pay.instructions}</div>}
          {!pay.afrimoney_number && !pay.orange_money_number && (
            <Alert type="info">ADRAM hasn’t added its payment numbers yet. Please <Link to="/contact?subject=Application%20payment">contact us</Link> before paying.</Alert>
          )}
        </section>

        <section className="card panel">
          <h2 className="h3"><span className="apply-step">2</span> Upload your payment receipt</h2>
          {canPay ? (
            <form className="form-grid" onSubmit={submit} noValidate>
              <fieldset className="field">
                <legend className="field__label">How did you pay?</legend>
                <div className="method-choice">
                  {METHODS.map((m) => (
                    <label key={m.id} className={`method-choice__option${method === m.id ? ' is-active' : ''}`}>
                      <input type="radio" name="payment_method" value={m.id} checked={method === m.id} onChange={() => setMethod(m.id)} />
                      {m.label}
                    </label>
                  ))}
                </div>
                {errors.payment_method && <p className="field-error">{errors.payment_method}</p>}
              </fieldset>
              <div className="field">
                <label htmlFor="transaction_id">Transaction ID</label>
                <input id="transaction_id" className="input" maxLength={100} value={transactionId} aria-invalid={Boolean(errors.transaction_id)} onChange={(e) => setTransactionId(e.target.value)} placeholder="From your confirmation SMS" />
                {errors.transaction_id && <p className="field-error">{errors.transaction_id}</p>}
              </div>
              <div className="field">
                <label htmlFor="receipt">Receipt</label>
                <input id="receipt" className="input" type="file" accept={ACCEPT} aria-invalid={Boolean(errors.receipt)} onChange={(e) => setReceipt(e.target.files[0] || null)} />
                {errors.receipt ? <p className="field-error">{errors.receipt}</p> : <p className="hint">A screenshot of the confirmation SMS, a photo or a PDF (up to 10 MB).</p>}
              </div>
              {errors.form && <Alert>{errors.form}</Alert>}
              <button type="submit" className="btn btn--primary" disabled={submitting}>
                {submitting ? <span className="btn-spinner" /> : <i className="fas fa-paper-plane" />} Submit payment
              </button>
            </form>
          ) : (
            <div className="service-facts-wrap">
              <dl className="service-facts">
                <div><dt>Method</dt><dd>{s.payment_method_display}</dd></div>
                <div><dt>Transaction ID</dt><dd>{s.transaction_id}</dd></div>
                <div><dt>Submitted</dt><dd>{formatDateTime(s.payment_submitted_at)}</dd></div>
              </dl>
              <ReceiptButton service={s} />
            </div>
          )}
        </section>
      </div>
      )}

      <section className="card panel">
        <div className="panel__head">
          <h2 className="h3">{!paid && <span className="apply-step">3</span>} {paid ? 'Your documents' : 'Upload your documents'}</h2>
          <span className="panel__meta">
            {uploaded}/{a.documents.length} uploaded
            {acceptedCount > 0 && ` · ${acceptedCount} accepted`}
            {returnedCount > 0 && <span className="text-danger"> · {returnedCount} to fix</span>}
          </span>
        </div>
        <p className="muted small">PDF, photo or Word files up to 10 MB each. Only you and ADRAM’s team can see them.</p>
        <ul className="upload-list">
          {a.documents.map((d) => <DocumentUpload key={d.id} doc={d} onChanged={load} />)}
        </ul>
      </section>
    </PortalLayout>
  );
};

export default StudentApplyPage;

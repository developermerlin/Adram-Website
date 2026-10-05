import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AgreementDocument from '../../components/portal/AgreementDocument';
import AgreementPayments from '../../components/portal/AgreementPayments';
import { Spinner } from '../../components/ui/Section';
import { openPrivateFile, portalAPI, staffPortalAPI, parseApiErrors } from '../../services/api';
import { formatDateTime } from '../../utils/format';
import { fmtMoney, INPUT_TYPES, splitFee } from '../../utils/agreement';
import '../../styles/application-form.css';
import '../../styles/agreement.css';

const TONE = { pending: 'badge--amber', uploaded: 'badge--blue', signed: 'badge--green', void: 'badge--gray' };
const METHODS = ['Orange Money', 'Afrimoney', 'Bank transfer', 'Cash', 'Cheque'];
const today = () => new Date().toISOString().slice(0, 10);

/** What the admin fills in for this student: the fee and its split, the effective date and ADRAM's own details. */
const FillPanel = ({ data, busy, onSave }) => {
  const [form, setForm] = useState(() => ({
    currency: data.currency || 'NLe', amount: data.amount ? String(Number(data.amount)) : '', first_percent: String(data.first_percent),
    effective_date: data.effective_date_set || '', values: { ...data.admin_values },
  }));
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const amount = Number(String(form.amount).replace(/,/g, ''));
  const pct = Number(form.first_percent);
  const valid = form.amount !== '' && amount > 0 && pct >= 1 && pct <= 100;
  const [first, second] = valid ? splitFee(amount, pct) : [null, null];
  return (
    <div className="afp__panel">
      <div className="afp__panel-head">
        <span className="afp__panel-icon" aria-hidden="true"><i className="fas fa-pen-to-square" /></span>
        <div><h2>Fill in this agreement</h2>
          <p className="small">
            {data.own_fee
              ? <><span className="badge badge--amber">Fee set for this student</span> <button type="button" className="btn btn--text btn--sm" disabled={busy} onClick={() => onSave({ action: 'fill', use_template_fee: true })}>Use the template’s fee instead</button></>
              : <span className="badge badge--green">Fee follows the template</span>}
          </p>
          <p className="muted small">The student can sign once {data.admin_fields.some((f) => f.required) ? 'the fee and the required details are' : 'the fee is'} filled in. They are told when it is ready.</p></div>
      </div>
      <div className="agx-grid">
        <label className="field"><span className="field__label">Currency</span>
          <input className="input" value={form.currency} maxLength={12} onChange={set('currency')} /></label>
        <label className="field"><span className="field__label">Total service fee</span>
          <input className="input" inputMode="decimal" value={form.amount} placeholder="e.g. 25000" onChange={set('amount')} /></label>
        <label className="field"><span className="field__label">First payment %</span>
          <input className="input" type="number" min={1} max={100} value={form.first_percent} onChange={set('first_percent')} /></label>
      </div>
      {valid && (
        <div className="agx-split" aria-live="polite">
          <span>Total <strong>{fmtMoney(form.currency, amount)}</strong></span>
          <span>First payment {pct}% = <strong>{fmtMoney(form.currency, first)}</strong></span>
          {pct < 100 && <span>Second payment {100 - pct}% = <strong>{fmtMoney(form.currency, second)}</strong></span>}
        </div>
      )}
      <div className="agx-grid--3 agx-grid">
        <label className="field"><span className="field__label">Effective date</span>
          <input className="input" type="date" value={form.effective_date} onChange={set('effective_date')} />
          <small className="hint">Empty = the day the student signs.</small></label>
        {data.admin_fields.map((f) => (
          <label key={f.id} className="field"><span className="field__label">{f.label}{f.required && ' *'}</span>
            {f.type === 'long'
              ? <textarea className="input" rows={2} value={form.values[f.id] || ''} onChange={(e) => setForm((x) => ({ ...x, values: { ...x.values, [f.id]: e.target.value } }))} />
              : <input className="input" type={INPUT_TYPES[f.type] || 'text'} value={form.values[f.id] || ''} onChange={(e) => setForm((x) => ({ ...x, values: { ...x.values, [f.id]: e.target.value } }))} />}
          </label>
        ))}
      </div>
      <div className="afp__panel-actions">
        <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={() => onSave({ action: 'fill', ...form })}>
          <i className="fas fa-floppy-disk" /> Save
        </button>
      </div>
    </div>
  );
};

/** This student's clause text only (the template is unchanged). */
const ClausePanel = ({ data, busy, onSave }) => {
  const [clauses, setClauses] = useState(data.content.clauses);
  const update = (i, patch) => setClauses((list) => list.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  return (
    <details className="afp__panel">
      <summary>
        <strong>Change the text for this student only</strong>{' '}
        {data.own_text ? <span className="badge badge--amber">Changed for this student</span> : <span className="muted small">· now the same as the template, and it updates when you edit the template</span>}
      </summary>
      <div className="agx-clauses">
        {clauses.map((c, i) => (
          <div key={c.id || i} className="agx-clauses">
            <label className="field"><span className="field__label">Clause {i + 1}</span>
              <input className="input" value={c.title} maxLength={150} onChange={(e) => update(i, { title: e.target.value })} /></label>
            <textarea className="input" rows={Math.min(12, Math.max(3, c.body.split('\n').length + 1))} value={c.body} maxLength={6000}
              aria-label={`Clause ${i + 1} text`} onChange={(e) => update(i, { body: e.target.value })} />
          </div>
        ))}
      </div>
      <div className="afp__panel-actions">
        <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={() => onSave({ action: 'content', clauses }, 'Text saved for this student.')}><i className="fas fa-floppy-disk" /> Save text</button>
        <button type="button" className="btn btn--outline btn--sm" disabled={busy}
          onClick={() => window.confirm('Replace this agreement’s text with the current template? The fee and details you filled in are kept.') && onSave({ action: 'refresh' }, 'Agreement updated to the latest template.')}>
          <i className="fas fa-rotate" /> Use the latest template
        </button>
      </div>
    </details>
  );
};

/** Records a payment received from the student. */
const PaymentForm = ({ data, busy, onSave }) => {
  const next = data.money.installments.find((i) => i.status !== 'paid');
  const empty = { amount: '', paid_on: today(), method: '', reference: '', note: '', notify: true };
  const [form, setForm] = useState(empty);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  if (data.money.fully_paid) return null;
  return (
    <div className="afp__panel">
      <div className="afp__panel-head">
        <span className="afp__panel-icon" aria-hidden="true"><i className="fas fa-money-bill-wave" /></span>
        <div><h2>Record a payment</h2><p className="muted small">Balance {data.money.balance}{next && ` · next: ${next.label.toLowerCase()} (${next.remaining})`}.</p></div>
      </div>
      <div className="agx-grid--3 agx-grid">
        <label className="field"><span className="field__label">Amount received ({data.currency})</span>
          <input className="input" inputMode="decimal" value={form.amount} placeholder={next ? next.remaining.replace(/[^\d.,]/g, '') : ''} onChange={set('amount')} /></label>
        <label className="field"><span className="field__label">Date paid</span>
          <input className="input" type="date" value={form.paid_on} onChange={set('paid_on')} /></label>
        <label className="field"><span className="field__label">Method</span>
          <input className="input" list="agx-methods" value={form.method} maxLength={60} onChange={set('method')} />
          <datalist id="agx-methods">{METHODS.map((m) => <option key={m} value={m} />)}</datalist></label>
        <label className="field"><span className="field__label">Reference / transaction ID</span>
          <input className="input" value={form.reference} maxLength={80} onChange={set('reference')} /></label>
        <label className="field" style={{ gridColumn: 'span 2' }}><span className="field__label">Note (shown to the student)</span>
          <input className="input" value={form.note} maxLength={300} onChange={set('note')} /></label>
      </div>
      <label className="checkbox">
        <input type="checkbox" checked={form.notify} onChange={set('notify')} />
        <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span>
        <span>Email the student a receipt with their new balance</span>
      </label>
      <div className="afp__panel-actions">
        {next && <button type="button" className="btn btn--text btn--sm" onClick={() => setForm((f) => ({ ...f, amount: next.remaining.replace(/[^\d.]/g, '') }))}>Fill in the {next.label.toLowerCase()}</button>}
        <button type="button" className="btn btn--primary btn--sm" disabled={busy || !form.amount}
          onClick={async () => { if (await onSave({ action: 'add_payment', ...form }, 'Payment recorded.')) setForm(empty); }}>
          <i className="fas fa-plus" /> Record payment
        </button>
      </div>
    </div>
  );
};

/**
 * The service agreement as a printable document (Save as PDF).
 * Students: /student/applications/:id/agreement/print. Administrators: /admin/agreements/:id, with the controls.
 */
/** The signed copy the student uploaded: open the pages, then accept it or ask for it again. */
const UploadPanel = ({ data, busy, onSave }) => {
  const [note, setNote] = useState('');
  const [returning, setReturning] = useState(false);
  const checking = data.status === 'uploaded';
  return (
    <div className="afp__panel">
      <div className="afp__panel-head">
        <span className="afp__panel-icon" aria-hidden="true"><i className="fas fa-file-signature" /></span>
        <div>
          <h2>{checking ? 'Signed copy to check' : 'Signed on paper'}</h2>
          <p className="muted small">
            Uploaded {formatDateTime(data.uploaded_at)}{data.signed_ip && ` from ${data.signed_ip}`}.
            {checking ? ' Open every page, check the details, signature and date, then accept it or ask for it again.'
              : ` Accepted ${formatDateTime(data.accepted_at)}${data.accepted_by ? ` by ${data.accepted_by}` : ''}.`}
          </p>
        </div>
      </div>
      <ul className="af-files">
        {data.files.map((f) => (
          <li key={f.id}>
            <i className={`fas ${/\.pdf$/i.test(f.name) ? 'fa-file-pdf' : 'fa-file-image'}`} aria-hidden="true" />
            <span>{f.name}<small>{Math.max(1, Math.round(f.size / 1024))} KB</small></span>
            <button type="button" className="btn btn--outline btn--sm" onClick={() => openPrivateFile('agreements', f.id)}><i className="fas fa-eye" /> Open</button>
          </li>
        ))}
      </ul>
      {checking && (returning ? (
        <>
          <label className="field"><span className="field__label">What should the student fix?</span>
            <textarea className="input" rows={3} maxLength={500} value={note} placeholder="e.g. Page 8 is not signed, and the date is missing." onChange={(e) => setNote(e.target.value)} /></label>
          <div className="afp__panel-actions">
            <button type="button" className="btn btn--primary btn--sm" disabled={busy || !note.trim()} onClick={() => onSave({ action: 'return_upload', note }, 'Sent back to the student.')}><i className="fas fa-rotate-left" /> Send back to the student</button>
            <button type="button" className="btn btn--text btn--sm" onClick={() => setReturning(false)}>Cancel</button>
          </div>
        </>
      ) : (
        <div className="afp__panel-actions">
          <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={() => onSave({ action: 'accept_upload' }, 'Accepted: the agreement is signed.')}><i className="fas fa-circle-check" /> Accept: the agreement is signed</button>
          <button type="button" className="btn btn--outline btn--sm" disabled={busy} onClick={() => setReturning(true)}><i className="fas fa-rotate-left" /> Ask for it again</button>
        </div>
      ))}
    </div>
  );
};

export const AgreementPrintPage = ({ staff = false }) => {
  const { id } = useParams();
  const [params] = useSearchParams();
  const paper = !staff && params.get('paper') === '1';
  const [data, setData] = useState(null);
  const [version, setVersion] = useState(0);
  const [failed, setFailed] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (staff ? staffPortalAPI.agreement(id) : portalAPI.agreement(id))
      .then(({ data: d }) => setData(d))
      .catch((err) => setFailed(parseApiErrors(err).detail || 'This agreement could not be opened.'));
  }, [id, staff]);

  useEffect(() => {
    if (!data) return undefined;
    const before = document.title;
    const who = (data.student_details?.full_name || data.student?.name || '').replace(/[^\w ]+/g, '').trim().replace(/\s+/g, '-');
    document.title = `ADRAM-service-agreement-${data.reference}-${paper ? 'to-sign' : who}`;
    return () => { document.title = before; };
  }, [data, paper]);

  if (failed) return <main className="afp"><p className="afp__msg">{failed} <Link to={staff ? '/admin/agreements' : `/student/applications/${id}/apply`}>Go back</Link></p></main>;
  if (!data) return <Spinner label="Preparing the agreement…" />;

  const act = async (payload, message = 'Agreement updated.') => {
    setBusy(true);
    try {
      const { data: d } = await staffPortalAPI.agreementAction(id, payload);
      setData(d);
      setVersion((v) => v + 1); // the panels start again from what was saved
      toast.success(message);
      return true;
    } catch (err) {
      toast.error(err.response?.data?.detail || parseApiErrors(err).detail || 'Could not update the agreement.');
      return false;
    } finally {
      setBusy(false);
    }
  };
  const voidIt = () => {
    const reason = window.prompt('Why are you cancelling this agreement? (The student will no longer see it.)', '');
    if (reason !== null) act({ action: 'void', reason }, 'Agreement cancelled.');
  };
  const pending = data.status === 'pending';
  const todo = staff ? [...(pending ? data.missing : []), ...data.blanks] : [];
  const fixedInTemplate = staff && pending && data.blanks.length > data.template_blanks.length;

  return (
    <main className="afp">
      <div className="afp__tools">
        <Link to={staff ? '/admin/agreements' : `/student/applications/${id}/agreement`} className="btn btn--outline btn--sm"><i className="fas fa-arrow-left" /> Back</Link>
        {staff && <span className={`badge ${TONE[data.status]}`}>{data.status_display}</span>}
        <span className="afp__spacer" />
        {staff && pending && (
          <button type="button" className="btn btn--outline btn--sm" disabled={busy || !data.ready} title={data.ready ? '' : 'Fill in the agreement first'}
            onClick={() => act({ action: 'remind' }, `Reminder sent to ${data.student.email}.`)}><i className="fas fa-bell" /> Remind</button>
        )}
        {staff && data.status !== 'void' && <button type="button" className="btn btn--text btn--sm text-danger" disabled={busy} onClick={voidIt}>Cancel agreement</button>}
        {staff && data.status === 'void' && (
          <button type="button" className="btn btn--outline btn--sm" disabled={busy} onClick={() => act({ action: 'reissue' }, 'A new agreement was sent to the student.')}><i className="fas fa-paper-plane" /> Send again</button>
        )}
        <button type="button" className="btn btn--primary btn--sm" onClick={() => window.print()}><i className="fas fa-file-arrow-down" /> Download PDF</button>
      </div>

      {todo.length > 0 && (
        <div className="afp__panel agx-todo" role="status">
          <strong><i className="fas fa-triangle-exclamation" aria-hidden="true" /> Still blank in this agreement</strong>
          <ul>{todo.map((t) => <li key={t}>{t}</li>)}</ul>
          {data.blanks.length > 0 && (
            <small>
              Company details, signature and stamp come from the <Link to="/admin/agreements?tab=template" target="_blank">agreement template</Link>
              {pending ? (fixedInTemplate ? ', which now has more of them filled in: use “Use the latest template” below.' : '. Fill them in there, then use “Use the latest template” below.') : '.'}
            </small>
          )}
        </div>
      )}
      {staff && pending && data.return_note && <p className="afp__msg">Sent back to the student: {data.return_note}</p>}
      {staff && data.files.length > 0 && (data.status === 'uploaded' || data.paper_signed) && <UploadPanel data={data} busy={busy} onSave={act} />}
      {staff && pending && <FillPanel key={`fill-${version}`} data={data} busy={busy} onSave={(p) => act(p, 'Agreement saved. The student sees the new details.')} />}
      {staff && pending && <ClausePanel key={`text-${version}`} data={data} busy={busy} onSave={act} />}
      {staff && pending && <p className="afp__hint">Sent {formatDateTime(data.issued_at)}{data.reminded_at && ` · reminded ${formatDateTime(data.reminded_at)}`}. Everything above can change until the student signs.</p>}

      {staff && data.status === 'signed' && (
        <p className="afp__msg afp__msg--ok"><i className="fas fa-circle-check" aria-hidden="true" /> {data.paper_signed ? 'Signed on paper, uploaded' : 'Signed online'} {formatDateTime(data.signed_at)} from {data.signed_ip || 'an unknown address'} · {data.signed_user_agent?.slice(0, 80)}</p>
      )}
      {staff && data.status === 'signed' && (
        <div className="afp__paper-wide">
          <AgreementPayments money={data.money} payments={data.payments} busy={busy}
            onDelete={(p) => act({ action: 'delete_payment', payment_id: p.id }, 'Payment deleted.')} />
          {data.money.total
            ? <PaymentForm key={`pay-${version}`} data={data} busy={busy} onSave={act} />
            : <p className="afp__msg">This agreement was signed without a service fee, so payments can’t be recorded against it. Cancel it and send a new one with the fee filled in.</p>}
        </div>
      )}
      {staff && data.status === 'void' && data.void_reason && <p className="afp__msg">Cancelled: {data.void_reason}</p>}
      {paper && <p className="afp__hint"><strong>Print this agreement, fill in your details by hand, sign and date it at the end</strong>, then scan or photograph every page and upload it on your agreement page.</p>}
      <p className="afp__hint">In the print window choose <strong>Save as PDF</strong> as the printer to download a PDF copy.</p>
      <div className="afp__paper"><AgreementDocument data={data} paper={paper} /></div>
    </main>
  );
};

export default AgreementPrintPage;

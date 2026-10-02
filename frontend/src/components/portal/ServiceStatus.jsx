import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { openPrivateFile } from '../../services/api';
import { formatDate, formatDateTime, formatMoney } from '../../utils/format';
import { ProgressSummary, ProgressTimeline } from './Progress';
import { ResultBanner } from './Result';
import { resultState } from '../../utils/applicationStages';

// Steps of the "ADRAM applies for you" service, as the student sees them.
const STEPS = [
  { id: 'requested', label: 'Request sent' },
  { id: 'approved', label: 'Guidelines ready' },
  { id: 'terms', label: 'Terms accepted' },
  { id: 'payment_submitted', label: 'Payment & documents' },
  { id: 'paid', label: 'Confirmed' },
];

const stepIndex = (service) => {
  if (service.status === 'paid') return 4;
  if (service.status === 'payment_submitted') return 3;
  if (service.terms_accepted_at) return 2;
  if (service.unlocked) return 1;
  return 0;
};

const ServiceSteps = ({ service }) => {
  const current = stepIndex(service);
  return (
    <ol className="service-steps">
      {STEPS.map((s, i) => (
        <li key={s.id} className={i < current || service.status === 'paid' ? 'is-done' : i === current ? 'is-current' : ''}>
          {s.label}
        </li>
      ))}
    </ol>
  );
};

const openFile = (kind, id) => openPrivateFile(kind, id).catch(() => toast.error('Could not open the file.'));

export const ReceiptButton = ({ service }) =>
  service.has_receipt ? (
    <button type="button" className="btn btn--outline btn--sm" onClick={() => openFile('receipts', service.id)}>
      <i className="fas fa-receipt" /> View receipt{service.receipt_name ? ` (${service.receipt_name})` : ''}
    </button>
  ) : null;

// Plain-text terms laid out as a document: "1. Heading" lines become headings, "1.2 …" lines numbered clauses.
const TermsDocument = ({ text }) => (
  <>
    {text.split('\n').map((line, i) => {
      const trimmed = line.trim();
      if (!trimmed) return null;
      const heading = trimmed.match(/^(\d+)\.\s+(.+)$/);
      if (heading) return <h3 key={i} className="terms-doc__heading">{heading[1]}. {heading[2]}</h3>;
      const clause = trimmed.match(/^(\d+\.\d+)\s+(.+)$/);
      if (clause) return <p key={i} className="terms-doc__clause"><span>{clause[1]}</span>{clause[2]}</p>;
      if (i < 3) return <p key={i} className={i === 0 ? 'terms-doc__org' : 'terms-doc__meta'}>{trimmed}</p>;
      return <p key={i}>{trimmed}</p>;
    })}
  </>
);

/** Terms dialog: the student scrolls to the end and ticks "I agree" before continuing to payment. */
const TermsDialog = ({ terms, onAccept, onClose }) => {
  const [agreed, setAgreed] = useState(false);
  const [readToEnd, setReadToEnd] = useState(false);
  const [busy, setBusy] = useState(false);

  // Short terms that fit without scrolling count as read.
  const measure = (el) => {
    if (el && el.scrollHeight <= el.clientHeight + 8) setReadToEnd(true);
  };
  const onScroll = (e) => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setReadToEnd(true);
  };

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="terms-title">
      <button type="button" className="modal__backdrop" aria-label="Close" onClick={onClose} />
      <div className="modal__card modal__card--wide">
        <h2 id="terms-title">Terms and conditions</h2>
        {terms ? (
          <div className="terms-text terms-doc" ref={measure} onScroll={onScroll} tabIndex={0} aria-label="Terms and conditions text">
            <TermsDocument text={terms} />
          </div>
        ) : (
          <div className="terms-text">ADRAM hasn’t published its terms yet. Please contact us before paying.</div>
        )}
        {terms && !readToEnd && <p className="terms-hint"><i className="fas fa-arrow-down" /> Scroll to the end to continue</p>}
        <label className="checkbox">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} disabled={!terms || !readToEnd} />
          <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span>
          <span>I have read and agree to the terms and conditions</span>
        </label>
        <div className="modal__actions">
          <button type="button" className="btn btn--outline" onClick={onClose} disabled={busy}>Cancel</button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!agreed || busy}
            onClick={async () => {
              setBusy(true);
              await onAccept();
              setBusy(false);
            }}
          >
            {busy ? <span className="btn-spinner" /> : <i className="fas fa-arrow-right" />} Proceed with the application
          </button>
        </div>
      </div>
    </div>
  );
};

/** What the student sees once they've asked ADRAM to apply. */
export const StudentServicePanel = ({ application: a, onAcceptTerms, onRequestAgain }) => {
  const navigate = useNavigate();
  const [showTerms, setShowTerms] = useState(false);
  const s = a.service;
  const info = a.scholarship_info || {};
  const applyPath = `/student/applications/${a.id}/apply`;

  if (s.status === 'requested') {
    return (
      <div className="service-panel service-panel--wait">
        <ServiceSteps service={s} />
        <p className="service-panel__title"><i className="fas fa-hourglass-half" /> ADRAM is reviewing your request</p>
        <p>You asked us to apply for you on {formatDateTime(s.requested_at)}. We’ll email you and unlock your guidelines here once it’s approved.</p>
      </div>
    );
  }

  if (s.status === 'declined') {
    return (
      <div className="service-panel service-panel--declined">
        <p className="service-panel__title"><i className="fas fa-circle-xmark" /> ADRAM can’t take on this application</p>
        {s.decision_note && <p><strong>Message from ADRAM:</strong> {s.decision_note}</p>}
        <div className="service-panel__actions">
          <button type="button" className="btn btn--outline btn--sm" onClick={onRequestAgain}>Ask again</button>
          <Link to="/contact?subject=Scholarship%20consultation" className="btn btn--text btn--sm">Contact us</Link>
        </div>
      </div>
    );
  }

  const returned = a.documents.filter((d) => d.review_status === 'returned').length;

  if (s.status === 'paid') {
    const result = resultState(a.stage);
    return (
      <div className={`service-panel service-panel--progress${result ? ` service-panel--${result.key}` : ''}`}>
        {result ? (
          <ResultBanner application={a} />
        ) : (
          <p className="service-panel__title"><i className="fas fa-person-running" /> Your application is in progress</p>
        )}
        <ProgressSummary milestones={a.milestones} />
        {result?.key !== 'awarded' && result?.key !== 'unsuccessful' && <ProgressTimeline milestones={a.milestones} compact />}
        {returned > 0 && (
          <p className="service-panel__alert">
            <i className="fas fa-rotate-left" /> {returned} document{returned === 1 ? ' was' : 's were'} returned for changes. Please re-upload {returned === 1 ? 'it' : 'them'}.
          </p>
        )}
        <div className="service-panel__actions">
          <Link to={applyPath} className="btn btn--primary btn--sm"><i className="fas fa-route" /> View full progress &amp; documents</Link>
        </div>
      </div>
    );
  }

  if (s.status === 'payment_submitted') {
    return (
      <div className="service-panel service-panel--wait">
        <ServiceSteps service={s} />
        <p className="service-panel__title"><i className="fas fa-magnifying-glass-dollar" /> Payment submitted: we’re checking it</p>
        <p>
          {formatMoney(s.amount)} by {s.payment_method_display} (transaction {s.transaction_id}{s.payer ? `, paid by ${s.payer}` : ''}, reference {s.reference}), sent {formatDateTime(s.payment_submitted_at)}.
        </p>
        <div className="service-panel__actions">
          <Link to={applyPath} className="btn btn--outline btn--sm"><i className="fas fa-folder-open" /> My payment &amp; documents</Link>
        </div>
      </div>
    );
  }

  // approved or payment_rejected: the guidelines are unlocked.
  return (
    <div className="service-panel service-panel--guide">
      <ServiceSteps service={s} />
      {s.status === 'payment_rejected' && (
        <p className="service-panel__alert">
          <i className="fas fa-triangle-exclamation" /> We couldn’t confirm your last payment{s.decision_note ? `: ${s.decision_note}` : '.'} Please upload your receipt again.
        </p>
      )}
      <p className="service-panel__title"><i className="fas fa-book-open" /> Your application guidelines</p>
      <dl className="service-facts">
        <div><dt>Application fee</dt><dd>{formatMoney(s.amount)}</dd></div>
        <div><dt>Payment reference</dt><dd>{s.reference}</dd></div>
        {info.service_cutoff && <div><dt>Send everything by</dt><dd>{formatDate(`${info.service_cutoff}T00:00`)}</dd></div>}
      </dl>
      {s.guidelines && <div className="service-panel__guidelines">{s.guidelines}</div>}
      <div className="service-offer__cols">
        {info.service_includes?.length > 0 && (
          <div>
            <h5>What ADRAM does</h5>
            <ul className="service-offer__list">{info.service_includes.map((x) => <li key={x}><i className="fas fa-check" /> {x}</li>)}</ul>
          </div>
        )}
        <div>
          <h5>Documents you’ll upload</h5>
          <ul className="service-offer__list service-offer__list--need">{a.documents.map((d) => <li key={d.id}><i className="far fa-file-lines" /> {d.name}</li>)}</ul>
        </div>
      </div>
      <div className="service-panel__actions">
        {s.terms_accepted_at ? (
          <Link to={applyPath} className="btn btn--primary btn--sm"><i className="fas fa-arrow-right" /> Continue to payment &amp; documents</Link>
        ) : (
          <button type="button" className="btn btn--primary btn--sm" onClick={() => setShowTerms(true)}>
            <i className="fas fa-file-contract" /> Read terms &amp; conditions
          </button>
        )}
      </div>
      {showTerms && (
        <TermsDialog
          terms={s.payment?.terms}
          onClose={() => setShowTerms(false)}
          onAccept={async () => {
            if (await onAcceptTerms(a.id)) navigate(applyPath);
          }}
        />
      )}
    </div>
  );
};

/** Admin controls: approve (amount + guidelines) or decline, then confirm or reject the payment. */
export const StaffServicePanel = ({ application: a, onDecide }) => {
  const s = a.service;
  const suggested = (a.scholarship_info?.service_fee || '').replace(/[^\d.]/g, '');
  const [amount, setAmount] = useState(s.amount ?? suggested);
  const [guidelines, setGuidelines] = useState(s.guidelines || a.scholarship_info?.service_note || '');
  const [note, setNote] = useState('');
  const [mode, setMode] = useState(null); // 'decline' | 'reject' while writing a reason
  const [busy, setBusy] = useState(false);

  const decide = async (payload) => {
    setBusy(true);
    const ok = await onDecide(a.id, payload);
    setBusy(false);
    if (ok) {
      setMode(null);
      setNote('');
    }
  };

  const reasonBox = (label, action, confirm) => (
    <div className="service-review__reason">
      <label htmlFor={`reason-${a.id}`}>{label} <span className="optional">(emailed to the student)</span></label>
      <textarea id={`reason-${a.id}`} className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="service-panel__actions">
        <button type="button" className="btn btn--danger btn--sm" disabled={busy} onClick={() => decide({ action, note })}>{confirm}</button>
        <button type="button" className="btn btn--text btn--sm" onClick={() => setMode(null)}>Cancel</button>
      </div>
    </div>
  );

  return (
    <div className={`service-panel service-review service-review--${s.status}`}>
      <p className="service-panel__title">
        <i className="fas fa-handshake-angle" /> ADRAM applying: {s.status_display}
        <span className="service-review__ref">{s.reference}</span>
      </p>
      <p className="muted small">Requested {formatDateTime(s.requested_at)}{s.terms_accepted_at ? ` · terms accepted ${formatDateTime(s.terms_accepted_at)}` : ''}</p>

      {(s.status === 'requested' || s.status === 'declined' || s.status === 'approved') && (
        <div className="service-review__form">
          <div className="form-row">
            <div className="field">
              <label htmlFor={`amount-${a.id}`}>Amount to pay (NLe)</label>
              <input id={`amount-${a.id}`} className="input" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 1500" />
            </div>
          </div>
          <div className="field">
            <label htmlFor={`guide-${a.id}`}>Guidelines for this student</label>
            <textarea id={`guide-${a.id}`} className="input" rows={3} value={guidelines} onChange={(e) => setGuidelines(e.target.value)} placeholder="What happens next, what to prepare, how long it takes…" />
          </div>
          {mode === 'decline' ? reasonBox('Reason for declining', 'decline', 'Decline request') : (
            <div className="service-panel__actions">
              <button type="button" className="btn btn--success btn--sm" disabled={busy || amount === ''} onClick={() => decide({ action: 'approve', amount, guidelines })}>
                <i className="fas fa-unlock" /> {s.status === 'approved' ? 'Update and re-send guidelines' : 'Approve and share guidelines'}
              </button>
              {s.status !== 'declined' && <button type="button" className="btn btn--text btn--sm text-danger" onClick={() => setMode('decline')}>Decline</button>}
            </div>
          )}
        </div>
      )}

      {(s.status === 'payment_submitted' || s.status === 'payment_rejected' || s.status === 'paid') && (
        <div className="service-review__payment">
          <dl className="service-facts">
            <div><dt>Amount</dt><dd>{formatMoney(s.amount)}</dd></div>
            <div><dt>Method</dt><dd>{s.payment_method_display || '—'}</dd></div>
            <div><dt>Transaction ID</dt><dd>{s.transaction_id || '—'}</dd></div>
            {s.payer && <div><dt>{s.payment_method === 'card' ? 'Name on card' : 'Paid from'}</dt><dd>{s.payer}</dd></div>}
            <div><dt>Submitted</dt><dd>{formatDateTime(s.payment_submitted_at)}</dd></div>
          </dl>
          {s.status === 'payment_rejected' && s.decision_note && <p className="muted small">Your note: {s.decision_note}</p>}
          <div className="service-panel__actions">
            <ReceiptButton service={s} />
            {s.status !== 'paid' && mode !== 'reject' && (
              <button type="button" className="btn btn--success btn--sm" disabled={busy} onClick={() => decide({ action: 'confirm_payment' })}>
                <i className="fas fa-circle-check" /> Confirm payment
              </button>
            )}
            {s.status === 'payment_submitted' && mode !== 'reject' && (
              <button type="button" className="btn btn--text btn--sm text-danger" onClick={() => setMode('reject')}>Payment not received</button>
            )}
          </div>
          {mode === 'reject' && reasonBox('What’s wrong with the payment?', 'reject_payment', 'Ask the student to upload again')}
          {s.status === 'paid' && <p className="muted small">Confirmed {formatDateTime(s.verified_at)}.</p>}
        </div>
      )}
    </div>
  );
};

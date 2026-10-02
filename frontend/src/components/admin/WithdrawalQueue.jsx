import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { lmsAdminAPI, parseApiErrors } from '../../services/api';
import { formatDateTime } from '../../utils/format';
import { money } from '../lms/courseUtils';
import NoteDialog from '../lms/NoteDialog';
import { Alert, TextField } from '../ui/Form';
import '../../styles/withdrawals.css';

const TONE = { requested: 'badge--amber', paid: 'badge--green', rejected: 'badge--red', cancelled: 'badge--gray' };
const REASONS = [
  'The name on the account doesn’t match your legal name. Please check your details and ask again.',
  'We couldn’t reach this number or account. Please check it and ask again.',
  'This amount includes a sale that is being refunded. Please ask again for the remaining balance.',
];

/** After sending the money: the transfer reference, so it's recorded as a payout and the instructor is told. */
const PayDialog = ({ request, onClose, onDone }) => {
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await lmsAdminAPI.payWithdrawal(request.id, { reference, note });
      toast.success('Recorded as paid. The instructor has been told.');
      onDone();
    } catch (err) {
      const parsed = parseApiErrors(err);
      setError(parsed.reference || parsed.form || 'That didn’t work.');
      setBusy(false);
    }
  };
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="wd-pay-title">
      <button type="button" className="modal__backdrop" aria-label="Close" onClick={onClose} />
      <form className="modal__card" onSubmit={submit}>
        <h2 id="wd-pay-title" className="h3">Mark as paid</h2>
        <p className="muted">
          Send <strong>{money(request.amount)}</strong> by {request.method_label} to <strong>{request.account}</strong> ({request.account_name}
          {request.bank_name ? `, ${request.bank_name}` : ''}), then enter the transfer reference.
        </p>
        <TextField label="Transfer reference / transaction ID" name="reference" value={reference} onChange={(e) => setReference(e.target.value)} />
        <TextField label={<>Note to the instructor <span className="optional">(optional)</span></>} name="note" value={note} onChange={(e) => setNote(e.target.value)} />
        <Alert>{error}</Alert>
        <div className="modal__actions">
          <button type="button" className="btn btn--outline" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn--primary" disabled={busy || !reference.trim()}>{busy && <span className="btn-spinner" />} Mark as paid</button>
        </div>
      </form>
    </div>
  );
};

/** Admin → Orders & coupons → Earnings & payouts: instructors' withdrawal requests to pay or reject. */
const WithdrawalQueue = ({ onChanged }) => {
  const [status, setStatus] = useState('requested');
  const [data, setData] = useState(null);
  const [paying, setPaying] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const load = useCallback(() => lmsAdminAPI.withdrawals(status).then(({ data: d }) => setData(d)).catch(() => setData({ results: [], waiting: 0 })), [status]);
  useEffect(() => {
    load();
  }, [load]);
  const done = () => {
    setPaying(null);
    setRejecting(null);
    load();
    onChanged?.();
  };

  return (
    <section className="card table-card">
      <div className="table-card__head">
        <div>
          <h2 className="h3">Withdrawal requests {data?.waiting > 0 && <span className="badge badge--amber">{data.waiting} waiting</span>}</h2>
          <p className="muted small">Instructors ask to be paid their available earnings. Send the money, then mark it as paid.</p>
        </div>
        <select className="input wd-filter" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Show">
          <option value="requested">Waiting</option><option value="paid">Paid</option><option value="rejected">Rejected</option><option value="all">All</option>
        </select>
      </div>
      {!data ? <div className="skeleton skeleton--block" /> : data.results.length === 0 ? (
        <p className="muted la-empty">{status === 'requested' ? 'No requests waiting.' : 'Nothing here yet.'}</p>
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead><tr><th>Instructor</th><th>Amount</th><th>Pay to</th><th>Asked</th><th>Status</th><th /></tr></thead>
            <tbody>
              {data.results.map((r) => (
                <tr key={r.id}>
                  <td className="wd-queue__who">
                    <strong>{r.instructor.name}</strong>
                    <small className="muted">{r.instructor.legal_name ? `Legal name: ${r.instructor.legal_name}` : 'No legal name'}{r.instructor.tax_id ? ` · TIN ${r.instructor.tax_id}` : ''}</small>
                    <small className="muted">Available {money(r.balance.available)} · on hold {money(r.balance.on_hold)}</small>
                  </td>
                  <td><strong>{money(r.amount)}</strong></td>
                  <td>{r.method_label} · <span className="la-mono">{r.account}</span><br /><small className="muted">{r.account_name}{r.bank_name ? `, ${r.bank_name}` : ''}</small>{r.note && <small className="muted"><br />“{r.note}”</small>}</td>
                  <td>{formatDateTime(r.created_at)}</td>
                  <td>
                    <span className={`badge ${TONE[r.status]}`}>{r.status_display}</span>
                    {r.reference && <small className="muted"><br />ref. {r.reference}</small>}
                    {r.decided_by && <small className="muted"><br />by {r.decided_by}</small>}
                  </td>
                  <td>
                    {r.status === 'requested' && (
                      <span className="wd-queue__actions">
                        <button type="button" className="btn btn--primary btn--sm" onClick={() => setPaying(r)}>Mark as paid</button>
                        <button type="button" className="btn btn--outline btn--sm" onClick={() => setRejecting(r)}>Reject</button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {paying && <PayDialog request={paying} onClose={() => setPaying(null)} onDone={done} />}
      {rejecting && (
        <NoteDialog title="Reject this withdrawal" text={`${money(rejecting.amount)} for ${rejecting.instructor.name}. They’ll see your reason and can ask again.`}
          label="Reason" required confirm="Reject" tone="danger" suggestions={REASONS}
          onConfirm={async (reason) => {
            try {
              await lmsAdminAPI.rejectWithdrawal(rejecting.id, reason);
              toast.success('Request rejected. The instructor has been told.');
              done();
            } catch (err) {
              throw new Error(parseApiErrors(err).reason || 'That didn’t work.', { cause: err });
            }
          }}
          onClose={() => setRejecting(null)} />
      )}
    </section>
  );
};

export default WithdrawalQueue;

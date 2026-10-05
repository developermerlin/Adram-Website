import { formatDate } from '../../utils/format';

const STATUS = { paid: ['Paid', 'badge--green'], part: ['Part paid', 'badge--amber'], unpaid: ['Not paid yet', 'badge--gray'] };

/**
 * The service fee, both instalments, what has been paid and the balance, and each payment received.
 * Students see it on their agreement; administrators also get a delete button per payment (`onDelete`).
 */
export const AgreementPayments = ({ money, payments = [], title = 'Service fee and payments', onDelete, busy = false }) => {
  if (!money?.total) return null;
  return (
    <section className="card agp" aria-label={title}>
      <div className="agp__head">
        <h3>{title}</h3>
        {money.fully_paid && <span className="badge badge--green"><i className="fas fa-circle-check" /> Paid in full</span>}
      </div>
      <div className="agp__tiles">
        <div><span>Total service fee</span><strong>{money.total}</strong></div>
        <div className="is-green"><span>Paid</span><strong>{money.paid}</strong></div>
        <div className={money.fully_paid ? '' : 'is-amber'}><span>Balance</span><strong>{money.balance}</strong></div>
      </div>
      <div className="agp__bar" role="progressbar" aria-valuenow={money.paid_percent} aria-valuemin={0} aria-valuemax={100} aria-label={`${money.paid_percent}% paid`}>
        <span style={{ width: `${Math.min(100, money.paid_percent)}%` }} />
      </div>
      <p className="agp__pct muted small">{money.paid_percent}% paid · {100 - Math.min(100, money.paid_percent)}% outstanding</p>
      <ul className="agp__parts">
        {money.installments.map((i) => (
          <li key={i.key}>
            <div>
              <strong>{i.label} · {i.percent}%</strong>
              <small>{i.due}</small>
            </div>
            <div className="agp__part-amounts">
              <strong>{i.amount}</strong>
              <small>{i.status === 'part' ? `${i.paid} paid · ${i.remaining} left` : i.status === 'paid' ? 'Settled' : `${i.remaining} to pay`}</small>
            </div>
            <span className={`badge ${STATUS[i.status][1]}`}>{STATUS[i.status][0]}</span>
          </li>
        ))}
      </ul>
      {payments.length > 0 && (
        <div className="table-scroll">
          <table className="table agp__table">
            <thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th>{onDelete && <th><span className="sr-only">Actions</span></th>}</tr></thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{formatDate(`${p.paid_on}T00:00`)}</td>
                  <td><strong>{p.amount}</strong>{p.note && <small>{p.note}</small>}</td>
                  <td>{p.method || '—'}</td>
                  <td>{p.reference || '—'}</td>
                  {onDelete && (
                    <td><button type="button" className="btn btn--text btn--sm text-danger" disabled={busy} aria-label={`Delete payment of ${p.amount}`}
                      onClick={() => window.confirm(`Delete the payment of ${p.amount}? The balance goes back up.`) && onDelete(p)}><i className="fas fa-trash-can" /></button></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

export default AgreementPayments;

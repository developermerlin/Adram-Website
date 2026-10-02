import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { instructorAPI, parseApiErrors } from '../../services/api';
import { formatDate } from '../../utils/format';
import { money } from '../lms/courseUtils';
import { Alert, TextField } from '../ui/Form';
import '../../styles/withdrawals.css';

const BLANK = { amount: '', method: 'orange_money', account: '', account_name: '', bank_name: '', note: '' };
const TONE = { requested: 'badge--amber', paid: 'badge--green', rejected: 'badge--red', cancelled: 'badge--gray' };

/** Tax details: ADRAM needs at least a legal name before paying an instructor. */
const TaxInfo = ({ onSaved }) => {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    instructorAPI.taxInfo().then(({ data }) => live && setForm(data)).catch(() => live && setForm({ legal_name: '', tax_id: '', tax_address: '' }));
    return () => {
      live = false;
    };
  }, []);
  if (!form) return null;
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await instructorAPI.saveTaxInfo(form);
      setForm(data);
      toast.success('Tax details saved');
      onSaved();
    } catch {
      toast.error('Your tax details could not be saved.');
    } finally {
      setBusy(false);
    }
  };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <form className="card panel wd-tax" onSubmit={save}>
      <h2 className="h3">Tax details</h2>
      <p className="muted small">Private: only ADRAM’s administrators see these, for payments and your yearly statement.</p>
      <TextField label="Legal name" name="legal_name" maxLength={150} value={form.legal_name} onChange={set('legal_name')} hint="As on your ID. Needed before your first withdrawal." />
      <div className="form-row">
        <TextField label={<>Tax ID (TIN / NIN) <span className="optional">(optional)</span></>} name="tax_id" maxLength={60} value={form.tax_id} onChange={set('tax_id')} />
        <TextField label={<>Address <span className="optional">(optional)</span></>} name="tax_address" maxLength={300} value={form.tax_address} onChange={set('tax_address')} />
      </div>
      <div><button type="submit" className="btn btn--outline btn--sm" disabled={busy}>{busy && <span className="btn-spinner" />} Save tax details</button></div>
    </form>
  );
};

/** Instructor earnings → Withdraw: available balance, ask to be paid, past requests, and the yearly sales report. */
const WithdrawalsPanel = () => {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());
  const load = useCallback(() => instructorAPI.withdrawals().then(({ data: d }) => setData(d)).catch(() => setData(null)), []);
  useEffect(() => {
    load();
  }, [load]);

  const b = data?.balance;
  const waiting = data?.requests.find((r) => r.status === 'requested');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await instructorAPI.requestWithdrawal(form);
      toast.success('Request sent. ADRAM will pay you and let you know.');
      setForm(BLANK);
      setErrors({});
      load();
    } catch (err) {
      setErrors(parseApiErrors(err));
    } finally {
      setBusy(false);
    }
  };
  const cancel = async (id) => {
    try {
      await instructorAPI.cancelWithdrawal(id);
      toast.success('Request cancelled');
      load();
    } catch {
      toast.error('That request could not be cancelled.');
    }
  };
  const report = async () => {
    try {
      const { data: blob } = await instructorAPI.earningsReport(year);
      const url = URL.createObjectURL(blob);
      Object.assign(document.createElement('a'), { href: url, download: `adram-earnings-${year}.csv` }).click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('The report could not be downloaded.');
    }
  };
  const years = Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - i);

  return (
    <section className="wd">
      <div className="wd-grid">
        <div className="card panel wd-balance">
          <h2 className="h3">Withdraw your earnings</h2>
          <div className="wd-balance__figures">
            <div className="is-main"><span>Available now</span><strong>{b ? money(b.available) : '…'}</strong></div>
            <div><span>On hold</span><strong>{b ? money(b.on_hold) : '…'}</strong><small>Sales from the last {b?.hold_days ?? 14} days, in case of refunds</small></div>
            <div><span>Requested</span><strong>{b ? money(b.requested) : '…'}</strong></div>
          </div>
          {waiting ? (
            <Alert type="info">Your request for {money(waiting.amount)} is waiting for ADRAM. You’ll be notified when it’s paid.</Alert>
          ) : (
            <form className="wd-form" onSubmit={submit} noValidate>
              <div className="form-row">
                <div className="field">
                  <label htmlFor="wd-amount">Amount (NLe)</label>
                  <div className="wd-amount">
                    <input id="wd-amount" className="input" inputMode="decimal" value={form.amount} onChange={set('amount')} placeholder={b ? `Up to ${Number(b.available).toLocaleString()}` : ''} aria-invalid={Boolean(errors.amount)} />
                    {b && Number(b.available) > 0 && <button type="button" className="btn btn--text btn--sm" onClick={() => setForm((f) => ({ ...f, amount: b.available }))}>All</button>}
                  </div>
                  {errors.amount ? <p className="field-error">{errors.amount}</p> : b && <p className="hint">Minimum {money(b.min_withdrawal)}</p>}
                </div>
                <div className="field">
                  <label htmlFor="wd-method">Pay me by</label>
                  <select id="wd-method" className="input" value={form.method} onChange={set('method')}>
                    {(data?.methods || []).map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <TextField label={form.method === 'bank' ? 'Account number' : 'Phone number'} name="account" value={form.account} error={errors.account} onChange={set('account')} />
                <TextField label="Name on the account" name="account_name" value={form.account_name} error={errors.account_name} onChange={set('account_name')} />
              </div>
              {form.method === 'bank' && <TextField label="Bank" name="bank_name" value={form.bank_name} error={errors.bank_name} onChange={set('bank_name')} />}
              <TextField label={<>Note <span className="optional">(optional)</span></>} name="note" maxLength={300} value={form.note} onChange={set('note')} />
              <Alert>{errors.form}</Alert>
              <div><button type="submit" className="btn btn--primary" disabled={busy || !form.amount}>{busy && <span className="btn-spinner" />} Request withdrawal</button></div>
            </form>
          )}
        </div>
        <div className="stack-lg">
          <TaxInfo onSaved={load} />
          <div className="card panel wd-report">
            <h2 className="h3">Sales report</h2>
            <p className="muted small">Every sale with the commission and your share, plus payouts, as a spreadsheet (CSV).</p>
            <div className="wd-report__row">
              <select className="input" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Year">{years.map((y) => <option key={y}>{y}</option>)}</select>
              <button type="button" className="btn btn--outline btn--sm" onClick={report}><i className="fas fa-file-csv" /> Download</button>
            </div>
          </div>
        </div>
      </div>

      {data?.requests.length > 0 && (
        <section className="card table-card">
          <div className="table-card__head"><div><h2 className="h3">My withdrawal requests</h2></div></div>
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Asked</th><th>Amount</th><th>To</th><th>Status</th><th /></tr></thead>
              <tbody>
                {data.requests.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDate(r.created_at)}</td>
                    <td><strong>{money(r.amount)}</strong></td>
                    <td>{r.method_label} · {r.account}<br /><small className="muted">{r.account_name}{r.bank_name ? `, ${r.bank_name}` : ''}</small></td>
                    <td>
                      <span className={`badge ${TONE[r.status]}`}>{r.status_display}</span>
                      {r.reference && <small className="muted"> ref. {r.reference}</small>}
                      {r.status === 'rejected' && r.admin_note && <small className="wd-reason">{r.admin_note}</small>}
                    </td>
                    <td>{r.status === 'requested' && <button type="button" className="btn btn--text btn--sm" onClick={() => cancel(r.id)}>Cancel</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </section>
  );
};

export default WithdrawalsPanel;

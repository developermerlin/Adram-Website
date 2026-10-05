import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { newsletterAPI, parseApiErrors } from '../../services/api';
import { formatDate } from '../../utils/format';

const STATUS = [
  ['', 'All'],
  ['subscribed', 'Subscribed'],
  ['pending', 'Waiting for confirmation'],
  ['unsubscribed', 'Unsubscribed'],
];
const TONE = { subscribed: 'badge--green', pending: 'badge--amber', unsubscribed: 'badge--gray' };

/** Adding one person, or pasting a list, both need the admin to confirm those people agreed to receive it. */
const AddPanel = ({ onDone, onClose }) => {
  const [mode, setMode] = useState('one');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'one') {
        await newsletterAPI.addSubscriber({ email, name });
        toast.success(`${email} added.`);
      } else {
        const { data } = await newsletterAPI.importSubscribers(text);
        toast.success(data.detail);
      }
      onDone();
    } catch (err) {
      const errs = parseApiErrors(err);
      setError(errs.email || errs.detail || errs.form || 'Could not add. Please check and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card panel nl-add" onSubmit={save}>
      <div className="nl-section-head">
        <h3 className="h4">Add subscribers</h3>
        <button type="button" className="btn btn--text btn--sm" onClick={onClose}>Close</button>
      </div>
      <div className="nl-seg" role="tablist" aria-label="How to add">
        <button type="button" role="tab" aria-selected={mode === 'one'} className={mode === 'one' ? 'is-active' : ''} onClick={() => setMode('one')}>One person</button>
        <button type="button" role="tab" aria-selected={mode === 'list'} className={mode === 'list' ? 'is-active' : ''} onClick={() => setMode('list')}>Paste a list</button>
      </div>
      {mode === 'one' ? (
        <div className="form-row">
          <label className="field"><span className="field__label">Email address</span>
            <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label className="field"><span className="field__label">Name (optional)</span>
            <input className="input" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></label>
        </div>
      ) : (
        <label className="field"><span className="field__label">Email addresses</span>
          <textarea className="input" rows={6} value={text} onChange={(e) => setText(e.target.value)}
            placeholder={'One per line, for example:\nama@example.com\nbob@example.com, Bob Cole\nCara Jones <cara@example.com>'} />
          <small className="hint">Paste from Excel or Google Sheets (email in the first column, name in the second). Addresses already on the list are skipped.</small>
        </label>
      )}
      <label className="checkbox">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span>
        <span>{mode === 'one' ? 'This person agreed' : 'These people agreed'} to receive the ADRAM newsletter
          <small>They are added as subscribed without a confirmation email. Only add people who asked for it.</small></span>
      </label>
      {error && <p className="nl-error" role="alert">{error}</p>}
      <div>
        <button type="submit" className="btn btn--primary btn--sm" disabled={busy || !consent || (mode === 'one' ? !email.trim() : !text.trim())}>
          {busy && <span className="btn-spinner" />} {mode === 'one' ? 'Add subscriber' : 'Add these people'}
        </button>
      </div>
    </form>
  );
};

/** The subscriber list: search, filter, add, export, unsubscribe and remove. */
export const NewsletterSubscribers = ({ onChange }) => {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(query.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const load = useCallback(() => newsletterAPI.subscribers({ q: search || undefined, status: status || undefined, page })
    .then(({ data: d }) => { setData(d); onChange?.(); }).catch(() => toast.error('Could not load subscribers.')), [search, status, page, onChange]);
  useEffect(() => {
    load();
  }, [load]);

  const exportCsv = async () => {
    try {
      const { data: blob } = await newsletterAPI.exportSubscribers({ q: search || undefined, status: status || undefined });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `newsletter-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Could not export.');
    }
  };

  const change = async (sub, next) => {
    try {
      await newsletterAPI.updateSubscriber(sub.id, { status: next });
      toast.success(next === 'unsubscribed' ? `${sub.email} unsubscribed.` : `${sub.email} subscribed again.`);
      load();
    } catch {
      toast.error('Could not change it.');
    }
  };

  const remove = async (sub) => {
    if (!window.confirm(`Remove ${sub.email} from the list completely? Their history is deleted too.`)) return;
    try {
      await newsletterAPI.removeSubscriber(sub.id);
      toast.success(`${sub.email} removed.`);
      load();
    } catch {
      toast.error('Could not remove.');
    }
  };

  return (
    <div className="nl-subs">
      {adding && <AddPanel onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); }} />}

      <section className="card table-card">
        <div className="nl-toolbar">
          <div className="nl-search">
            <i className="fas fa-magnifying-glass" aria-hidden="true" />
            <input className="input" type="search" placeholder="Search by email or name" aria-label="Search subscribers"
              value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="nl-filters" role="tablist" aria-label="Filter by status">
            {STATUS.map(([id, label]) => (
              <button key={id || 'all'} type="button" role="tab" aria-selected={status === id} className={`nl-filter${status === id ? ' is-active' : ''}`}
                onClick={() => { setStatus(id); setPage(1); }}>
                {label}{data && id && <span className="nl-filter__count">{data.counts[id]}</span>}
              </button>
            ))}
          </div>
          <div className="nl-toolbar__actions">
            <button type="button" className="btn btn--outline btn--sm" onClick={exportCsv}><i className="fas fa-file-arrow-down" /> Export CSV</button>
            <button type="button" className="btn btn--primary btn--sm" onClick={() => setAdding(true)}><i className="fas fa-user-plus" /> Add subscribers</button>
          </div>
        </div>

        {!data ? <p className="muted nl-pad">Loading…</p> : data.results.length === 0 ? (
          <div className="nl-empty">
            <i className="fas fa-inbox" aria-hidden="true" />
            <p>{search || status ? 'No subscribers match.' : 'No subscribers yet. People who sign up in the website footer appear here.'}</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="table nl-table">
              <thead><tr><th>Email</th><th>Name</th><th>Status</th><th>Source</th><th>Signed up</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {data.results.map((s) => (
                  <tr key={s.id}>
                    <td className="nl-table__email">{s.email}</td>
                    <td>{s.name || <span className="muted">—</span>}</td>
                    <td><span className={`badge ${TONE[s.status]}`}>{s.status_display}</span></td>
                    <td className="muted">{s.source_display}</td>
                    <td>{formatDate(s.created_at)}</td>
                    <td className="nl-table__actions">
                      {s.status === 'unsubscribed'
                        ? <button type="button" className="btn btn--text btn--sm" onClick={() => change(s, 'subscribed')}>Resubscribe</button>
                        : <button type="button" className="btn btn--text btn--sm" onClick={() => change(s, 'unsubscribed')}>Unsubscribe</button>}
                      <button type="button" className="btn btn--text btn--sm nl-danger" aria-label={`Remove ${s.email}`} title="Remove" onClick={() => remove(s)}>
                        <i className="fas fa-trash-can" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.pages > 1 && (
          <div className="nl-pager">
            <span className="muted small">{data.count} people · page {data.page} of {data.pages}</span>
            <div>
              <button type="button" className="btn btn--outline btn--sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <button type="button" className="btn btn--outline btn--sm" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default NewsletterSubscribers;

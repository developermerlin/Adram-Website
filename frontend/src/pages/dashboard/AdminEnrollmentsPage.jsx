import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { lmsAdminAPI, parseApiErrors } from '../../services/api';
import { formatDate, formatDateTime, timeAgo } from '../../utils/format';
import PortalLayout from '../../components/layout/PortalLayout';
import { Alert, TextField } from '../../components/ui/Form';

const TABS = [
  ['requested', 'Waiting', 'fa-bell'],
  ['active', 'Enrolled', 'fa-user-check'],
  ['completed', 'Completed', 'fa-flag-checkered'],
  ['declined', 'Not accepted', 'fa-user-xmark'],
  ['cancelled', 'Cancelled', 'fa-ban'],
  ['all', 'All', 'fa-list'],
];
const TONE = { requested: 'badge--amber', active: 'badge--green', completed: 'badge--blue', declined: 'badge--red', cancelled: 'badge--gray' };

/** Confirm or decline: an optional start date and a message the student sees in their portal and email. */
const DecisionDialog = ({ decision, rows, onClose, onDone }) => {
  const confirm = decision === 'confirm';
  const [note, setNote] = useState('');
  const [start, setStart] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await lmsAdminAPI.decideEnrollments({ ids: rows.map((r) => r.id), decision, note, ...(confirm && start ? { start_date: start } : {}) });
      toast.success(confirm ? `${rows.length === 1 ? 'Place' : `${rows.length} places`} confirmed. The student${rows.length === 1 ? ' has' : 's have'} been told.`
        : `${rows.length === 1 ? 'Request' : `${rows.length} requests`} declined. The student${rows.length === 1 ? ' has' : 's have'} been told.`);
      onDone();
    } catch (err) {
      const parsed = parseApiErrors(err);
      setError(parsed.start_date || parsed.form || 'That didn’t work. Please try again.');
      setBusy(false);
    }
  };

  const who = rows.length === 1 ? `${rows[0].student.name} on ${rows[0].course.title}` : `${rows.length} students`;
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="decide-title">
      <button type="button" className="modal__backdrop" aria-label="Close" onClick={() => !busy && onClose()} />
      <form className="modal__card" onSubmit={submit}>
        <h2 id="decide-title" className="h3">{confirm ? 'Confirm enrollment' : 'Decline the request'}</h2>
        <p className="muted">
          {confirm ? `Confirm ${who}. They get every lesson straight away and are told in their portal and by email.`
            : `Decline ${who}. They are told in their portal and by email, and can ask again later.`}
        </p>
        {confirm && <TextField label={<>Start date <span className="optional">(optional)</span></>} type="date" name="start_date" value={start} onChange={(e) => setStart(e.target.value)} />}
        <div className="field">
          <label htmlFor="decide-note">{confirm ? 'Message to the student' : 'Reason'} <span className="optional">(optional)</span></label>
          <textarea id="decide-note" className="input" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder={confirm ? 'e.g. Classes are on Monday and Wednesday evenings. Bring a laptop.' : 'e.g. This intake is full. Please ask again for the next one.'} />
        </div>
        <Alert>{error}</Alert>
        <div className="modal__actions">
          <button type="button" className="btn btn--outline" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className={`btn ${confirm ? 'btn--primary' : 'btn--danger'}`} disabled={busy}>
            {busy && <span className="btn-spinner" />} {confirm ? 'Confirm' : 'Decline'}{rows.length > 1 ? ` ${rows.length}` : ''}
          </button>
        </div>
      </form>
    </div>
  );
};

/** Admin → Enrollments: students who asked to join a course "by approval", and everyone already on one. */
export const AdminEnrollmentsPage = () => {
  const [tab, setTab] = useState('requested');
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState([]);
  const [dialog, setDialog] = useState(null); // {decision, rows}

  const load = useCallback(() => lmsAdminAPI.enrollments({ status: tab, q: q || undefined })
    .then(({ data: d }) => { setData(d); setError(''); })
    .catch(() => setError('Enrollments could not be loaded. Refresh the page to try again.')), [tab, q]);
  useEffect(() => {
    const t = setTimeout(load, 250); // wait for typing to pause
    return () => clearTimeout(t);
  }, [load]);

  const rows = data?.results || [];
  const waiting = tab === 'requested';
  const chosen = rows.filter((r) => picked.includes(r.id));
  const pickTab = (next) => {
    setTab(next);
    setPicked([]);
  };
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const done = () => {
    setDialog(null);
    setPicked([]);
    load();
  };

  return (
    <PortalLayout title="Enrollments" subtitle="Confirm or decline students who asked to join a course. They see your decision in their portal straight away.">
      <div className="tabs" role="tablist" aria-label="Enrollments by status">
        {TABS.map(([id, label, icon]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={`tabs__tab${tab === id ? ' is-active' : ''}${id === 'requested' && data?.counts.requested ? ' has-alert' : ''}`} onClick={() => pickTab(id)}>
            <i className={`fas ${icon}`} /> {label}
            {id !== 'all' && data && <span className="tabs__count">{data.counts[id] || 0}</span>}
          </button>
        ))}
      </div>

      <section className="card table-card">
        <div className="table-card__head">
          <div className="table-card__filters">
            <div className="input-icon ae-search">
              <i className="fas fa-magnifying-glass" aria-hidden="true" />
              <input type="search" className="input" placeholder="Search student or course" aria-label="Search enrollments" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
          {waiting && chosen.length > 0 ? (
            <span className="action-row">
              <span className="muted small">{chosen.length} selected</span>
              <button type="button" className="btn btn--primary btn--sm" onClick={() => setDialog({ decision: 'confirm', rows: chosen })}><i className="fas fa-check" /> Confirm {chosen.length}</button>
              <button type="button" className="btn btn--outline btn--sm" onClick={() => setDialog({ decision: 'decline', rows: chosen })}><i className="fas fa-xmark" /> Decline {chosen.length}</button>
            </span>
          ) : <span className="muted small">{data ? `${rows.length} shown` : 'Loading…'}</span>}
        </div>
        {error && <Alert>{error}</Alert>}

        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                {waiting && (
                  <th className="table__check">
                    <input type="checkbox" aria-label="Select all" checked={rows.length > 0 && chosen.length === rows.length} onChange={(e) => setPicked(e.target.checked ? rows.map((r) => r.id) : [])} />
                  </th>
                )}
                <th>Student</th>
                <th>Course</th>
                <th>{waiting ? 'Asked' : 'Status'}</th>
                <th>{waiting ? 'Waiting' : 'Decision'}</th>
                <th className="table__actions">Actions</th>
              </tr>
            </thead>
            <tbody className={data ? '' : 'is-loading'}>
              {data && rows.length === 0 && (
                <tr><td colSpan={waiting ? 6 : 5} className="table__empty"><i className="fas fa-user-check" /> {waiting ? 'No one is waiting. New requests appear here.' : 'Nothing here yet.'}</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id}>
                  {waiting && <td className="table__check"><input type="checkbox" aria-label={`Select ${r.student.name}`} checked={picked.includes(r.id)} onChange={() => toggle(r.id)} /></td>}
                  <td>
                    <Link to={`/admin/students/${r.student.id}`} className="title-cell">
                      <strong>{r.student.name}</strong>
                      <small>{r.student.email}{r.student.phone ? ` · ${r.student.phone}` : ''}</small>
                    </Link>
                  </td>
                  <td><Link to={`/courses/${r.course.slug}`} target="_blank" rel="noreferrer">{r.course.title}</Link></td>
                  <td>
                    {waiting ? formatDateTime(r.created_at) : <span className={`badge ${TONE[r.status] || 'badge--gray'}`}>{r.status_display}</span>}
                  </td>
                  <td>
                    {waiting ? timeAgo(r.created_at) : (
                      <div className="cell-stack">
                        {r.decided_at ? <span>{r.decided_by ? `${r.decided_by}, ` : ''}{formatDate(r.decided_at)}</span> : <span className="muted">Enrolled {formatDate(r.created_at)}</span>}
                        {r.start_date && <small>Starts {formatDate(`${r.start_date}T00:00`)}</small>}
                        {r.note && <small title={r.note}>“{r.note.length > 60 ? `${r.note.slice(0, 60)}…` : r.note}”</small>}
                      </div>
                    )}
                  </td>
                  <td className="table__actions">
                    <span className="action-row">
                      {['requested', 'declined'].includes(r.status) && (
                        <button type="button" className="btn btn--primary btn--sm" onClick={() => setDialog({ decision: 'confirm', rows: [r] })}><i className="fas fa-check" /> Confirm</button>
                      )}
                      {r.status === 'requested' && (
                        <button type="button" className="btn btn--outline btn--sm" onClick={() => setDialog({ decision: 'decline', rows: [r] })}><i className="fas fa-xmark" /> Decline</button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="muted small">Courses set to <strong>Open</strong> enrol students straight away; only courses set to <strong>By approval</strong> (in the course’s editor, under Publishing) send requests here.</p>

      {dialog && <DecisionDialog decision={dialog.decision} rows={dialog.rows} onClose={() => setDialog(null)} onDone={done} />}
    </PortalLayout>
  );
};

export default AdminEnrollmentsPage;

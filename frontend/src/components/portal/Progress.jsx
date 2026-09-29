import { useState } from 'react';
import { formatDate } from '../../utils/format';
import { daysUntil, RETURN_TAGS, reviewState } from '../../utils/applicationStages';

const fmtDay = (date) => formatDate(`${date}T00:00`);
const ICON = { done: 'fa-check', in_progress: 'fa-spinner', todo: '' };

/** "Your application is in progress": the admin's milestones as a timeline for the student. */
export const ProgressTimeline = ({ milestones, compact = false }) => {
  if (!milestones?.length) return <p className="muted">ADRAM will add your application timeline here shortly.</p>;
  const shown = compact ? milestones.filter((m, i) => m.status !== 'done' || i === milestones.length - 1).slice(0, 2) : milestones;
  return (
    <ol className={`progress-line${compact ? ' progress-line--compact' : ''}`}>
      {shown.map((m) => {
        const days = m.status !== 'done' ? daysUntil(m.due_date) : null;
        return (
          <li key={m.id} className={`progress-line__item is-${m.status}`}>
            <span className="progress-line__dot" aria-hidden="true">{ICON[m.status] && <i className={`fas ${ICON[m.status]}`} />}</span>
            <div>
              <div className="progress-line__head">
                <strong>{m.title}</strong>
                <span className={`progress-line__status is-${m.status}`}>{m.status_display}</span>
              </div>
              <span className="progress-line__when">
                {m.status === 'done' && m.completed_at && <>Completed {formatDate(m.completed_at)}</>}
                {m.status !== 'done' && m.due_date && (
                  <>Target {fmtDay(m.due_date)}{days !== null && days >= 0 && <em> · in {days} day{days === 1 ? '' : 's'}</em>}</>
                )}
              </span>
              {m.note && !compact && <p className="progress-line__note">{m.note}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
};

export const ProgressSummary = ({ milestones }) => {
  const total = milestones?.length || 0;
  const done = milestones?.filter((m) => m.status === 'done').length || 0;
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="progress-summary">
      <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Application progress">
        <span style={{ width: `${pct}%` }} />
      </div>
      <span>{done} of {total} steps complete</span>
    </div>
  );
};

/** Staff: edit the student's timeline (status, target date, note), add, remove and reorder steps. */
export const MilestoneEditor = ({ application: a, api }) => {
  const [title, setTitle] = useState('');
  const [editing, setEditing] = useState(null); // milestone id whose date/note is open
  const ms = a.milestones || [];

  const move = (i, step) => {
    const ids = ms.map((m) => m.id);
    [ids[i], ids[i + step]] = [ids[i + step], ids[i]];
    api.reorder(a.id, ids);
  };

  return (
    <div className="milestone-editor">
      <h4>Progress timeline <span className="muted small">(the student sees this)</span></h4>
      <ol>
        {ms.map((m, i) => (
          <li key={m.id} className={`milestone-editor__row is-${m.status}`}>
            <div className="milestone-editor__main">
              <strong>{m.title}</strong>
              <span className="muted small">
                {m.due_date ? `Target ${fmtDay(m.due_date)}` : 'No target date'}{m.note ? ' · note added' : ''}
              </span>
            </div>
            <select className="input input--sm" aria-label={`Status of ${m.title}`} value={m.status} onChange={(e) => api.update(m.id, { status: e.target.value })}>
              <option value="todo">To do</option>
              <option value="in_progress">In progress</option>
              <option value="done">Done</option>
            </select>
            <span className="list-editor__tools">
              <button type="button" className="icon-btn" aria-label="Edit date and note" aria-expanded={editing === m.id} onClick={() => setEditing(editing === m.id ? null : m.id)}><i className="fas fa-pen" /></button>
              <button type="button" className="icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><i className="fas fa-arrow-up" /></button>
              <button type="button" className="icon-btn" aria-label="Move down" disabled={i === ms.length - 1} onClick={() => move(i, 1)}><i className="fas fa-arrow-down" /></button>
              <button type="button" className="icon-btn icon-btn--danger" aria-label={`Remove ${m.title}`} onClick={() => api.remove(m.id)}><i className="fas fa-xmark" /></button>
            </span>
            {editing === m.id && <MilestoneDetails milestone={m} onSave={async (patch) => { await api.update(m.id, patch); setEditing(null); }} />}
          </li>
        ))}
      </ol>
      <form
        className="doc-list__add"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim()) return;
          await api.add(a.id, { title: title.trim() });
          setTitle('');
        }}
      >
        <input className="input" maxLength={150} placeholder="Add a step, e.g. Interview practice" aria-label="New step" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button type="submit" className="btn btn--outline btn--sm" disabled={!title.trim()}><i className="fas fa-plus" /> Add step</button>
      </form>
    </div>
  );
};

const MilestoneDetails = ({ milestone: m, onSave }) => {
  const [form, setForm] = useState({ title: m.title, due_date: m.due_date || '', note: m.note || '' });
  return (
    <div className="milestone-editor__details">
      <div className="form-row">
        <div className="field">
          <label htmlFor={`ms-title-${m.id}`}>Step</label>
          <input id={`ms-title-${m.id}`} className="input" maxLength={150} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
        </div>
        <div className="field">
          <label htmlFor={`ms-date-${m.id}`}>Target date</label>
          <input id={`ms-date-${m.id}`} className="input" type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} />
        </div>
      </div>
      <div className="field">
        <label htmlFor={`ms-note-${m.id}`}>Note for the student <span className="optional">(optional)</span></label>
        <input id={`ms-note-${m.id}`} className="input" maxLength={500} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="e.g. We’ll email you the first essay draft by Friday." />
      </div>
      <button type="button" className="btn btn--primary btn--sm" disabled={!form.title.trim()} onClick={() => onSave({ ...form, title: form.title.trim(), due_date: form.due_date || null })}>
        Save step
      </button>
    </div>
  );
};

const STATE_BADGE = {
  accepted: { cls: 'badge--green', icon: 'fa-circle-check', label: 'Accepted' },
  returned: { cls: 'badge--red', icon: 'fa-rotate-left', label: 'Returned' },
  in_review: { cls: 'badge--amber', icon: 'fa-hourglass-half', label: 'Waiting for review' },
  resubmitted: { cls: 'badge--amber', icon: 'fa-hourglass-half', label: 'Re-uploaded: waiting for review' },
  missing: { cls: 'badge--gray', icon: 'fa-file', label: 'Not uploaded' },
};

export const ReviewBadge = ({ doc }) => {
  const b = STATE_BADGE[reviewState(doc)];
  return <span className={`badge ${b.cls}`}><i className={`fas ${b.icon}`} /> {b.label}</span>;
};

/** The reason a document was returned, shown to the student and the admin. */
export const ReturnReason = ({ doc }) =>
  doc.review_status === 'returned' ? (
    <p className="return-reason">
      <span className="return-reason__tag"><i className="fas fa-tag" /> {doc.review_tag_display}</span>
      {doc.review_note && <span>{doc.review_note}</span>}
    </p>
  ) : null;

/** Staff: accept or return one uploaded document. */
export const DocumentReview = ({ doc, onReview }) => {
  const [returning, setReturning] = useState(false);
  const [tag, setTag] = useState('');
  const [note, setNote] = useState('');
  const state = reviewState(doc);
  if (!doc.has_file) return null;

  if (returning) {
    return (
      <div className="doc-review__form">
        <select className="input input--sm" aria-label="Reason" value={tag} onChange={(e) => setTag(e.target.value)}>
          <option value="" disabled>Why is it being returned?</option>
          {RETURN_TAGS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <input className="input input--sm" maxLength={500} placeholder="What should the student change?" aria-label="Note for the student" value={note} onChange={(e) => setNote(e.target.value)} />
        <button type="button" className="btn btn--danger btn--sm" disabled={!tag} onClick={async () => { if (await onReview(doc.id, { status: 'returned', tag, note })) setReturning(false); }}>
          Return to student
        </button>
        <button type="button" className="btn btn--text btn--sm" onClick={() => setReturning(false)}>Cancel</button>
      </div>
    );
  }
  return (
    <span className="doc-review__actions">
      {state !== 'accepted' && (
        <button type="button" className="btn btn--success btn--sm" onClick={() => onReview(doc.id, { status: 'accepted' })}><i className="fas fa-check" /> Accept</button>
      )}
      {state !== 'returned' && (
        <button type="button" className="btn btn--outline btn--sm" onClick={() => setReturning(true)}><i className="fas fa-rotate-left" /> Return</button>
      )}
      {(state === 'accepted' || state === 'returned') && (
        <button type="button" className="btn btn--text btn--sm" onClick={() => onReview(doc.id, { status: 'pending' })}>Undo</button>
      )}
    </span>
  );
};

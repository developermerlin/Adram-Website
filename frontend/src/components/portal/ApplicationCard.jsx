import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDate, timeAgo } from '../../utils/format';
import { daysUntil, isClosed, PATH, resultState, STAGES, stageMeta } from '../../utils/applicationStages';
import Flag from '../ui/Flag';
import { KeyDatesTimeline } from '../ui/KeyDates';
import ServiceOffer from './ServiceOffer';
import { StaffServicePanel, StudentServicePanel } from './ServiceStatus';
import { DocumentReview, MilestoneEditor, ReturnReason, ReviewBadge } from './Progress';
import { ResultBanner, ResultEditor } from './Result';
import { openPrivateFile } from '../../services/api';
import toast from 'react-hot-toast';

export const StageBadge = ({ stage }) => {
  const meta = stageMeta(stage);
  return <span className={`badge badge--${meta.tone}`}><i className={`fas ${meta.icon}`} /> {meta.label}</span>;
};

export const DeadlineTag = ({ date, closed }) => {
  const days = daysUntil(date);
  if (days === null) return <span className="deadline deadline--none"><i className="far fa-calendar" /> No deadline set</span>;
  const tone = closed || days > 30 ? '' : days < 0 ? ' deadline--past' : days <= 14 ? ' deadline--soon' : '';
  const when = days < 0 ? 'passed' : days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
  return (
    <span className={`deadline${tone}`}>
      <i className="far fa-calendar" /> {formatDate(`${date}T00:00`)}{!closed && <small> · {when}</small>}
    </span>
  );
};

// Five-step progress along the normal path; an early end (unsuccessful / withdrawn) is shown on its own.
const StageTrack = ({ stage }) => {
  const index = PATH.findIndex((s) => s.id === stage);
  if (index === -1) return null;
  const result = resultState(stage);
  return (
    <ol className={`stage-track${result ? ` stage-track--${result.key}` : ''}`} aria-label={`Stage ${index + 1} of ${PATH.length}: ${stageMeta(stage).label}`}>
      {PATH.map((s, i) => (
        <li key={s.id} className={i < index ? 'is-done' : i === index ? 'is-current' : ''}>
          <span className="stage-track__dot" aria-hidden="true">{i < index ? <i className="fas fa-check" /> : i + 1}</span>
          <span className="stage-track__label">{s.label}</span>
        </li>
      ))}
    </ol>
  );
};

/**
 * One tracked application. Students and staff can change the stage and deadline and work the
 * documents checklist; only staff (`staff`) write the next step and the counsellor's note.
 * `actions`: { update(patch), addDocument(name), updateDocument(id, patch), removeDocument(id), remove? }
 */
export const ApplicationCard = ({ application: a, actions, staff = false, defaultOpen = false }) => {
  // Uploaded documents ADRAM hasn't reviewed yet (only on "ADRAM applies for you" applications).
  const toCheck = a.service ? a.documents.filter((d) => d.has_file && !d.review_status).length : 0;
  const [open, setOpen] = useState(defaultOpen || (staff && toCheck > 0));
  const [newDoc, setNewDoc] = useState('');
  // Advice written for an earlier stage is out of date: start from blank (the student sees the standard message).
  const currentAdvice = () => ({
    next_step: a.current_next_step || '',
    counsellor_note: a.advice_stage === a.stage ? a.counsellor_note : '',
  });
  const [advice, setAdvice] = useState(currentAdvice);
  const [lastSaved, setLastSaved] = useState(a.updated_at);
  // Refresh the editable advice when the saved application changes (after a reload).
  if (lastSaved !== a.updated_at) {
    setLastSaved(a.updated_at);
    setAdvice(currentAdvice());
  }

  const done = a.documents.filter((d) => d.is_done).length;
  const total = a.documents.length;
  const closed = isClosed(a.stage);
  const saved = currentAdvice();
  const adviceChanged = advice.next_step !== saved.next_step || advice.counsellor_note !== saved.counsellor_note;
  const outcome = resultState(a.stage);

  const addDoc = async (e) => {
    e.preventDefault();
    if (!newDoc.trim()) return;
    await actions.addDocument(a.id, newDoc.trim());
    setNewDoc('');
  };

  return (
    <article id={`application-${a.id}`} className={`app-card${closed ? ' is-closed' : ''}`}>
      <header className="app-card__head">
        <div className="app-card__title">
          {a.country && <Flag code={a.country} size={28} />}
          <div>
            <h3>
              {a.scholarship_slug ? <Link to={`/scholarships/${a.scholarship_slug}`}>{a.scholarship_name}</Link> : a.scholarship_name}
            </h3>
            <span className="app-card__meta">
              <DeadlineTag date={a.deadline} closed={closed} />
              <span><i className="fas fa-file-circle-check" /> {done}/{total} documents</span>
              {staff && toCheck > 0 && <span className="badge badge--amber"><i className="fas fa-magnifying-glass" /> {toCheck} to review</span>}
            </span>
          </div>
        </div>
        <StageBadge stage={a.stage} />
      </header>

      <StageTrack stage={a.stage} />

      {/* "ADRAM applies for you": the offer while the student is deciding, then each step of the request. */}
      {a.service ? (
        staff ? (
          <>
            <StaffServicePanel application={a} onDecide={actions.decideService} />
            {a.service.status === 'paid' && actions.milestones && <MilestoneEditor application={a} api={actions.milestones} />}
            {a.service.status === 'paid' && <ResultEditor application={a} onSave={actions.update} files={actions.resultFiles} />}
          </>
        ) : (
          <StudentServicePanel application={a} onAcceptTerms={actions.acceptTerms} onRequestAgain={() => actions.requestService(a.id)} />
        )
      ) : (
        a.scholarship_info && !closed && !staff && a.stage === 'interested' && (
          <ServiceOffer
            info={a.scholarship_info}
            action={
              actions.requestService && (
                <button type="button" className="btn btn--primary btn--sm" onClick={() => actions.requestService(a.id)}>
                  <i className="fas fa-handshake-angle" /> Ask ADRAM to apply for me
                </button>
              )
            }
          />
        )
      )}

      {/* Applications the student tracks alone: the result shows here (with ADRAM it's in the progress panel). */}
      {!a.service && (staff ? <ResultEditor application={a} onSave={actions.update} files={actions.resultFiles} /> : <ResultBanner application={a} />)}

      {/* Follows the outcome: ADRAM's note for the current stage, or the standard message for it. */}
      {(a.current_next_step || a.counsellor_message) && !staff && (
        <div className={`app-card__advice${outcome ? ` app-card__advice--${outcome.key}` : ''}`}>
          {a.current_next_step && <p><strong><i className="fas fa-arrow-right" /> Next step:</strong> {a.current_next_step}</p>}
          {a.counsellor_message && <p><strong><i className="fas fa-comment-dots" /> From your counsellor:</strong> {a.counsellor_message}</p>}
        </div>
      )}

      <button type="button" className="app-card__toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? 'Hide details' : 'Update stage, deadline & documents'} <i className={`fas fa-chevron-${open ? 'up' : 'down'}`} />
      </button>

      {open && (
        <div className="app-card__body">
          <div className="form-row">
            <div className="field">
              <label htmlFor={`stage-${a.id}`}>Stage</label>
              <select id={`stage-${a.id}`} className="input" value={a.stage} disabled={!staff && Boolean(a.service)} onChange={(e) => actions.update(a.id, { stage: e.target.value })}>
                {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              {!staff && a.service && <p className="hint">ADRAM updates the stage while it handles your application.</p>}
            </div>
            <div className="field">
              <label htmlFor={`deadline-${a.id}`}>Deadline</label>
              <input id={`deadline-${a.id}`} type="date" className="input" value={a.deadline || ''} onChange={(e) => actions.update(a.id, { deadline: e.target.value || null })} />
            </div>
          </div>

          {staff && (
            <div className="app-card__staff">
              <div className="field">
                <label htmlFor={`next-${a.id}`}>Next step <span className="optional">(shown to the student)</span></label>
                <input id={`next-${a.id}`} className="input" maxLength={300} value={advice.next_step} placeholder="e.g. Book your IELTS test before 15 March" onChange={(e) => setAdvice((v) => ({ ...v, next_step: e.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor={`note-${a.id}`}>Counsellor’s note for the “{a.stage_display}” stage <span className="optional">(shown to the student)</span></label>
                <textarea id={`note-${a.id}`} className="input" rows={3} value={advice.counsellor_note} placeholder={a.counsellor_message || 'Advice or feedback for the student'} onChange={(e) => setAdvice((v) => ({ ...v, counsellor_note: e.target.value }))} />
                <p className="hint">Leave blank to show the standard message (shown greyed above). When the stage changes, this note is replaced by the new outcome’s message.</p>
              </div>
              <button type="button" className="btn btn--primary btn--sm" disabled={!adviceChanged} onClick={() => actions.update(a.id, advice)}>
                <i className="fas fa-floppy-disk" /> Save advice
              </button>
            </div>
          )}

          {a.scholarship_info && (
            <div className="app-card__dates">
              <h4>Key dates</h4>
              <KeyDatesTimeline scholarship={a.scholarship_info} />
            </div>
          )}

          <div className="doc-list">
            <h4>Documents checklist</h4>
            <div className="progress" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={total} aria-label="Documents ready">
              <span style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
            </div>
            <ul>
              {a.documents.map((d) => (
                <li key={d.id} className={`${d.is_done ? 'is-done' : ''}${d.review_status === 'returned' ? ' is-returned' : ''}`}>
                  <div className="doc-list__main">
                    <label className="checkbox">
                      <input type="checkbox" checked={d.is_done} disabled={Boolean(a.service && d.has_file)} onChange={() => actions.updateDocument(d.id, { is_done: !d.is_done })} />
                      <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span>
                      <span>{d.name}</span>
                    </label>
                    {a.service && (d.has_file || d.review_status) && <ReviewBadge doc={d} />}
                    <ReturnReason doc={d} />
                    {staff && a.service && <DocumentReview doc={d} onReview={actions.reviewDocument} />}
                    {!staff && d.review_status === 'returned' && (
                      <Link to={`/student/applications/${a.id}/apply`} className="btn btn--primary btn--sm doc-list__reupload"><i className="fas fa-upload" /> Re-upload</Link>
                    )}
                  </div>
                  {d.has_file && (
                    <button type="button" className="btn btn--text btn--sm doc-list__file" title={d.file_name} onClick={() => openPrivateFile('documents', d.id).catch(() => toast.error('Could not open the file.'))}>
                      <i className="fas fa-paperclip" /> View file
                    </button>
                  )}
                  <button type="button" className="icon-btn icon-btn--danger" aria-label={`Remove ${d.name}`} onClick={() => actions.removeDocument(d.id)}>
                    <i className="fas fa-xmark" />
                  </button>
                </li>
              ))}
            </ul>
            <form className="doc-list__add" onSubmit={addDoc}>
              <input className="input" maxLength={200} placeholder="Add a document, e.g. Birth certificate" aria-label="New document" value={newDoc} onChange={(e) => setNewDoc(e.target.value)} />
              <button type="submit" className="btn btn--outline btn--sm" disabled={!newDoc.trim()}><i className="fas fa-plus" /> Add</button>
            </form>
          </div>

          <footer className="app-card__foot">
            <span className="muted small">
              Updated {timeAgo(a.updated_at)}{a.updated_by_name ? ` by ${a.updated_by_name}` : ''}
            </span>
            {actions.remove && (
              <button type="button" className="btn btn--text btn--sm text-danger" onClick={() => actions.remove(a)}>
                <i className="fas fa-trash-can" /> Remove application
              </button>
            )}
          </footer>
        </div>
      )}
    </article>
  );
};

export default ApplicationCard;

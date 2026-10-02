import { useState } from 'react';
import { lmsAPI, parseApiErrors } from '../../services/api';
import { Alert } from '../ui/Form';
import { StatusPill } from './Price';
import { assetUrl } from '../../utils/assets';
import { formatDateTime } from '../../utils/format';
import { formatSize, paragraphs } from '../../utils/lms';
import '../../styles/assignments.css';
import { PeerReviewBox } from './PeerReviewBox';

const TONE = { submitted: 'processing', approved: 'successful', rejected: 'failed' };

/** "in 2 days", "in 5 hours", "3 hours ago" */
const relative = (iso, now) => {
  const minutes = Math.round((new Date(iso) - now) / 60000);
  const abs = Math.abs(minutes);
  const [n, unit] = abs >= 2880 ? [Math.round(abs / 1440), 'day'] : abs >= 120 ? [Math.round(abs / 60), 'hour'] : [Math.max(1, abs), 'minute'];
  const text = `${n} ${unit}${n === 1 ? '' : 's'}`;
  return minutes >= 0 ? `in ${text}` : `${text} ago`;
};

/** The deadline, how late work is treated, and how long is left. */
export const Deadline = ({ info }) => {
  const [now] = useState(() => Date.now());
  if (!info.due_at) return null;
  const tone = info.closed ? 'is-closed' : info.overdue ? 'is-late' : (new Date(info.due_at) - now) < 86400000 ? 'is-soon' : '';
  return (
    <div className={`asg-due ${tone}`} role="status">
      <i className={`fas ${info.overdue ? 'fa-hourglass-end' : 'fa-calendar-check'}`} aria-hidden="true" />
      <div>
        <strong>{info.closed ? 'Closed' : info.overdue ? 'Overdue' : 'Due'} {formatDateTime(info.due_at)}</strong>
        <small>
          {info.overdue ? `The deadline was ${relative(info.due_at, now)}. ` : `That’s ${relative(info.due_at, now)}. `}
          {info.late_policy === 'closed' && (info.closed ? 'This assignment no longer accepts work.' : 'Work is not accepted after the deadline.')}
          {info.late_policy === 'penalty' && `Late work loses ${info.late_penalty_percent}% of its grade.`}
          {info.late_policy === 'accept' && 'Late work is accepted but marked late.'}
        </small>
      </div>
    </div>
  );
};

/** The rubric: each criterion, its points, and (once graded) the score given. */
const Rubric = ({ rubric, scores }) => (
  <table className="asg-rubric">
    <thead><tr><th scope="col">Criterion</th><th scope="col" className="num">{scores?.length ? 'Score' : 'Points'}</th></tr></thead>
    <tbody>
      {rubric.map((c, k) => (
        <tr key={c.title}>
          <td><strong>{c.title}</strong>{c.description && <small className="muted">{c.description}</small>}</td>
          <td className="num">{scores?.length ? `${scores[k]} / ${c.points}` : c.points}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

export const Files = ({ files }) => (files?.length ? (
  <ul className="asg-files">
    {files.map((f) => (
      <li key={f.url}><a href={assetUrl(f.url)} className="btn btn--outline btn--sm" download><i className="fas fa-paperclip" /> {f.filename}{f.size ? <small> · {formatSize(f.size)}</small> : null}</a></li>
    ))}
  </ul>
) : null);

const Submission = ({ sub, maxPoints, rubric }) => (
  <div className="asg-sub">
    <div className="asg-sub__head">
      <StatusPill status={TONE[sub.status]} label={sub.status_display} />
      <small className="muted">Handed in {formatDateTime(sub.created_at)}</small>
      {sub.is_late && <span className="badge badge--amber">Late{sub.penalty_percent ? ` · −${sub.penalty_percent}%` : ''}</span>}
      {sub.grade != null && <strong className="asg-sub__grade">{sub.grade} / {maxPoints}</strong>}
    </div>
    {sub.grade != null && sub.raw_grade != null && sub.raw_grade !== sub.grade && (
      <p className="muted small">{sub.raw_grade} / {maxPoints} before the late penalty.</p>
    )}
    {sub.text && <div className="asg-sub__text">{paragraphs(sub.text).map((p) => <p key={p.slice(0, 40)}>{p}</p>)}</div>}
    <Files files={sub.files} />
    {rubric?.length > 0 && sub.rubric_scores?.length > 0 && <Rubric rubric={rubric} scores={sub.rubric_scores} />}
    {sub.feedback && (
      <div className="asg-sub__feedback">
        <strong><i className="fas fa-comment-dots" aria-hidden="true" /> Instructor feedback</strong>
        {paragraphs(sub.feedback).map((p) => <p key={p.slice(0, 40)}>{p}</p>)}
        {sub.graded_at && <small className="muted">{formatDateTime(sub.graded_at)}</small>}
      </div>
    )}
  </div>
);

/** An assignment lesson: instructions, files, the hand-in form, and the grade and feedback. */
export const AssignmentPane = ({ lesson, canTrack, onChanged }) => {
  const info = lesson.assignment || {};
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const maxFiles = info.max_files || 1;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(!info.latest);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await lmsAPI.submitAssignment(lesson.id, { text, files });
      setText('');
      setFiles([]);
      setShowForm(false);
      onChanged();
    } catch (err) {
      const errs = parseApiErrors(err);
      setError(errs.file || errs.detail || errs.form || 'Your work could not be handed in.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="asg">
      <section className="asg-block">
        <h2 className="h4">Instructions</h2>
        <div className="lms-body">{paragraphs(lesson.body).map((p) => <p key={p.slice(0, 40)}>{p}</p>)}</div>
        <p className="muted small">Graded out of {info.max_points ?? 100} points. {info.allow_resubmit ? 'You can hand in again until your work is approved.' : 'You can hand this in once.'}</p>
        {canTrack && <Deadline info={info} />}
        {info.rubric?.length > 0 && (
          <>
            <h3 className="h5 asg-rubric__title">How it’s graded</h3>
            <Rubric rubric={info.rubric} />
          </>
        )}
      </section>

      {lesson.resources.length > 0 && (
        <section className="asg-block">
          <h2 className="h4">Files for this assignment</h2>
          <ul className="lms-resources">
            {lesson.resources.map((r) => (
              <li key={r.id}>
                <i className="fas fa-file-arrow-down" aria-hidden="true" />
                <span><strong>{r.title}</strong><small>{r.filename} · {formatSize(r.size)}</small></span>
                <a href={assetUrl(r.url)} className="btn btn--outline btn--sm" download>Download</a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!canTrack && <Alert type="info">Enrol on this course to hand in your work.</Alert>}

      {info.latest && (
        <section className="asg-block">
          <h2 className="h4">Your submission</h2>
          <Submission sub={info.latest} maxPoints={info.max_points} rubric={info.rubric} />
          {info.latest.status === 'approved' && <p className="asg-done"><i className="fas fa-circle-check" aria-hidden="true" /> Approved: this lesson is complete.</p>}
          {info.latest.status === 'submitted' && <p className="muted small">Your instructor will grade it soon. You’ll get a notification.</p>}
        </section>
      )}

      {canTrack && info.can_submit && (
        showForm ? (
          <form className="asg-block asg-form" onSubmit={submit}>
            <h2 className="h4">{info.latest ? 'Hand in again' : 'Hand in your work'}</h2>
            <div className="field">
              <label htmlFor={`asg-text-${lesson.id}`}>Your answer</label>
              <textarea id={`asg-text-${lesson.id}`} className="input" rows={6} maxLength={20000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write your answer, or add notes about the file you attach." />
            </div>
            <div className="field">
              <label htmlFor={`asg-file-${lesson.id}`}>{maxFiles > 1 ? `Attach files (up to ${maxFiles})` : 'Attach a file'} <span className="optional">(optional)</span></label>
              <input id={`asg-file-${lesson.id}`} type="file" className="input" multiple={maxFiles > 1}
                onChange={(e) => {
                  const chosen = [...(e.target.files || [])];
                  e.target.value = '';
                  setFiles((list) => (maxFiles > 1 ? [...list, ...chosen] : chosen).slice(0, maxFiles));
                }} />
              <p className="hint">PDF, Word, a ZIP of your project, images… up to 50 MB each.</p>
              {files.length > 0 && (
                <ul className="asg-picked">
                  {files.map((f, k) => (
                    <li key={`${f.name}-${k}`}>
                      <i className="fas fa-file" aria-hidden="true" /> {f.name} <small className="muted">{formatSize(f.size)}</small>
                      <button type="button" className="icon-btn" aria-label={`Remove ${f.name}`} onClick={() => setFiles((list) => list.filter((_, m) => m !== k))}><i className="fas fa-xmark" /></button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {info.overdue && !info.closed && (
              <Alert type="info">The deadline has passed: this will be marked late{info.late_policy === 'penalty' ? ` and lose ${info.late_penalty_percent}% of its grade` : ''}.</Alert>
            )}
            <Alert>{error}</Alert>
            <div className="quiz-actions">
              <button type="submit" className="btn btn--primary" disabled={busy || (!text.trim() && !files.length)}>
                {busy ? <span className="btn-spinner" /> : <i className="fas fa-upload" />} Hand in
              </button>
              {info.latest && <button type="button" className="btn btn--text" onClick={() => setShowForm(false)}>Cancel</button>}
            </div>
          </form>
        ) : (
          <button type="button" className="btn btn--outline" onClick={() => setShowForm(true)}><i className="fas fa-upload" /> Hand in a new version</button>
        )
      )}
      {canTrack && info.latest && !info.can_submit && !info.closed && info.latest.status !== 'approved' && (
        <p className="muted small">This assignment can only be handed in once.</p>
      )}

      {canTrack && info.peer_reviews > 0 && <PeerReviewBox key={info.latest?.id || 'none'} lessonId={lesson.id} />}

      {info.history?.length > 0 && (
        <details className="asg-block asg-history">
          <summary>Earlier submissions ({info.history.length})</summary>
          {info.history.map((s) => <Submission key={s.id} sub={s} maxPoints={info.max_points} rubric={info.rubric} />)}
        </details>
      )}
    </div>
  );
};

export default AssignmentPane;

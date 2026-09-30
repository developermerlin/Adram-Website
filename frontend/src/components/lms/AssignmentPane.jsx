import { useState } from 'react';
import { lmsAPI, parseApiErrors } from '../../services/api';
import { Alert } from '../ui/Form';
import { StatusPill } from './Price';
import { assetUrl } from '../../utils/assets';
import { formatDateTime } from '../../utils/format';
import { formatSize, paragraphs } from '../../utils/lms';

const TONE = { submitted: 'processing', approved: 'successful', rejected: 'failed' };

const Submission = ({ sub, maxPoints }) => (
  <div className="asg-sub">
    <div className="asg-sub__head">
      <StatusPill status={TONE[sub.status]} label={sub.status_display} />
      <small className="muted">Handed in {formatDateTime(sub.created_at)}</small>
      {sub.grade != null && <strong className="asg-sub__grade">{sub.grade} / {maxPoints}</strong>}
    </div>
    {sub.text && <div className="asg-sub__text">{paragraphs(sub.text).map((p) => <p key={p.slice(0, 40)}>{p}</p>)}</div>}
    {sub.file_url && <a href={assetUrl(sub.file_url)} className="btn btn--outline btn--sm" download><i className="fas fa-paperclip" /> {sub.filename}</a>}
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
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(!info.latest);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await lmsAPI.submitAssignment(lesson.id, { text, file });
      setText('');
      setFile(null);
      setShowForm(false);
      onChanged();
    } catch (err) {
      const errs = parseApiErrors(err);
      setError(errs.file || errs.form || 'Your work could not be handed in.');
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
          <Submission sub={info.latest} maxPoints={info.max_points} />
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
              <label htmlFor={`asg-file-${lesson.id}`}>Attach a file <span className="optional">(optional)</span></label>
              <input id={`asg-file-${lesson.id}`} type="file" className="input" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              <p className="hint">PDF, Word, a ZIP of your project, images… up to 50 MB.</p>
            </div>
            <Alert>{error}</Alert>
            <div className="quiz-actions">
              <button type="submit" className="btn btn--primary" disabled={busy || (!text.trim() && !file)}>
                {busy ? <span className="btn-spinner" /> : <i className="fas fa-upload" />} Hand in
              </button>
              {info.latest && <button type="button" className="btn btn--text" onClick={() => setShowForm(false)}>Cancel</button>}
            </div>
          </form>
        ) : (
          <button type="button" className="btn btn--outline" onClick={() => setShowForm(true)}><i className="fas fa-upload" /> Hand in a new version</button>
        )
      )}
      {canTrack && info.latest && !info.can_submit && info.latest.status !== 'approved' && (
        <p className="muted small">This assignment can only be handed in once.</p>
      )}

      {info.history?.length > 0 && (
        <details className="asg-block asg-history">
          <summary>Earlier submissions ({info.history.length})</summary>
          {info.history.map((s) => <Submission key={s.id} sub={s} maxPoints={info.max_points} />)}
        </details>
      )}
    </div>
  );
};

export default AssignmentPane;

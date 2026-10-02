import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { lmsAPI, parseApiErrors } from '../../services/api';
import { Alert } from '../ui/Form';
import { StatusPill } from './Price';
import { formatDateTime } from '../../utils/format';
import { paragraphs } from '../../utils/lms';
import { Files } from './AssignmentPane';
import '../../styles/assignments.css';

const FILTERS = [['submitted', 'To grade'], ['rejected', 'Needs more work'], ['approved', 'Approved'], ['', 'All']];
const TONE = { submitted: 'processing', approved: 'successful', rejected: 'failed' };

/** Grading one hand-in: approve or send back, a grade (or a score for each rubric criterion) and feedback. */
const GradeForm = ({ sub, onGraded }) => {
  const rubric = sub.lesson.rubric || [];
  const [grade, setGrade] = useState(sub.raw_grade ?? sub.grade ?? '');
  const [scores, setScores] = useState(() => rubric.map((_, k) => sub.rubric_scores?.[k] ?? ''));
  const total = scores.reduce((sum, v) => sum + (Number(v) || 0), 0);
  const scored = scores.every((v) => v !== '');
  const raw = rubric.length ? total : grade === '' ? null : Number(grade);
  const final = raw != null && sub.penalty_percent ? Math.round((raw * (100 - sub.penalty_percent)) / 100) : raw;
  const [feedback, setFeedback] = useState(sub.feedback || '');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const send = async (status) => {
    setBusy(status);
    setError('');
    try {
      const body = rubric.length ? { status, rubric_scores: scores.map(Number), feedback } : { status, grade: grade === '' ? null : grade, feedback };
      const { data } = await lmsAPI.gradeSubmission(sub.id, body);
      toast.success(status === 'approved' ? 'Approved. The student has been told.' : 'Sent back to the student.');
      onGraded(data);
    } catch (err) {
      const errs = parseApiErrors(err);
      setError(errs.rubric_scores || errs.grade || errs.status || errs.form || 'The grade could not be saved.');
    } finally {
      setBusy('');
    }
  };
  return (
    <div className="sp-grade">
      {rubric.length > 0 ? (
        <table className="asg-rubric asg-rubric--grade">
          <thead><tr><th scope="col">Criterion</th><th scope="col" className="num">Score</th></tr></thead>
          <tbody>
            {rubric.map((c, k) => (
              <tr key={c.title}>
                <td><strong>{c.title}</strong>{c.description && <small className="muted">{c.description}</small>}</td>
                <td className="num">
                  <input type="number" min="0" max={c.points} className="input" aria-label={`Score for ${c.title}`} value={scores[k]}
                    onChange={(e) => setScores((list) => list.map((v, m) => (m === k ? e.target.value : v)))} /> / {c.points}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><th scope="row">Total</th><td className="num"><strong>{total} / {sub.max_points}</strong></td></tr></tfoot>
        </table>
      ) : (
        <div className="form-row">
          <div className="field">
            <label htmlFor={`g-${sub.id}`}>Grade (out of {sub.max_points})</label>
            <input id={`g-${sub.id}`} type="number" min="0" max={sub.max_points} className="input" value={grade} onChange={(e) => setGrade(e.target.value)} />
          </div>
        </div>
      )}
      {sub.penalty_percent > 0 && raw != null && (
        <p className="asg-penalty"><i className="fas fa-hourglass-end" aria-hidden="true" /> Handed in late: the {sub.penalty_percent}% penalty makes the grade <strong>{final} / {sub.max_points}</strong>.</p>
      )}
      <div className="field">
        <label htmlFor={`f-${sub.id}`}>Feedback for the student</label>
        <textarea id={`f-${sub.id}`} className="input" rows={3} maxLength={5000} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="What was good, and what to improve." />
      </div>
      <Alert>{error}</Alert>
      <div className="sp-grade__actions">
        <button type="button" className="btn btn--primary btn--sm" onClick={() => send('approved')} disabled={!!busy || (rubric.length > 0 && !scored)} title={rubric.length && !scored ? 'Score every criterion first' : ''}>{busy === 'approved' ? <span className="btn-spinner" /> : <i className="fas fa-check" />} Approve</button>
        <button type="button" className="btn btn--outline btn--sm" onClick={() => send('rejected')} disabled={!!busy || !feedback.trim()} title={feedback.trim() ? '' : 'Write feedback first'}>
          {busy === 'rejected' ? <span className="btn-spinner" /> : <i className="fas fa-rotate-left" />} Needs more work
        </button>
      </div>
    </div>
  );
};

/** Every assignment hand-in of a course, to read and grade. */
export const SubmissionsPanel = ({ slug }) => {
  const [status, setStatus] = useState('submitted');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);

  const load = useCallback(() => lmsAPI.courseSubmissions(slug, status).then(({ data: d }) => {
    setData(d);
    setError('');
  }).catch(() => setError('The submissions could not be loaded.')), [slug, status]);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="sp">
      <div className="chip-row" role="group" aria-label="Show submissions">
        {FILTERS.map(([id, label]) => (
          <button key={id || 'all'} type="button" className={`chip${status === id ? ' is-active' : ''}`} aria-pressed={status === id} onClick={() => setStatus(id)}>
            {label}{id && data ? ` (${data.counts[id]})` : ''}
          </button>
        ))}
      </div>
      <Alert>{error}</Alert>
      {!data && !error && <div className="skeleton skeleton--block" />}
      {data && data.submissions.length === 0 && (
        <section className="card panel empty-state">
          <span className="empty-state__icon"><i className="fas fa-file-pen" /></span>
          <h3>{status === 'submitted' ? 'Nothing to grade' : 'No submissions here'}</h3>
          <p className="muted">Add an Assignment lesson to the curriculum; students’ work appears here for you to grade.</p>
        </section>
      )}
      <ul className="sp-list">
        {data?.submissions.map((sub) => (
          <li key={sub.id} className="card">
            <button type="button" className="sp-item" onClick={() => setOpen(open === sub.id ? null : sub.id)} aria-expanded={open === sub.id}>
              <span className="sp-item__who"><strong>{sub.student.name}</strong><small className="muted">{sub.lesson.title} · {formatDateTime(sub.created_at)}{sub.lesson.due_at ? ` · due ${formatDateTime(sub.lesson.due_at)}` : ''}</small></span>
              {sub.is_late && <span className="badge badge--amber">Late{sub.penalty_percent ? ` −${sub.penalty_percent}%` : ''}</span>}
              {sub.similarity?.flag && <span className="badge badge--red" title={`Shares ${sub.similarity.percent}% of its wording with ${sub.similarity.with}’s work`}><i className="fas fa-clone" /> {sub.similarity.percent}% similar</span>}
              {sub.grade != null && <span className="sp-item__grade">{sub.grade}/{sub.max_points}</span>}
              <StatusPill status={TONE[sub.status]} label={sub.status_display} />
              <i className={`fas fa-chevron-${open === sub.id ? 'up' : 'down'}`} aria-hidden="true" />
            </button>
            {open === sub.id && (
              <div className="sp-body">
                {sub.text ? <div className="asg-sub__text">{paragraphs(sub.text).map((p) => <p key={p.slice(0, 40)}>{p}</p>)}</div> : <p className="muted">No written answer.</p>}
                {sub.similarity?.flag && (
                  <p className="sp-similar"><i className="fas fa-triangle-exclamation" aria-hidden="true" /> {sub.similarity.percent}% of this work’s wording also appears in {sub.similarity.with}’s submission. Shared starter code or a quoted question can explain it: compare before deciding.</p>
                )}
                <Files files={sub.files} />
                {sub.peer_reviews?.length > 0 && (
                  <details className="pr-instructor">
                    <summary>Peer reviews ({sub.peer_reviews.length})</summary>
                    {sub.peer_reviews.map((r, i) => (
                      <div key={i} className="pr-received__item">
                        <strong>{r.reviewer}</strong>{r.scores.length > 0 && <small className="muted"> · scores {r.scores.join(' + ')}</small>}
                        <p>{r.comment}</p>
                      </div>
                    ))}
                  </details>
                )}
                <GradeForm sub={sub} onGraded={() => { setOpen(null); load(); }} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default SubmissionsPanel;

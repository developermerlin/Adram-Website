import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { lmsAPI, parseApiErrors } from '../../services/api';
import { Alert } from '../ui/Form';
import { StatusPill } from './Price';
import { assetUrl } from '../../utils/assets';
import { formatDateTime } from '../../utils/format';
import { paragraphs } from '../../utils/lms';

const FILTERS = [['submitted', 'To grade'], ['rejected', 'Needs more work'], ['approved', 'Approved'], ['', 'All']];
const TONE = { submitted: 'processing', approved: 'successful', rejected: 'failed' };

/** Grading one hand-in: approve or send back, a grade and feedback. */
const GradeForm = ({ sub, onGraded }) => {
  const [grade, setGrade] = useState(sub.grade ?? '');
  const [feedback, setFeedback] = useState(sub.feedback || '');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const send = async (status) => {
    setBusy(status);
    setError('');
    try {
      const { data } = await lmsAPI.gradeSubmission(sub.id, { status, grade: grade === '' ? null : grade, feedback });
      toast.success(status === 'approved' ? 'Approved. The student has been told.' : 'Sent back to the student.');
      onGraded(data);
    } catch (err) {
      const errs = parseApiErrors(err);
      setError(errs.grade || errs.status || errs.form || 'The grade could not be saved.');
    } finally {
      setBusy('');
    }
  };
  return (
    <div className="sp-grade">
      <div className="form-row">
        <div className="field">
          <label htmlFor={`g-${sub.id}`}>Grade (out of {sub.max_points})</label>
          <input id={`g-${sub.id}`} type="number" min="0" max={sub.max_points} className="input" value={grade} onChange={(e) => setGrade(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label htmlFor={`f-${sub.id}`}>Feedback for the student</label>
        <textarea id={`f-${sub.id}`} className="input" rows={3} maxLength={5000} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="What was good, and what to improve." />
      </div>
      <Alert>{error}</Alert>
      <div className="sp-grade__actions">
        <button type="button" className="btn btn--primary btn--sm" onClick={() => send('approved')} disabled={!!busy}>{busy === 'approved' ? <span className="btn-spinner" /> : <i className="fas fa-check" />} Approve</button>
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
              <span className="sp-item__who"><strong>{sub.student.name}</strong><small className="muted">{sub.lesson.title} · {formatDateTime(sub.created_at)}</small></span>
              {sub.grade != null && <span className="sp-item__grade">{sub.grade}/{sub.max_points}</span>}
              <StatusPill status={TONE[sub.status]} label={sub.status_display} />
              <i className={`fas fa-chevron-${open === sub.id ? 'up' : 'down'}`} aria-hidden="true" />
            </button>
            {open === sub.id && (
              <div className="sp-body">
                {sub.text ? <div className="asg-sub__text">{paragraphs(sub.text).map((p) => <p key={p.slice(0, 40)}>{p}</p>)}</div> : <p className="muted">No written answer.</p>}
                {sub.file_url && <a href={assetUrl(sub.file_url)} className="btn btn--outline btn--sm" download><i className="fas fa-paperclip" /> {sub.filename}</a>}
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

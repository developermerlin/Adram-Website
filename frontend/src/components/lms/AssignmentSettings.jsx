import '../../styles/assignments.css';

const POLICIES = [
  ['accept', 'Accept, marked late'],
  ['penalty', 'Accept with a penalty'],
  ['closed', 'Refuse after the deadline'],
];

/**
 * An assignment's grading and deadline settings in the lesson editor. `form` holds max_points, allow_resubmit,
 * due_mode (none|date|days), due_at (local input value), due_days, late_policy, late_penalty_percent, max_files and rubric;
 * `set(field)(value)` changes one.
 */
export const AssignmentSettings = ({ id, form, set }) => {
  const rubric = form.rubric || [];
  const total = rubric.reduce((sum, c) => sum + (Number(c.points) || 0), 0);
  const setCriterion = (k, patch) => set('rubric')(rubric.map((c, m) => (m === k ? { ...c, ...patch } : c)));

  return (
    <fieldset className="asg-settings">
      <legend>Grading and deadline</legend>

      <div className="asg-settings__grid">
        <div className="field">
          <label htmlFor={`due-mode-${id}`}>Deadline</label>
          <select id={`due-mode-${id}`} className="input" value={form.due_mode} onChange={(e) => set('due_mode')(e.target.value)}>
            <option value="none">No deadline</option>
            <option value="date">A date for everyone</option>
            <option value="days">Days after the student enrols</option>
          </select>
        </div>
        {form.due_mode === 'date' && (
          <div className="field">
            <label htmlFor={`due-at-${id}`}>Due</label>
            <input id={`due-at-${id}`} type="datetime-local" className="input" value={form.due_at} onChange={(e) => set('due_at')(e.target.value)} />
          </div>
        )}
        {form.due_mode === 'days' && (
          <div className="field">
            <label htmlFor={`due-days-${id}`}>Due after (days)</label>
            <input id={`due-days-${id}`} type="number" min="1" max="365" className="input" value={form.due_days} onChange={(e) => set('due_days')(e.target.value)} />
          </div>
        )}
        {form.due_mode !== 'none' && (
          <div className="field">
            <label htmlFor={`late-${id}`}>Late work</label>
            <select id={`late-${id}`} className="input" value={form.late_policy} onChange={(e) => set('late_policy')(e.target.value)}>
              {POLICIES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
          </div>
        )}
        {form.due_mode !== 'none' && form.late_policy === 'penalty' && (
          <div className="field">
            <label htmlFor={`pen-${id}`}>Penalty (% of the grade)</label>
            <input id={`pen-${id}`} type="number" min="0" max="100" className="input" value={form.late_penalty_percent} onChange={(e) => set('late_penalty_percent')(e.target.value)} />
          </div>
        )}
        <div className="field">
          <label htmlFor={`peer-${id}`}>Peer review</label>
          <select id={`peer-${id}`} className="input" value={form.peer_reviews} onChange={(e) => set('peer_reviews')(Number(e.target.value))}>
            <option value={0}>Off</option>
            <option value={1}>Each student reviews 1 classmate</option>
            <option value={2}>Each student reviews 2 classmates</option>
            <option value={3}>Each student reviews 3 classmates</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor={`files-${id}`}>Files students can hand in</label>
          <input id={`files-${id}`} type="number" min="1" max="10" className="input" value={form.max_files} onChange={(e) => set('max_files')(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={`lpts-${id}`}>Graded out of (points)</label>
          <input id={`lpts-${id}`} type="number" min="1" max="1000" className="input" value={rubric.length ? total : form.max_points}
            disabled={rubric.length > 0} title={rubric.length ? 'Set by the rubric' : ''} onChange={(e) => set('max_points')(e.target.value)} />
          {rubric.length > 0 && <p className="hint">The rubric’s total.</p>}
        </div>
      </div>

      <label className="checkbox lb-inline-check">
        <input type="checkbox" checked={form.allow_resubmit} onChange={(e) => set('allow_resubmit')(e.target.checked)} />
        <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span>
        <span>Allow resubmission<small>Students can hand in again until you approve their work.</small></span>
      </label>

      <div className="asg-rubric-edit">
        <div className="asg-rubric-edit__head">
          <strong>Rubric</strong>
          <small className="muted">{rubric.length ? `${rubric.length} criteria · ${total} points` : 'Optional: the criteria you grade on. Students see them before handing in.'}</small>
        </div>
        {rubric.map((c, k) => (
          <div key={k} className="asg-rubric-edit__row">
            <input className="input" placeholder="Criterion, e.g. Layout" aria-label={`Criterion ${k + 1}`} value={c.title} maxLength={120} onChange={(e) => setCriterion(k, { title: e.target.value })} />
            <input className="input" placeholder="What earns full marks (optional)" aria-label={`Criterion ${k + 1} description`} value={c.description} maxLength={500} onChange={(e) => setCriterion(k, { description: e.target.value })} />
            <input className="input" type="number" min="1" max="1000" aria-label={`Criterion ${k + 1} points`} value={c.points} onChange={(e) => setCriterion(k, { points: e.target.value })} />
            <button type="button" className="icon-btn icon-btn--danger" aria-label={`Remove criterion ${k + 1}`} onClick={() => set('rubric')(rubric.filter((_, m) => m !== k))}><i className="fas fa-trash-can" /></button>
          </div>
        ))}
        <button type="button" className="btn btn--text btn--sm" disabled={rubric.length >= 20} onClick={() => set('rubric')([...rubric, { title: '', description: '', points: 10 }])}>
          <i className="fas fa-plus" /> Add criterion
        </button>
      </div>
    </fieldset>
  );
};

export default AssignmentSettings;

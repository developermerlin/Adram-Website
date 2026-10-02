/**
 * Editing one quiz question, wherever it lives (a quiz lesson or a question bank): its type, points, difficulty,
 * text and answers. Six types: one right answer, several, true/false, a typed answer, fill in the blanks
 * ("The capital is [Freetown]") and matching pairs.
 */
import { BLANK, DIFFICULTIES, TYPES, blanksOf } from '../../utils/questions';
import '../../styles/question-banks.css';

const PLACEHOLDER = {
  true_false: 'Type the statement',
  fill_blank: 'e.g. The capital of Sierra Leone is [Freetown].',
  matching: 'e.g. Match each tool to what it does',
};

/**
 * The fields of one question. `onChange(patch)` updates it; `name` keeps radio groups apart;
 * `extra` goes in the first row (a bank's category picker).
 */
export const QuestionFields = ({ q, index, onChange, name, extra }) => {
  const n = index + 1;
  const setChoice = (k, patch) => onChange({ choices: q.choices.map((c, m) => (m === k ? { ...c, ...patch } : c)) });
  const markCorrect = (k) => onChange({
    choices: q.choices.map((c, m) => (q.kind === 'multiple' ? (m === k ? { ...c, is_correct: !c.is_correct } : c) : { ...c, is_correct: m === k })),
  });
  const removeChoice = (k) => {
    const rest = q.choices.filter((_, m) => m !== k);
    onChange({ choices: rest.some((c) => c.is_correct) ? rest : rest.map((c, m) => ({ ...c, is_correct: m === 0 })) });
  };
  const changeKind = (kind) => {
    // one right answer when switching to single choice
    const choices = kind === 'single' && q.choices.filter((c) => c.is_correct).length !== 1
      ? q.choices.map((c, m) => ({ ...c, is_correct: m === Math.max(0, q.choices.findIndex((x) => x.is_correct)) }))
      : q.choices;
    onChange({ kind, choices, pairs: q.pairs?.length ? q.pairs : [{ left: '', right: '' }, { left: '', right: '' }] });
  };
  const setPair = (k, patch) => onChange({ pairs: q.pairs.map((p, m) => (m === k ? { ...p, ...patch } : p)) });
  const blanks = q.kind === 'fill_blank' ? blanksOf(q.text) : [];

  return (
    <>
      <div className="qb-row">
        <select className="input" aria-label={`Question ${n} type`} value={q.kind} onChange={(e) => changeKind(e.target.value)}>
          {TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select className="input qb-difficulty" aria-label={`Question ${n} difficulty`} value={q.difficulty || 'medium'} onChange={(e) => onChange({ difficulty: e.target.value })}>
          {DIFFICULTIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        {extra}
        <label className="qb-points">Points <input type="number" min="1" max="100" className="input" value={q.points} onChange={(e) => onChange({ points: e.target.value })} aria-label={`Points for question ${n}`} /></label>
      </div>
      {q.kind === 'fill_blank' ? (
        <textarea className="input" rows={2} placeholder={PLACEHOLDER.fill_blank} aria-label={`Question ${n}`} value={q.text} maxLength={1000} onChange={(e) => onChange({ text: e.target.value })} />
      ) : (
        <input className="input" placeholder={PLACEHOLDER[q.kind] || 'Type the question'} aria-label={`Question ${n}`} value={q.text} maxLength={1000} onChange={(e) => onChange({ text: e.target.value })} />
      )}

      {q.kind === 'true_false' && (
        <div className="qb-tf" role="radiogroup" aria-label="The statement is">
          <label className={`lb-pill${q.answer ? ' is-active' : ''}`}><input type="radio" name={`tf-${name}`} checked={q.answer} onChange={() => onChange({ answer: true })} /> True</label>
          <label className={`lb-pill${!q.answer ? ' is-active' : ''}`}><input type="radio" name={`tf-${name}`} checked={!q.answer} onChange={() => onChange({ answer: false })} /> False</label>
        </div>
      )}

      {q.kind === 'fill_blank' && (
        <div className="qb-blanks">
          <p className="hint">Put each answer in <strong>[square brackets]</strong>. Separate other accepted answers with <strong>|</strong>, e.g. [colour|color]. Capital letters and extra spaces are ignored.</p>
          {blanks.length > 0 ? (
            <p className="qb-blanks__preview">
              <span className="muted">Students see:</span> {q.text.replace(BLANK, '_____')}
              <span className="qb-blanks__list">{blanks.map((b, k) => <span key={k} className="lb-pill is-active">{k + 1}: {b.join(' / ')}</span>)}</span>
            </p>
          ) : <p className="qb-blanks__warn"><i className="fas fa-triangle-exclamation" aria-hidden="true" /> No blanks yet: put at least one answer in square brackets.</p>}
        </div>
      )}

      {q.kind === 'matching' && (
        <div className="qb-pairs">
          <p className="hint">Each item on the left and the answer it matches. Students see the right-hand side mixed up.</p>
          {q.pairs.map((p, k) => (
            <div key={k} className="qb-pairs__row">
              <input className="input" value={p.left} maxLength={200} placeholder={`Item ${k + 1}`} aria-label={`Question ${n}, item ${k + 1}`} onChange={(e) => setPair(k, { left: e.target.value })} />
              <i className="fas fa-arrow-right-long" aria-hidden="true" />
              <input className="input" value={p.right} maxLength={200} placeholder={`Matches ${k + 1}`} aria-label={`Question ${n}, match for item ${k + 1}`} onChange={(e) => setPair(k, { right: e.target.value })} />
              <button type="button" className="icon-btn" aria-label={`Remove pair ${k + 1}`} disabled={q.pairs.length <= 2} onClick={() => onChange({ pairs: q.pairs.filter((_, m) => m !== k) })}><i className="fas fa-xmark" /></button>
            </div>
          ))}
          <button type="button" className="btn btn--text btn--sm" onClick={() => onChange({ pairs: [...q.pairs, { left: '', right: '' }] })} disabled={q.pairs.length >= 10}><i className="fas fa-plus" /> Add pair</button>
        </div>
      )}

      {q.kind === 'short' && (
        <div className="qb-accepted">
          <p className="hint">Accepted answers (capital letters and extra spaces are ignored):</p>
          {q.accepted_answers.map((a, k) => (
            <div key={k} className="qb-accepted__row">
              <input className="input" value={a} maxLength={200} placeholder={`Accepted answer ${k + 1}`} aria-label={`Accepted answer ${k + 1}`}
                onChange={(e) => onChange({ accepted_answers: q.accepted_answers.map((x, m) => (m === k ? e.target.value : x)) })} />
              <button type="button" className="icon-btn" aria-label={`Remove accepted answer ${k + 1}`} disabled={q.accepted_answers.length <= 1}
                onClick={() => onChange({ accepted_answers: q.accepted_answers.filter((_, m) => m !== k) })}><i className="fas fa-xmark" /></button>
            </div>
          ))}
          <button type="button" className="btn btn--text btn--sm" onClick={() => onChange({ accepted_answers: [...q.accepted_answers, ''] })} disabled={q.accepted_answers.length >= 20}><i className="fas fa-plus" /> Add another accepted answer</button>
        </div>
      )}

      {(q.kind === 'single' || q.kind === 'multiple') && (
        <>
          <ul className="lb-choices">
            {q.choices.map((c, k) => (
              <li key={k}>
                <input type={q.kind === 'multiple' ? 'checkbox' : 'radio'} name={`correct-${name}`} checked={c.is_correct} onChange={() => markCorrect(k)} aria-label={`Answer ${k + 1} is correct`} title="Correct answer" />
                <input className="input" placeholder={`Answer ${k + 1}`} aria-label={`Question ${n}, answer ${k + 1}`} value={c.text} maxLength={300} onChange={(e) => setChoice(k, { text: e.target.value })} />
                <button type="button" className="icon-btn" aria-label={`Remove answer ${k + 1}`} disabled={q.choices.length <= 2} onClick={() => removeChoice(k)}><i className="fas fa-xmark" /></button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn--text btn--sm" onClick={() => q.choices.length < 8 && onChange({ choices: [...q.choices, { text: '', is_correct: false }] })} disabled={q.choices.length >= 8}><i className="fas fa-plus" /> Add answer</button>
        </>
      )}
      <input className="input" placeholder="Explanation shown after answering (optional)" aria-label={`Explanation for question ${n}`} value={q.explanation} maxLength={500} onChange={(e) => onChange({ explanation: e.target.value })} />
    </>
  );
};

import { useState } from 'react';
import toast from 'react-hot-toast';
import { lmsAPI, parseApiErrors } from '../../services/api';
import { Alert } from '../ui/Form';

const TYPES = [
  ['single', 'Multiple choice (one answer)'],
  ['multiple', 'Multiple answers'],
  ['true_false', 'True / false'],
  ['short', 'Short answer'],
];

const blankQuestion = (kind = 'single') => ({
  kind,
  text: '',
  explanation: '',
  points: 1,
  answer: true,
  accepted_answers: [''],
  choices: [{ text: '', is_correct: true }, { text: '', is_correct: false }],
});

const fromServer = (q) => ({
  kind: q.kind || 'single',
  text: q.text,
  explanation: q.explanation,
  points: q.points || 1,
  answer: q.kind === 'true_false' ? Boolean(q.choices.find((c) => c.text === 'True')?.is_correct) : true,
  accepted_answers: q.accepted_answers?.length ? q.accepted_answers : [''],
  choices: q.kind === 'true_false' || q.kind === 'short' ? blankQuestion().choices : q.choices.map((c) => ({ text: c.text, is_correct: c.is_correct })),
});

// What the server expects for each type
const toServer = (q) => {
  const base = { kind: q.kind, text: q.text, explanation: q.explanation, points: Number(q.points) || 1 };
  if (q.kind === 'short') return { ...base, accepted_answers: q.accepted_answers.filter((a) => a.trim()) };
  if (q.kind === 'true_false') return { ...base, answer: q.answer };
  return { ...base, choices: q.choices };
};

const SETTINGS = (lesson) => ({
  pass_mark: lesson.pass_mark,
  time_limit_minutes: lesson.time_limit_minutes || 0,
  max_attempts: lesson.max_attempts || 0,
  questions_per_attempt: lesson.questions_per_attempt || 0,
  shuffle_questions: Boolean(lesson.shuffle_questions),
  shuffle_choices: Boolean(lesson.shuffle_choices),
  show_answers: lesson.show_answers !== false,
  is_required: lesson.is_required !== false,
});

// Builds a quiz: its settings, and questions of four kinds (one right answer, several, true/false, a typed answer).
export const QuizBuilder = ({ lesson, onSaved }) => {
  const [questions, setQuestions] = useState(() => lesson.questions.map(fromServer));
  const [settings, setSettings] = useState(() => SETTINGS(lesson));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const setSetting = (key) => (e) => setSettings((s) => ({ ...s, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const setQuestion = (i, patch) => setQuestions((list) => list.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const setChoice = (i, k, patch) => setQuestion(i, { choices: questions[i].choices.map((c, m) => (m === k ? { ...c, ...patch } : c)) });
  const markCorrect = (i, k) => {
    const q = questions[i];
    setQuestion(i, { choices: q.choices.map((c, m) => (q.kind === 'multiple' ? (m === k ? { ...c, is_correct: !c.is_correct } : c) : { ...c, is_correct: m === k })) });
  };
  const addChoice = (i) => questions[i].choices.length < 8 && setQuestion(i, { choices: [...questions[i].choices, { text: '', is_correct: false }] });
  const removeChoice = (i, k) => {
    const rest = questions[i].choices.filter((_, m) => m !== k);
    setQuestion(i, { choices: rest.some((c) => c.is_correct) ? rest : rest.map((c, m) => ({ ...c, is_correct: m === 0 })) });
  };
  const changeKind = (i, kind) => {
    const q = questions[i];
    // one right answer when switching to single choice
    const choices = kind === 'single' && q.choices.filter((c) => c.is_correct).length !== 1
      ? q.choices.map((c, m) => ({ ...c, is_correct: m === Math.max(0, q.choices.findIndex((x) => x.is_correct)) }))
      : q.choices;
    setQuestion(i, { kind, choices });
  };
  const move = (i, step) => setQuestions((list) => {
    const next = [...list];
    [next[i], next[i + step]] = [next[i + step], next[i]];
    return next;
  });

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const { data } = await lmsAPI.saveQuiz(lesson.id, { ...settings, questions: questions.map(toServer) });
      onSaved(data);
      toast.success('Quiz saved.');
    } catch (err) {
      const errors = parseApiErrors(err);
      setError(errors.questions || errors.pass_mark || errors.time_limit_minutes || errors.max_attempts || errors.form || 'The quiz could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const id = (name) => `${name}-${lesson.id}`;
  return (
    <div className="lb-quiz">
      <fieldset className="qb-settings">
        <legend>Quiz settings</legend>
        <div className="qb-settings__grid">
          <label htmlFor={id('pass')}>Pass mark (%)<input id={id('pass')} type="number" min="1" max="100" className="input" value={settings.pass_mark} onChange={setSetting('pass_mark')} /></label>
          <label htmlFor={id('time')}>Time limit (minutes, 0 = none)<input id={id('time')} type="number" min="0" max="600" className="input" value={settings.time_limit_minutes} onChange={setSetting('time_limit_minutes')} /></label>
          <label htmlFor={id('tries')}>Attempts allowed (0 = unlimited)<input id={id('tries')} type="number" min="0" max="100" className="input" value={settings.max_attempts} onChange={setSetting('max_attempts')} /></label>
          <label htmlFor={id('pick')}>Random questions per attempt (0 = all)<input id={id('pick')} type="number" min="0" max="100" className="input" value={settings.questions_per_attempt} onChange={setSetting('questions_per_attempt')} /></label>
        </div>
        <div className="qb-settings__flags">
          <label className="qb-check"><input type="checkbox" checked={settings.shuffle_questions} onChange={setSetting('shuffle_questions')} /> Shuffle the questions</label>
          <label className="qb-check"><input type="checkbox" checked={settings.shuffle_choices} onChange={setSetting('shuffle_choices')} /> Shuffle the answers</label>
          <label className="qb-check"><input type="checkbox" checked={settings.show_answers} onChange={setSetting('show_answers')} /> Show the correct answers after each attempt</label>
          <label className="qb-check"><input type="checkbox" checked={settings.is_required} onChange={setSetting('is_required')} /> Students must pass it to complete the course</label>
        </div>
      </fieldset>

      <div className="lb-quiz__head"><h4>Questions ({questions.length})</h4></div>
      {questions.length === 0 && <p className="muted small">No questions yet. Add the first one below.</p>}
      {questions.map((q, i) => (
        <fieldset key={i} className="lb-question">
          <legend>Question {i + 1}</legend>
          <div className="lb-question__tools">
            <button type="button" className="icon-btn" aria-label={`Move question ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}><i className="fas fa-arrow-up" /></button>
            <button type="button" className="icon-btn" aria-label={`Move question ${i + 1} down`} disabled={i === questions.length - 1} onClick={() => move(i, 1)}><i className="fas fa-arrow-down" /></button>
            <button type="button" className="icon-btn icon-btn--danger" aria-label={`Delete question ${i + 1}`} onClick={() => setQuestions((list) => list.filter((_, j) => j !== i))}><i className="fas fa-trash-can" /></button>
          </div>
          <div className="qb-row">
            <select className="input" aria-label={`Question ${i + 1} type`} value={q.kind} onChange={(e) => changeKind(i, e.target.value)}>
              {TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <label className="qb-points">Points <input type="number" min="1" max="100" className="input" value={q.points} onChange={(e) => setQuestion(i, { points: e.target.value })} aria-label={`Points for question ${i + 1}`} /></label>
          </div>
          <input className="input" placeholder={q.kind === 'true_false' ? 'Type the statement' : 'Type the question'} aria-label={`Question ${i + 1}`} value={q.text} maxLength={500} onChange={(e) => setQuestion(i, { text: e.target.value })} />

          {q.kind === 'true_false' && (
            <div className="qb-tf" role="radiogroup" aria-label="The statement is">
              <label className={`lb-pill${q.answer ? ' is-active' : ''}`}><input type="radio" name={`tf-${i}`} checked={q.answer} onChange={() => setQuestion(i, { answer: true })} /> True</label>
              <label className={`lb-pill${!q.answer ? ' is-active' : ''}`}><input type="radio" name={`tf-${i}`} checked={!q.answer} onChange={() => setQuestion(i, { answer: false })} /> False</label>
            </div>
          )}

          {q.kind === 'short' && (
            <div className="qb-accepted">
              <p className="hint">Accepted answers (capital letters and extra spaces are ignored):</p>
              {q.accepted_answers.map((a, k) => (
                <div key={k} className="qb-accepted__row">
                  <input className="input" value={a} maxLength={200} placeholder={`Accepted answer ${k + 1}`} aria-label={`Accepted answer ${k + 1}`}
                    onChange={(e) => setQuestion(i, { accepted_answers: q.accepted_answers.map((x, m) => (m === k ? e.target.value : x)) })} />
                  <button type="button" className="icon-btn" aria-label={`Remove accepted answer ${k + 1}`} disabled={q.accepted_answers.length <= 1}
                    onClick={() => setQuestion(i, { accepted_answers: q.accepted_answers.filter((_, m) => m !== k) })}><i className="fas fa-xmark" /></button>
                </div>
              ))}
              <button type="button" className="btn btn--text btn--sm" onClick={() => setQuestion(i, { accepted_answers: [...q.accepted_answers, ''] })} disabled={q.accepted_answers.length >= 20}><i className="fas fa-plus" /> Add another accepted answer</button>
            </div>
          )}

          {(q.kind === 'single' || q.kind === 'multiple') && (
            <>
              <ul className="lb-choices">
                {q.choices.map((c, k) => (
                  <li key={k}>
                    <input type={q.kind === 'multiple' ? 'checkbox' : 'radio'} name={`correct-${lesson.id}-${i}`} checked={c.is_correct} onChange={() => markCorrect(i, k)} aria-label={`Answer ${k + 1} is correct`} title="Correct answer" />
                    <input className="input" placeholder={`Answer ${k + 1}`} aria-label={`Question ${i + 1}, answer ${k + 1}`} value={c.text} maxLength={300} onChange={(e) => setChoice(i, k, { text: e.target.value })} />
                    <button type="button" className="icon-btn" aria-label={`Remove answer ${k + 1}`} disabled={q.choices.length <= 2} onClick={() => removeChoice(i, k)}><i className="fas fa-xmark" /></button>
                  </li>
                ))}
              </ul>
              <button type="button" className="btn btn--text btn--sm" onClick={() => addChoice(i)} disabled={q.choices.length >= 8}><i className="fas fa-plus" /> Add answer</button>
            </>
          )}
          <input className="input" placeholder="Explanation shown after answering (optional)" aria-label={`Explanation for question ${i + 1}`} value={q.explanation} maxLength={500} onChange={(e) => setQuestion(i, { explanation: e.target.value })} />
        </fieldset>
      ))}
      <Alert>{error}</Alert>
      <div className="lb-quiz__actions">
        <div className="qb-add">
          {TYPES.map(([kind, label]) => (
            <button key={kind} type="button" className="btn btn--outline btn--sm" onClick={() => setQuestions((list) => [...list, blankQuestion(kind)])} disabled={questions.length >= 100}>
              <i className="fas fa-plus" /> {label.replace(/ \(.*\)/, '')}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn--primary btn--sm" onClick={save} disabled={saving}>
          {saving ? <span className="btn-spinner" /> : <i className="fas fa-floppy-disk" />} Save quiz
        </button>
      </div>
      <p className="hint">Mark the correct answer(s) with the circle or box beside them. Saving the quiz replaces its questions; attempts in progress restart.</p>
    </div>
  );
};

export default QuizBuilder;

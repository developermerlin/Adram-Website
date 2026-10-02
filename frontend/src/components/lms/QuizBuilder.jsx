import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { lmsAPI, parseApiErrors } from '../../services/api';
import { DIFFICULTIES, TYPES, blankQuestion, fromServer, toServer } from '../../utils/questions';
import { Alert } from '../ui/Form';
import { QuestionFields } from './QuestionEditor';
import BankPicker from './BankPicker';

const ruleFromServer = (r) => ({ bank: r.bank, category: r.category || '', difficulty: r.difficulty || '', count: r.count, available: r.available });


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

// Builds a quiz: its settings, its own questions (six kinds, typed in or copied from a question bank) and rules that
// draw random questions from question banks on every attempt.
export const QuizBuilder = ({ lesson, onSaved }) => {
  const [questions, setQuestions] = useState(() => lesson.questions.map(fromServer));
  const [rules, setRules] = useState(() => (lesson.rules || []).map(ruleFromServer));
  const [banks, setBanks] = useState(null);
  const [picking, setPicking] = useState(false);
  const [settings, setSettings] = useState(() => SETTINGS(lesson));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const banksPath = useLocation().pathname.startsWith('/admin') ? '/admin/question-banks' : '/instructor/question-banks';
  useEffect(() => {
    lmsAPI.banks().then(({ data }) => setBanks(data)).catch(() => setBanks([]));
  }, []);

  const setSetting = (key) => (e) => setSettings((s) => ({ ...s, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const setQuestion = (i, patch) => setQuestions((list) => list.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const move = (i, step) => setQuestions((list) => {
    const next = [...list];
    [next[i], next[i + step]] = [next[i + step], next[i]];
    return next;
  });

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const { data } = await lmsAPI.saveQuiz(lesson.id, {
        ...settings,
        questions: questions.map(toServer),
        rules: rules.map((r) => ({ bank: r.bank, category: r.category || null, difficulty: r.difficulty, count: Number(r.count) || 1 })),
      });
      setRules((data.rules || []).map(ruleFromServer));
      onSaved(data);
      toast.success('Quiz saved.');
    } catch (err) {
      const errors = parseApiErrors(err);
      setError(errors.questions || errors.rules || errors.pass_mark || errors.time_limit_minutes || errors.max_attempts || errors.form || 'The quiz could not be saved.');
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

      <div className="lb-quiz__head">
        <h4>Questions ({questions.length})</h4>
        {banks?.length > 0 && <button type="button" className="btn btn--outline btn--sm" onClick={() => setPicking(true)}><i className="fas fa-box-archive" /> Add from a bank</button>}
      </div>
      {questions.length === 0 && <p className="muted small">No questions yet. Add the first one below.</p>}
      {questions.map((q, i) => (
        <fieldset key={i} className="lb-question">
          <legend>Question {i + 1}</legend>
          <div className="lb-question__tools">
            <button type="button" className="icon-btn" aria-label={`Move question ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}><i className="fas fa-arrow-up" /></button>
            <button type="button" className="icon-btn" aria-label={`Move question ${i + 1} down`} disabled={i === questions.length - 1} onClick={() => move(i, 1)}><i className="fas fa-arrow-down" /></button>
            <button type="button" className="icon-btn icon-btn--danger" aria-label={`Delete question ${i + 1}`} onClick={() => setQuestions((list) => list.filter((_, j) => j !== i))}><i className="fas fa-trash-can" /></button>
          </div>
          <QuestionFields q={q} index={i} name={`${lesson.id}-${i}`} onChange={(patch) => setQuestion(i, patch)} />
        </fieldset>
      ))}

      <fieldset className="qb-rules">
        <legend>Random questions from question banks</legend>
        <p className="hint">Every attempt also asks questions picked at random from your banks, so students get a different quiz each time. <Link to={banksPath}>Manage question banks</Link></p>
        {banks && banks.length === 0 && <p className="muted small">You have no question banks yet. <Link to={banksPath}>Create one</Link> to draw random questions from it.</p>}
        {rules.map((r, k) => {
          const bank = banks?.find((b) => b.id === Number(r.bank));
          const set = (patch) => setRules((list) => list.map((x, m) => (m === k ? { ...x, ...patch, available: undefined } : x)));
          return (
            <div key={k} className="qb-rule">
              <label>Ask<input type="number" min="1" max="50" className="input" value={r.count} onChange={(e) => set({ count: e.target.value })} aria-label={`Rule ${k + 1}: how many questions`} /></label>
              <select className="input" value={r.difficulty} onChange={(e) => set({ difficulty: e.target.value })} aria-label={`Rule ${k + 1}: difficulty`}>
                <option value="">questions of any difficulty</option>
                {DIFFICULTIES.map(([v, label]) => <option key={v} value={v}>{label.toLowerCase()} questions</option>)}
              </select>
              <span>from</span>
              <select className="input" value={r.bank} onChange={(e) => set({ bank: Number(e.target.value), category: '' })} aria-label={`Rule ${k + 1}: bank`}>
                {(banks || []).map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
              </select>
              <select className="input" value={r.category} onChange={(e) => set({ category: e.target.value })} aria-label={`Rule ${k + 1}: category`}>
                <option value="">any category</option>
                {(bank?.categories || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {r.available != null && <small className={r.available < r.count ? 'qb-rule__short' : 'muted'}>{r.available} available{r.available < r.count ? ', so fewer will be asked' : ''}</small>}
              <button type="button" className="icon-btn icon-btn--danger" aria-label={`Remove rule ${k + 1}`} onClick={() => setRules((list) => list.filter((_, m) => m !== k))}><i className="fas fa-trash-can" /></button>
            </div>
          );
        })}
        {banks?.length > 0 && (
          <button type="button" className="btn btn--text btn--sm" disabled={rules.length >= 20}
            onClick={() => setRules((list) => [...list, { bank: banks[0].id, category: '', difficulty: '', count: 5 }])}>
            <i className="fas fa-plus" /> Add a random draw
          </button>
        )}
      </fieldset>

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
      {picking && (
        <BankPicker banks={banks} onClose={() => setPicking(false)} onAdd={(picked) => {
          setQuestions((list) => [...list, ...picked.map((q) => ({ ...fromServer(q), id: undefined, category: null }))].slice(0, 100));
          setPicking(false);
          toast.success(`${picked.length} ${picked.length === 1 ? 'question' : 'questions'} added. Save the quiz to keep them.`);
        }} />
      )}
    </div>
  );
};

export default QuizBuilder;

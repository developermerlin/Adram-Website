import { useCallback, useEffect, useRef, useState } from 'react';
import { lmsAPI, parseApiErrors } from '../../services/api';
import { Alert } from '../ui/Form';
import { answered, clock, readAnswers, saveAnswers, secondsUntil } from '../../utils/learn';
import { formatDate } from '../../utils/format';
import '../../styles/question-banks.css';

const TYPE_HINT = {
  single: 'Choose one answer', true_false: 'True or false?', multiple: 'Choose every answer that applies', short: 'Type your answer',
  fill_blank: 'Fill in each blank', matching: 'Match each item to its answer',
};
const norm = (v) => String(v || '').normalize('NFKC').toLowerCase().replace(/\./g, ' ').split(/\s+/).filter(Boolean).join(' ');

/** Fill in the blanks: the sentence with a text box at each blank. */
const BlankField = ({ q, index, value, onChange, verdict, disabled }) => {
  const list = Array.isArray(value) ? value : [];
  const set = (k, v) => {
    const next = [...list];
    next[k] = v;
    onChange(next);
  };
  return (
    <p className="quiz-blanks">
      {q.parts.map((part, k) => {
        if (part.text != null) return <span key={k}>{part.text}</span>;
        const b = part.blank;
        const accepted = verdict?.blanks?.[b];
        const ok = accepted ? accepted.some((a) => norm(a) === norm(list[b])) : null;
        return (
          <span key={k} className={`quiz-blank${ok === true ? ' is-right' : ok === false ? ' is-wrong' : ''}`}>
            <input className="input" value={list[b] || ''} onChange={(e) => set(b, e.target.value)} disabled={disabled} maxLength={200}
              aria-label={`Question ${index + 1}, blank ${b + 1}`} size={Math.max(8, (list[b] || '').length + 2)} />
            {ok === false && <small>{accepted.join(' / ')}</small>}
          </span>
        );
      })}
    </p>
  );
};

/** Matching: a drop-down of the mixed-up answers beside each item. */
const MatchField = ({ q, index, value, onChange, verdict, disabled }) => {
  const list = Array.isArray(value) ? value : [];
  const set = (k, v) => {
    const next = q.prompts.map((_, m) => list[m] || '');
    next[k] = v;
    onChange(next);
  };
  return (
    <ul className="quiz-match">
      {q.prompts.map((left, k) => {
        const right = verdict?.pairs?.[k]?.right;
        const ok = right != null ? norm(right) === norm(list[k]) : null;
        return (
          <li key={k} className={ok === true ? 'is-right' : ok === false ? 'is-wrong' : ''}>
            <span className="quiz-match__left">{left}</span>
            <i className="fas fa-arrow-right-long" aria-hidden="true" />
            <select className="input" value={list[k] || ''} onChange={(e) => set(k, e.target.value)} disabled={disabled} aria-label={`Question ${index + 1}: match for ${left}`}>
              <option value="">Choose…</option>
              {q.options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            {ok === false && <small>Answer: {right}</small>}
          </li>
        );
      })}
    </ul>
  );
};

/** One question: radio buttons, checkboxes or a text box, and the verdict once marked. */
const QuestionField = ({ q, index, value, onChange, verdict, disabled }) => {
  const chosen = (id) => (q.kind === 'multiple' ? (value || []).includes(id) : String(value) === String(id));
  const toggle = (id) => {
    if (q.kind === 'multiple') {
      const list = value || [];
      onChange(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
    } else onChange(id);
  };
  const right = new Set(verdict?.correct_ids || []);
  return (
    <fieldset className={`lms-question${verdict ? (verdict.correct ? ' is-right' : ' is-wrong') : ''}`}>
      <legend><span>{index + 1}</span> {q.kind === 'fill_blank' ? 'Complete the sentence' : q.text}</legend>
      <p className="quiz-hint">{TYPE_HINT[q.kind] || ''}{q.points > 1 ? ` · ${q.points} points` : ''}</p>
      {q.kind === 'fill_blank' && <BlankField q={q} index={index} value={value} onChange={onChange} verdict={verdict} disabled={disabled} />}
      {q.kind === 'matching' && <MatchField q={q} index={index} value={value} onChange={onChange} verdict={verdict} disabled={disabled} />}
      {q.kind === 'short' && (
        <input className="input" value={value || ''} onChange={(e) => onChange(e.target.value)} disabled={disabled} aria-label={`Answer to question ${index + 1}`} maxLength={300} />
      )}
      {!['short', 'fill_blank', 'matching'].includes(q.kind) && (
        q.choices.map((c) => {
          const state = verdict && verdict.correct_ids ? (right.has(c.id) ? ' is-correct' : chosen(c.id) ? ' is-wrong' : '') : '';
          return (
            <label key={c.id} className={`lms-choice${chosen(c.id) ? ' is-chosen' : ''}${state}`}>
              <input type={q.kind === 'multiple' ? 'checkbox' : 'radio'} name={`q${q.id}`} value={c.id} checked={chosen(c.id)} disabled={disabled} onChange={() => toggle(c.id)} />
              <span>{c.text}</span>
            </label>
          );
        })
      )}
      {verdict && (
        <p className={`quiz-verdict${verdict.correct ? ' is-right' : ''}`}>
          <i className={`fas ${verdict.correct ? 'fa-circle-check' : 'fa-circle-xmark'}`} aria-hidden="true" /> {verdict.correct ? 'Correct' : 'Not quite'}
          {!verdict.correct && q.kind === 'short' && verdict.accepted_answers?.length > 0 && <> · Accepted: {verdict.accepted_answers.join(', ')}</>}
        </p>
      )}
      {verdict?.explanation && <p className="lms-question__why"><i className="fas fa-lightbulb" aria-hidden="true" /> {verdict.explanation}</p>}
    </fieldset>
  );
};

/** Counts down to the deadline; calls onEnd once when time is up. */
const Timer = ({ deadline, onEnd }) => {
  const [left, setLeft] = useState(() => secondsUntil(deadline));
  const ended = useRef(false);
  useEffect(() => {
    const tick = setInterval(() => {
      const s = secondsUntil(deadline);
      setLeft(s);
      if (s <= 0 && !ended.current) {
        ended.current = true;
        onEnd();
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [deadline, onEnd]);
  return (
    <span className={`quiz-timer${left <= 60 ? ' is-low' : ''}`} role="timer" aria-live={left <= 60 ? 'polite' : 'off'}>
      <i className="far fa-clock" aria-hidden="true" /> {clock(left)} left
    </span>
  );
};

/**
 * A quiz lesson: the intro (pass mark, time limit, attempts, best score), the questions of an attempt with an optional
 * countdown, and the marked result. `onProgress` gets the server's progress after each submission.
 */
export const QuizRunner = ({ lesson, canTrack, onProgress }) => {
  const quiz = lesson.quiz || { pass_mark: lesson.pass_mark, record: {} };
  const [record, setRecord] = useState(quiz.record || {});
  const [attempt, setAttempt] = useState(quiz.attempt || null);
  const [answers, setAnswers] = useState(() => (quiz.attempt ? readAnswers(quiz.attempt.id) : {}));
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // The timer's auto-submit needs the latest answers without restarting the countdown
  const answersRef = useRef(answers);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  const setAnswer = (qid, value) => {
    setAnswers((a) => {
      const next = { ...a, [qid]: value };
      if (attempt) saveAnswers(attempt.id, next);
      return next;
    });
  };

  const start = async () => {
    setBusy(true);
    setError('');
    try {
      const { data } = await lmsAPI.startQuiz(lesson.id);
      setAttempt(data);
      setAnswers(readAnswers(data.id));
      setResult(null);
    } catch (err) {
      setError(parseApiErrors(err).form || 'The quiz could not be started.');
    } finally {
      setBusy(false);
    }
  };

  const submit = useCallback(async () => {
    if (!attempt) return;
    setBusy(true);
    setError('');
    try {
      const { data } = await lmsAPI.submitQuiz(lesson.id, answersRef.current, attempt.id);
      saveAnswers(attempt.id, null);
      setResult({ ...data, questions: attempt.questions, answers: answersRef.current });
      setRecord(data.record);
      setAttempt(null);
      onProgress(data);
    } catch (err) {
      setError(parseApiErrors(err).form || 'Your answers could not be submitted. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [attempt, lesson.id, onProgress]);

  // Previews (not enrolled): the questions, read-only
  if (!canTrack) {
    const questions = lesson.questions || [];
    return (
      <div className="lms-quiz">
        <Alert type="info">Enrol on this course to take its quizzes.</Alert>
        {questions.map((q, i) => <QuestionField key={q.id} q={q} index={i} value={null} onChange={() => {}} disabled />)}
      </div>
    );
  }

  if (attempt) {
    const total = attempt.questions.length;
    const done = attempt.questions.filter((q) => answered(answers[q.id])).length;
    return (
      <form className="lms-quiz" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="quiz-bar">
          <span>{done} of {total} answered</span>
          <span className="lms-progress lms-progress--small"><span style={{ width: `${total ? (100 * done) / total : 0}%` }} /></span>
          {attempt.deadline && <Timer deadline={attempt.deadline} onEnd={submit} />}
        </div>
        {attempt.questions.map((q, i) => (
          <QuestionField key={q.id} q={q} index={i} value={answers[q.id]} onChange={(v) => setAnswer(q.id, v)} disabled={busy} />
        ))}
        <Alert>{error}</Alert>
        <div className="quiz-actions">
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? <span className="btn-spinner" /> : <i className="fas fa-paper-plane" />} Submit answers
          </button>
          {done < total && <small className="muted">{total - done} unanswered {total - done === 1 ? 'question counts' : 'questions count'} as wrong.</small>}
        </div>
      </form>
    );
  }

  if (result) {
    const byId = Object.fromEntries(result.results.map((r) => [r.question_id, r]));
    return (
      <div className="lms-quiz">
        <div className={`lms-quiz__result${result.passed ? ' is-pass' : ' is-fail'}`} role="status">
          <i className={`fas ${result.passed ? 'fa-circle-check' : 'fa-circle-xmark'}`} aria-hidden="true" />
          <div>
            <strong>{result.passed ? 'You passed!' : 'Not quite yet.'} You scored {result.score_percent}% ({result.points}/{result.max_points} points).</strong>
            <span>
              {result.late ? 'Time ran out before your answers arrived. ' : ''}
              {result.passed ? 'This lesson is now complete.' : `You need ${result.pass_mark}% to pass.`}
              {record.attempts_left != null && ` ${record.attempts_left} ${record.attempts_left === 1 ? 'attempt' : 'attempts'} left.`}
            </span>
          </div>
        </div>
        {result.show_answers ? (
          result.questions.map((q, i) => <QuestionField key={q.id} q={q} index={i} value={result.answers[q.id]} onChange={() => {}} verdict={byId[q.id]} disabled />)
        ) : (
          <p className="muted">Your instructor keeps the answers private for this quiz.</p>
        )}
        {record.attempts_left !== 0 && (
          <button type="button" className="btn btn--outline" onClick={start} disabled={busy}><i className="fas fa-rotate-right" /> {result.passed ? 'Take it again' : 'Try again'}</button>
        )}
      </div>
    );
  }

  const count = quiz.question_count ?? (lesson.questions || []).length;
  return (
    <div className="lms-quiz quiz-intro">
      <ul className="quiz-facts">
        <li><i className="fas fa-list-ol" aria-hidden="true" /> {count} {count === 1 ? 'question' : 'questions'}</li>
        <li><i className="fas fa-bullseye" aria-hidden="true" /> {quiz.pass_mark}% to pass</li>
        <li><i className="far fa-clock" aria-hidden="true" /> {quiz.time_limit_minutes ? `${quiz.time_limit_minutes} minute time limit` : 'No time limit'}</li>
        <li><i className="fas fa-rotate" aria-hidden="true" /> {quiz.max_attempts ? `${record.attempts_left ?? quiz.max_attempts} of ${quiz.max_attempts} attempts left` : 'Unlimited attempts'}</li>
      </ul>
      {record.attempts > 0 && (
        <p className="quiz-record">
          {record.passed ? <span className="badge badge--green"><i className="fas fa-check" /> Passed{record.passed_at ? ` on ${formatDate(record.passed_at)}` : ''}</span> : <span className="badge badge--amber">Not passed yet</span>}
          {' '}Best score <strong>{record.best_score}%</strong> · last score {record.last?.score_percent}% · {record.attempts} {record.attempts === 1 ? 'attempt' : 'attempts'}
        </p>
      )}
      {quiz.time_limit_minutes > 0 && <p className="muted small">The timer starts when you press Start and keeps running if you leave the page. Your answers are sent automatically when time runs out.</p>}
      <Alert>{error}</Alert>
      {record.attempts_left === 0 ? (
        <Alert type="info">You’ve used all your attempts at this quiz.</Alert>
      ) : (
        <button type="button" className="btn btn--primary" onClick={start} disabled={busy || !count}>
          {busy ? <span className="btn-spinner" /> : <i className="fas fa-play" />} {record.attempts ? 'Start a new attempt' : 'Start quiz'}
        </button>
      )}
    </div>
  );
};

export default QuizRunner;

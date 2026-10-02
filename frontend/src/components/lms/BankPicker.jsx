import { useEffect, useState } from 'react';
import { lmsAPI } from '../../services/api';
import { DIFFICULTIES, TYPE_LABEL } from '../../utils/questions';
import { Alert } from '../ui/Form';
import '../../styles/question-banks.css';

/**
 * Pick questions from a question bank to copy into a quiz. `onAdd(questions)` gets the server's questions;
 * the quiz keeps its own copies, so later bank edits don't change the quiz.
 */
export const BankPicker = ({ banks, onAdd, onClose }) => {
  const [bankId, setBankId] = useState(banks[0]?.id || '');
  const [filters, setFilters] = useState({ category: '', difficulty: '' });
  const [bank, setBank] = useState(null);
  const [picked, setPicked] = useState(() => new Set());
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!bankId) return;
    let live = true;
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    lmsAPI.bank(bankId, params)
      .then(({ data }) => live && (setBank(data), setError('')))
      .catch(() => live && setError('That bank could not be loaded.'));
    return () => { live = false; };
  }, [bankId, filters]);

  const questions = bank?.questions || [];
  const toggle = (id) => setPicked((set) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allPicked = questions.length > 0 && questions.every((q) => picked.has(q.id));
  const toggleAll = () => setPicked((set) => {
    const next = new Set(set);
    questions.forEach((q) => (allPicked ? next.delete(q.id) : next.add(q.id)));
    return next;
  });
  const chosen = questions.filter((q) => picked.has(q.id));

  return (
    <div className="modal la-dialog bp-dialog" role="dialog" aria-modal="true" aria-labelledby="bank-picker-title">
      <button type="button" className="modal__backdrop" aria-label="Close" onClick={onClose} />
      <div className="modal__card">
        <h2 id="bank-picker-title">Add questions from a bank</h2>
        <p className="muted small">The quiz gets its own copies: editing the bank later won’t change this quiz.</p>
        <div className="bp-filters">
          <select className="input" aria-label="Question bank" value={bankId} onChange={(e) => { setBankId(e.target.value); setPicked(new Set()); setFilters({ category: '', difficulty: '' }); }}>
            {banks.map((b) => <option key={b.id} value={b.id}>{b.title} ({b.question_count})</option>)}
          </select>
          <select className="input" aria-label="Category" value={filters.category} onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}>
            <option value="">All categories</option>
            {(bank?.categories || []).map((c) => <option key={c.id} value={c.id}>{c.name} ({c.count})</option>)}
          </select>
          <select className="input" aria-label="Difficulty" value={filters.difficulty} onChange={(e) => setFilters((f) => ({ ...f, difficulty: e.target.value }))}>
            <option value="">Any difficulty</option>
            {DIFFICULTIES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
        </div>
        <Alert>{error}</Alert>
        {bank && questions.length === 0 && <p className="muted">No questions match.</p>}
        {questions.length > 0 && (
          <>
            <label className="qb-check bp-all"><input type="checkbox" checked={allPicked} onChange={toggleAll} /> Select all {questions.length}</label>
            <ul className="bp-list">
              {questions.map((q) => (
                <li key={q.id}>
                  <label>
                    <input type="checkbox" checked={picked.has(q.id)} onChange={() => toggle(q.id)} />
                    <span>
                      <strong>{q.text}</strong>
                      <small className="muted">{TYPE_LABEL[q.kind]} · <span className={`qbk-diff qbk-diff--${q.difficulty}`}>{q.difficulty}</span>{q.category_name ? ` · ${q.category_name}` : ''}</small>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="modal__actions">
          <button type="button" className="btn btn--outline" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn--primary" disabled={!chosen.length} onClick={() => onAdd(chosen)}>
            <i className="fas fa-plus" /> Add {chosen.length || ''} {chosen.length === 1 ? 'question' : 'questions'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BankPicker;

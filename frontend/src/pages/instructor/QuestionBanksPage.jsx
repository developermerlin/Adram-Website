import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { lmsAPI, parseApiErrors } from '../../services/api';
import { formatDate } from '../../utils/format';
import PortalLayout from '../../components/layout/PortalLayout';
import { Alert } from '../../components/ui/Form';
import '../../styles/question-banks.css';

/** /instructor/question-banks (and /admin/question-banks): the banks of reusable quiz questions. */
export const QuestionBanksPage = () => {
  const base = useLocation().pathname.startsWith('/admin') ? '/admin/question-banks' : '/instructor/question-banks';
  const [banks, setBanks] = useState(null);
  const [form, setForm] = useState({ title: '', description: '' });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => lmsAPI.banks().then(({ data }) => setBanks(data)).catch(() => setError('Your question banks could not be loaded.')), []);
  useEffect(() => {
    load();
  }, [load]);

  const create = async (e) => {
    e.preventDefault();
    setCreating(true);
    setError('');
    try {
      await lmsAPI.createBank(form);
      setForm({ title: '', description: '' });
      toast.success('Question bank created.');
      load();
    } catch (err) {
      setError(parseApiErrors(err).title || 'The bank could not be created.');
    } finally {
      setCreating(false);
    }
  };

  const remove = async (bank) => {
    if (!window.confirm(`Delete "${bank.title}" and its ${bank.question_count} questions?`)) return;
    try {
      await lmsAPI.removeBank(bank.id);
    } catch (err) {
      if (err.response?.status !== 409 || !window.confirm(`${err.response.data.detail}\n\nDelete it anyway?`)) return;
      await lmsAPI.removeBank(bank.id, true);
    }
    toast.success('Question bank deleted.');
    load();
  };

  return (
    <PortalLayout title="Question banks" subtitle="Keep reusable questions in one place. Quizzes copy them, or draw random ones on every attempt.">
      <form className="card panel qbk-create" onSubmit={create}>
        <h2 className="h3">New question bank</h2>
        <div className="qbk-create__row">
          <input className="input" placeholder="Name, e.g. Networking basics" aria-label="Bank name" value={form.title} maxLength={200} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <input className="input" placeholder="What it covers (optional)" aria-label="Description" value={form.description} maxLength={500} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          <button type="submit" className="btn btn--primary" disabled={creating || !form.title.trim()}><i className="fas fa-plus" /> Create</button>
        </div>
      </form>
      <Alert>{error}</Alert>
      {banks && banks.length === 0 && (
        <div className="card panel empty-state">
          <i className="fas fa-box-archive" aria-hidden="true" />
          <p>No question banks yet. Create one above, then add questions or import them from a spreadsheet.</p>
        </div>
      )}
      <div className="qbk-grid">
        {!banks && [0, 1, 2].map((i) => <div key={i} className="card skeleton skeleton--block" />)}
        {banks?.map((b) => (
          <article key={b.id} className="card qbk-card">
            <Link to={`${base}/${b.id}`} className="qbk-card__title"><i className="fas fa-box-archive" aria-hidden="true" /> {b.title}</Link>
            {b.description && <p className="muted small">{b.description}</p>}
            <p className="qbk-card__meta">
              <span><strong>{b.question_count}</strong> {b.question_count === 1 ? 'question' : 'questions'}</span>
              <span><strong>{b.category_count}</strong> {b.category_count === 1 ? 'category' : 'categories'}</span>
            </p>
            <small className="muted">{b.course ? `${b.course.title} · ` : ''}Updated {formatDate(b.updated_at)}{base.startsWith('/admin') ? ` · ${b.owner}` : ''}</small>
            <div className="qbk-card__actions">
              <Link to={`${base}/${b.id}`} className="btn btn--outline btn--sm">Open</Link>
              <button type="button" className="icon-btn icon-btn--danger" aria-label={`Delete ${b.title}`} onClick={() => remove(b)}><i className="fas fa-trash-can" /></button>
            </div>
          </article>
        ))}
      </div>
    </PortalLayout>
  );
};

export default QuestionBanksPage;

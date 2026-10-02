import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { lmsAPI, parseApiErrors } from '../../services/api';
import { DIFFICULTIES, TYPES, TYPE_LABEL, blankQuestion, fromServer, toServer } from '../../utils/questions';
import PortalLayout from '../../components/layout/PortalLayout';
import { Alert } from '../../components/ui/Form';
import { QuestionFields } from '../../components/lms/QuestionEditor';
import '../../styles/question-banks.css';

const save = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** How students do on a question: hard for them (under 40% right), easy (90% or more), or not asked yet. */
const Stat = ({ stats }) => {
  if (!stats.answered) return <span className="qbk-stat muted">Not asked yet</span>;
  const tone = stats.percent < 40 ? 'is-low' : stats.percent >= 90 ? 'is-high' : '';
  return (
    <span className={`qbk-stat ${tone}`} title={`${stats.correct} of ${stats.answered} answers right`}>
      <i className="fas fa-chart-simple" aria-hidden="true" /> {stats.percent}% right · {stats.answered} {stats.answered === 1 ? 'answer' : 'answers'}
      {tone === 'is-low' && <strong> · hard for students</strong>}
    </span>
  );
};

/** One question being written or edited, with the bank's category picker. */
const Editor = ({ initial, categories, onSave, onCancel }) => {
  const [q, setQ] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await onSave({ ...toServer(q), category: q.category || null });
    } catch (err) {
      setError(parseApiErrors(err).detail || parseApiErrors(err).form || 'The question could not be saved.');
      setBusy(false);
    }
  };
  const category = (
    <select className="input" aria-label="Category" value={q.category || ''} onChange={(e) => setQ((x) => ({ ...x, category: e.target.value ? Number(e.target.value) : null }))}>
      <option value="">No category</option>
      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  );
  return (
    <div className="lb-question qbk-editor">
      <QuestionFields q={q} index={0} name={`bank-${initial.id || 'new'}`} onChange={(patch) => setQ((x) => ({ ...x, ...patch }))} extra={category} />
      <Alert>{error}</Alert>
      <div className="qbk-editor__actions">
        <button type="button" className="btn btn--outline btn--sm" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn--primary btn--sm" onClick={submit} disabled={busy}>
          {busy ? <span className="btn-spinner" /> : <i className="fas fa-floppy-disk" />} Save question
        </button>
      </div>
    </div>
  );
};

/** /instructor/question-banks/:id: one bank's categories and questions, with CSV import and per-question results. */
export const QuestionBankPage = () => {
  const { id } = useParams();
  const base = useLocation().pathname.startsWith('/admin') ? '/admin/question-banks' : '/instructor/question-banks';
  const [bank, setBank] = useState(null);
  const [filters, setFilters] = useState({ category: '', difficulty: '', kind: '', q: '' });
  const [editing, setEditing] = useState(null); // question id, or 'new'
  const [newKind, setNewKind] = useState('single');
  const [newCategory, setNewCategory] = useState('');
  const [imported, setImported] = useState(null);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const load = useCallback(() => {
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    return lmsAPI.bank(id, params).then(({ data }) => { setBank(data); setError(''); })
      .catch((err) => setError(err.response?.status === 404 ? 'This question bank does not exist, or is not yours.' : 'The bank could not be loaded.'));
  }, [id, filters]);
  useEffect(() => {
    load();
  }, [load]);

  const setFilter = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));
  const categories = bank?.categories || [];

  const addCategory = async (e) => {
    e.preventDefault();
    try {
      await lmsAPI.addBankCategory(id, newCategory.trim());
      setNewCategory('');
      load();
    } catch (err) {
      toast.error(parseApiErrors(err).name || 'The category could not be added.');
    }
  };
  const renameCategory = async (c) => {
    const name = window.prompt('Rename the category', c.name);
    if (!name || name.trim() === c.name) return;
    try {
      await lmsAPI.renameBankCategory(c.id, name.trim());
      load();
    } catch (err) {
      toast.error(parseApiErrors(err).name || 'The category could not be renamed.');
    }
  };
  const removeCategory = async (c) => {
    if (!window.confirm(`Delete the category "${c.name}"? Its ${c.count} questions stay in the bank without a category.`)) return;
    await lmsAPI.removeBankCategory(c.id);
    if (String(filters.category) === String(c.id)) setFilters((f) => ({ ...f, category: '' }));
    load();
  };

  const saveQuestion = async (question, data) => {
    if (question) await lmsAPI.updateBankQuestion(question.id, data);
    else await lmsAPI.addBankQuestion(id, data);
    setEditing(null);
    toast.success(question ? 'Question saved.' : 'Question added.');
    load();
  };
  const removeQuestion = async (question) => {
    if (!window.confirm('Delete this question from the bank? Quizzes that copied it keep their copy.')) return;
    await lmsAPI.removeBankQuestion(question.id);
    load();
  };

  const importFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImported({ busy: true });
    try {
      const { data } = await lmsAPI.importBank(id, file);
      setImported(data);
      load();
    } catch (err) {
      const data = err.response?.data;
      setImported(data?.errors ? data : { created: 0, errors: [], message: parseApiErrors(err).file || 'The file could not be imported.' });
    }
  };
  const template = async () => {
    try {
      const { data } = await lmsAPI.bankTemplate();
      save(data, 'question-bank-template.csv');
    } catch {
      toast.error('The template could not be downloaded.');
    }
  };

  const total = bank?.question_count || 0;
  return (
    <PortalLayout title={bank?.title || 'Question bank'} subtitle={bank?.description || 'Reusable questions for your quizzes.'}>
      <Link to={base} className="back-link"><i className="fas fa-arrow-left" /> All question banks</Link>
      <Alert>{error}</Alert>
      {bank && (
        <>
          <section className="card panel qbk-head">
            <div className="qbk-head__stats">
              <span><strong>{total}</strong> {total === 1 ? 'question' : 'questions'}</span>
              {DIFFICULTIES.map(([d, label]) => <span key={d} className={`qbk-diff qbk-diff--${d}`}>{bank.by_difficulty[d]} {label.toLowerCase()}</span>)}
            </div>
            <div className="qbk-head__actions">
              <button type="button" className="btn btn--outline btn--sm" onClick={template}><i className="fas fa-file-arrow-down" /> CSV template</button>
              <button type="button" className="btn btn--outline btn--sm" onClick={() => fileRef.current?.click()} disabled={imported?.busy}>
                {imported?.busy ? <span className="btn-spinner" /> : <i className="fas fa-file-import" />} Import CSV
              </button>
              <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={importFile} />
            </div>
            {bank.used_by.length > 0 && (
              <p className="small muted qbk-used"><i className="fas fa-shuffle" aria-hidden="true" /> Quizzes drawing from this bank: {bank.used_by.map((u) => `${u.lesson} (${u.course})`).join(', ')}</p>
            )}
          </section>

          {imported && !imported.busy && (
            <Alert type={imported.created ? 'success' : 'error'}>
              {imported.message || `${imported.created} ${imported.created === 1 ? 'question' : 'questions'} imported.`}
              {imported.errors?.length > 0 && (
                <ul className="qbk-import-errors">
                  {imported.errors.map((e) => <li key={e.row}>Row {e.row}: {e.message}</li>)}
                </ul>
              )}
            </Alert>
          )}

          <section className="card panel">
            <div className="panel__head"><h2 className="h3">Categories</h2></div>
            <div className="qbk-cats">
              <button type="button" className={`qbk-cat${!filters.category ? ' is-on' : ''}`} onClick={() => setFilters((f) => ({ ...f, category: '' }))}>All</button>
              {categories.map((c) => (
                <span key={c.id} className={`qbk-cat${String(filters.category) === String(c.id) ? ' is-on' : ''}`}>
                  <button type="button" onClick={() => setFilters((f) => ({ ...f, category: String(c.id) }))}>{c.name} <small>{c.count}</small></button>
                  <button type="button" className="qbk-cat__tool" aria-label={`Rename ${c.name}`} onClick={() => renameCategory(c)}><i className="fas fa-pen" /></button>
                  <button type="button" className="qbk-cat__tool" aria-label={`Delete ${c.name}`} onClick={() => removeCategory(c)}><i className="fas fa-xmark" /></button>
                </span>
              ))}
              <button type="button" className={`qbk-cat${filters.category === 'none' ? ' is-on' : ''}`} onClick={() => setFilters((f) => ({ ...f, category: 'none' }))}>No category</button>
              <form className="qbk-cats__add" onSubmit={addCategory}>
                <input className="input" placeholder="New category" aria-label="New category" value={newCategory} maxLength={120} onChange={(e) => setNewCategory(e.target.value)} />
                <button type="submit" className="btn btn--outline btn--sm" disabled={!newCategory.trim()}><i className="fas fa-plus" /> Add</button>
              </form>
            </div>
          </section>

          <section className="card panel">
            <div className="panel__head">
              <h2 className="h3">Questions</h2>
              <div className="qbk-new">
                <select className="input" aria-label="Type of the new question" value={newKind} onChange={(e) => setNewKind(e.target.value)}>
                  {TYPES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
                <button type="button" className="btn btn--primary btn--sm" onClick={() => setEditing('new')}><i className="fas fa-plus" /> New question</button>
              </div>
            </div>
            <div className="qbk-filters">
              <input className="input" type="search" placeholder="Search questions" aria-label="Search questions" value={filters.q} onChange={setFilter('q')} />
              <select className="input" aria-label="Difficulty" value={filters.difficulty} onChange={setFilter('difficulty')}>
                <option value="">Any difficulty</option>
                {DIFFICULTIES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
              </select>
              <select className="input" aria-label="Type" value={filters.kind} onChange={setFilter('kind')}>
                <option value="">Any type</option>
                {TYPES.map(([v]) => <option key={v} value={v}>{TYPE_LABEL[v]}</option>)}
              </select>
            </div>

            {editing === 'new' && (
              <Editor key={`new-${newKind}`} initial={{ ...blankQuestion(newKind), category: filters.category && filters.category !== 'none' ? Number(filters.category) : null }}
                categories={categories} onCancel={() => setEditing(null)} onSave={(data) => saveQuestion(null, data)} />
            )}
            {bank.questions.length === 0 && editing !== 'new' && (
              <p className="muted">{total ? 'No questions match these filters.' : 'No questions yet. Add one, or import a spreadsheet using the CSV template.'}</p>
            )}
            <ol className="qbk-list">
              {bank.questions.map((q) => (
                <li key={q.id}>
                  {editing === q.id ? (
                    <Editor initial={fromServer(q)} categories={categories} onCancel={() => setEditing(null)} onSave={(data) => saveQuestion(q, data)} />
                  ) : (
                    <div className="qbk-q">
                      <div className="qbk-q__body">
                        <p className="qbk-q__text">{q.text}</p>
                        <p className="qbk-q__meta">
                          <span className="badge badge--gray">{TYPE_LABEL[q.kind]}</span>
                          <span className={`qbk-diff qbk-diff--${q.difficulty}`}>{q.difficulty}</span>
                          {q.category_name && <span className="muted"><i className="fas fa-folder" aria-hidden="true" /> {q.category_name}</span>}
                          <span className="muted">{q.points} {q.points === 1 ? 'point' : 'points'}</span>
                          <Stat stats={q.stats} />
                        </p>
                      </div>
                      <div className="qbk-q__tools">
                        <button type="button" className="icon-btn" aria-label="Edit question" onClick={() => setEditing(q.id)}><i className="fas fa-pen" /></button>
                        <button type="button" className="icon-btn icon-btn--danger" aria-label="Delete question" onClick={() => removeQuestion(q)}><i className="fas fa-trash-can" /></button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </PortalLayout>
  );
};

export default QuestionBankPage;

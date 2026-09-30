/** Frequently asked questions for a course page: add, edit, reorder and remove question/answer pairs. */
export const FaqEditor = ({ items, onChange, error }) => {
  const update = (i, patch) => onChange(items.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const move = (i, step) => {
    const next = [...items];
    [next[i], next[i + step]] = [next[i + step], next[i]];
    onChange(next);
  };
  return (
    <div className="faq-editor">
      {items.length === 0 && <p className="muted small">No questions yet. Answer what students ask most, e.g. “Is this course suitable for beginners?”.</p>}
      {items.map((f, i) => (
        <fieldset key={i} className="faq-editor__item">
          <legend>Question {i + 1}</legend>
          <div className="faq-editor__tools">
            <button type="button" className="icon-btn" aria-label={`Move question ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}><i className="fas fa-arrow-up" /></button>
            <button type="button" className="icon-btn" aria-label={`Move question ${i + 1} down`} disabled={i === items.length - 1} onClick={() => move(i, 1)}><i className="fas fa-arrow-down" /></button>
            <button type="button" className="icon-btn icon-btn--danger" aria-label={`Remove question ${i + 1}`} onClick={() => onChange(items.filter((_, j) => j !== i))}><i className="fas fa-trash-can" /></button>
          </div>
          <input className="input" value={f.question} maxLength={300} placeholder="Question" aria-label={`Question ${i + 1}`} onChange={(e) => update(i, { question: e.target.value })} />
          <textarea className="input" rows={2} value={f.answer} maxLength={2000} placeholder="Answer" aria-label={`Answer ${i + 1}`} onChange={(e) => update(i, { answer: e.target.value })} />
        </fieldset>
      ))}
      {error && <p className="field-error">{error}</p>}
      <button type="button" className="btn btn--outline btn--sm" onClick={() => onChange([...items, { question: '', answer: '' }])} disabled={items.length >= 30}>
        <i className="fas fa-plus" /> Add a question
      </button>
    </div>
  );
};

export default FaqEditor;

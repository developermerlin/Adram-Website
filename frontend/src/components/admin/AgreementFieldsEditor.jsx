const TYPE_LABELS = { text: 'Short text', long: 'Long text', date: 'Date', email: 'Email', tel: 'Phone', number: 'Number' };

/**
 * Edits a list of fields the student fills in on the service agreement: [{id, label, type, required, prefill}].
 * `sources` are the "Fill in from" choices: [{value, label}].
 */
export const AgreementFieldsEditor = ({ fields, onChange, sources, types, addLabel = 'Add a field' }) => {
  const update = (i, patch) => onChange(fields.map((f, k) => (k === i ? { ...f, ...patch } : f)));
  const move = (i, step) => {
    const next = [...fields];
    [next[i], next[i + step]] = [next[i + step], next[i]];
    onChange(next);
  };
  const known = new Set(sources.map((s) => s.value));
  return (
    <>
      <ol className="agf-list">
        {fields.map((f, i) => (
          <li key={f.id || i} className="agf">
            <div className="agf__row">
              <input className="input agf__label" value={f.label} maxLength={80} placeholder="Label, e.g. Date" aria-label={`Field ${i + 1} label`}
                onChange={(e) => update(i, { label: e.target.value })} />
              <span className="afb-q__tools">
                <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><i className="fas fa-arrow-up" /></button>
                <button type="button" aria-label="Move down" disabled={i === fields.length - 1} onClick={() => move(i, 1)}><i className="fas fa-arrow-down" /></button>
                <button type="button" aria-label="Delete field" className="afb-danger" disabled={fields.length === 1}
                  onClick={() => onChange(fields.filter((_, k) => k !== i))}><i className="fas fa-trash-can" /></button>
              </span>
            </div>
            <div className="agf__row agf__opts">
              <label><span>Type</span>
                <select className="input" value={f.type} onChange={(e) => update(i, { type: e.target.value })}>
                  {types.map((t) => <option key={t} value={t}>{TYPE_LABELS[t] || t}</option>)}
                </select>
              </label>
              <label><span>Fill in from</span>
                <select className="input" value={f.prefill || ''} onChange={(e) => update(i, { prefill: e.target.value })}>
                  {!known.has(f.prefill || '') && <option value={f.prefill}>{f.prefill}</option>}
                  {sources.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </label>
              <label className="checkbox agf__req">
                <input type="checkbox" checked={f.required} onChange={(e) => update(i, { required: e.target.checked })} />
                <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span>
                <span>Required</span>
              </label>
            </div>
          </li>
        ))}
      </ol>
      <button type="button" className="btn btn--outline btn--sm"
        onClick={() => onChange([...fields, { id: '', label: '', type: 'text', required: true, prefill: '' }])}>
        <i className="fas fa-plus" /> {addLabel}
      </button>
    </>
  );
};

export default AgreementFieldsEditor;

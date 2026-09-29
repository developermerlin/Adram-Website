import { useEffect, useRef } from 'react';

// Shared by the Scholarships and Training admin pages. kind: 'scholarships' | 'courses'

export const PublishBadge = ({ published }) =>
  published ? (
    <span className="badge badge--green"><i className="fas fa-globe" /> Published</span>
  ) : (
    <span className="badge badge--gray"><i className="fas fa-eye-slash" /> Draft</span>
  );

/** Edits a list of short lines (what an award covers, application steps…). */
export const ListEditor = ({ id, label, hint, items, onChange, placeholder, error, max = 30, maxLength = 300, numbered = false }) => {
  const refs = useRef([]);
  const focusIndex = useRef(null);

  useEffect(() => {
    if (focusIndex.current !== null) {
      refs.current[focusIndex.current]?.focus();
      focusIndex.current = null;
    }
  });

  const update = (index, value) => onChange(items.map((x, i) => (i === index ? value : x)));
  const insertAfter = (index) => {
    if (items.length >= max) return;
    focusIndex.current = index + 1;
    onChange([...items.slice(0, index + 1), '', ...items.slice(index + 1)]);
  };
  const removeAt = (index) => {
    focusIndex.current = Math.max(0, index - 1);
    onChange(items.filter((_, i) => i !== index));
  };
  const swap = (index, step) => {
    const next = [...items];
    [next[index], next[index + step]] = [next[index + step], next[index]];
    focusIndex.current = index + step;
    onChange(next);
  };

  return (
    <fieldset className="list-editor" aria-describedby={hint ? `${id}-hint` : undefined}>
      <legend>{label}</legend>
      {hint && <p className="hint" id={`${id}-hint`}>{hint}</p>}
      {items.length > 0 && (
        <ol className={`list-editor__rows${numbered ? ' is-numbered' : ''}`}>
          {items.map((value, i) => (
            // Index keys are fine: rows are plain controlled inputs.
            <li key={i} className="list-editor__row">
              {numbered && <span className="list-editor__num" aria-hidden="true">{i + 1}</span>}
              <input
                ref={(el) => (refs.current[i] = el)}
                className="input"
                value={value}
                maxLength={maxLength}
                placeholder={placeholder}
                aria-label={`${label}, item ${i + 1}`}
                onChange={(e) => update(i, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    insertAfter(i);
                  } else if (e.key === 'Backspace' && value === '' && items.length > 1) {
                    e.preventDefault();
                    removeAt(i);
                  }
                }}
              />
              <span className="list-editor__tools">
                <button type="button" className="icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => swap(i, -1)}>
                  <i className="fas fa-arrow-up" />
                </button>
                <button type="button" className="icon-btn" aria-label="Move down" disabled={i === items.length - 1} onClick={() => swap(i, 1)}>
                  <i className="fas fa-arrow-down" />
                </button>
                <button type="button" className="icon-btn icon-btn--danger" aria-label={`Remove item ${i + 1}`} onClick={() => removeAt(i)}>
                  <i className="fas fa-xmark" />
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
      {error && <p className="field-error">{error}</p>}
      <button type="button" className="btn btn--text btn--sm" disabled={items.length >= max} onClick={() => insertAfter(items.length - 1)}>
        <i className="fas fa-plus" /> Add {items.length ? 'another' : 'an item'}
      </button>
    </fieldset>
  );
};

const PRESETS = ['Applications open', 'Application deadline', 'Interviews', 'Results announced', 'Studies begin'];

/** Key dates: each has a label and either an exact date or a description ("Typically June"). */
export const TimelineEditor = ({ entries, onChange, error }) => {
  const update = (i, patch) => onChange(entries.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  const add = (label = '') => onChange([...entries, { label, date: null, text: '' }]);
  const move = (i, step) => {
    const next = [...entries];
    [next[i], next[i + step]] = [next[i + step], next[i]];
    onChange(next);
  };
  const unused = PRESETS.filter((p) => !entries.some((e) => e.label === p));

  return (
    <fieldset className="list-editor timeline-editor">
      <legend>Key dates</legend>
      <p className="hint">Shown as a timeline on the scholarship page and in students’ applications. Use an exact date when it’s confirmed, otherwise describe when it usually happens.</p>
      {entries.length > 0 && (
        <ol className="timeline-editor__rows">
          {entries.map((e, i) => (
            // Index keys are fine: rows are plain controlled inputs.
            <li key={i} className="timeline-editor__row">
              <input className="input" aria-label={`Key date ${i + 1}: what happens`} placeholder="What happens, e.g. Interviews" maxLength={100} value={e.label} onChange={(ev) => update(i, { label: ev.target.value })} />
              <input className="input" type="date" aria-label={`Key date ${i + 1}: date`} value={e.date || ''} onChange={(ev) => update(i, { date: ev.target.value || null })} />
              <input className="input" aria-label={`Key date ${i + 1}: or when`} placeholder="or e.g. Typically June" maxLength={100} value={e.text || ''} disabled={Boolean(e.date)} onChange={(ev) => update(i, { text: ev.target.value })} />
              <span className="list-editor__tools">
                <button type="button" className="icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><i className="fas fa-arrow-up" /></button>
                <button type="button" className="icon-btn" aria-label="Move down" disabled={i === entries.length - 1} onClick={() => move(i, 1)}><i className="fas fa-arrow-down" /></button>
                <button type="button" className="icon-btn icon-btn--danger" aria-label={`Remove key date ${i + 1}`} onClick={() => onChange(entries.filter((_, j) => j !== i))}><i className="fas fa-xmark" /></button>
              </span>
            </li>
          ))}
        </ol>
      )}
      {error && <p className="field-error">Each key date needs a name and a date (or a description of when).</p>}
      <div className="timeline-editor__add">
        {unused.map((p) => (
          <button key={p} type="button" className="chip" onClick={() => add(p)}><i className="fas fa-plus" /> {p}</button>
        ))}
        <button type="button" className="btn btn--text btn--sm" onClick={() => add()}><i className="fas fa-plus" /> Other date</button>
      </div>
    </fieldset>
  );
};

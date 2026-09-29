import { useState } from 'react';
import { Link } from 'react-router-dom';
import { destinations, FUNDING, LEVELS } from '../../data/scholarships';
import Flag from '../ui/Flag';
import { OfficialLink } from '../ui/ScholarshipActions';
import { DeadlineBadge } from '../ui/KeyDates';

/** Compact scholarship row (saved and recommended lists); `actions` renders the buttons on the right. */
export const ScholarshipRow = ({ scholarship: s, children, note }) => (
  <li className="sch-row">
    <Flag code={s.country} size={32} />
    <div className="sch-row__main">
      <Link to={`/scholarships/${s.slug}`} className="sch-row__name">{s.name}</Link>
      <span className="sch-row__meta">
        {s.country_name} · {s.levels.join(', ')} · {FUNDING[s.funding]}
      </span>
      <DeadlineBadge scholarship={s} compact />
      {note && <span className="sch-row__note">{note}</span>}
    </div>
    <div className="sch-row__actions">
      <OfficialLink scholarship={s} className="icon-btn" >
        <i className="fas fa-arrow-up-right-from-square" title="Official website" />
      </OfficialLink>
      {children}
    </div>
  </li>
);

/** Study goals: editable for the student, read-only in the admin's view. */
export const StudyGoalsForm = ({ goals, onSave, readOnly = false }) => {
  const [form, setForm] = useState({ levels: goals.levels || [], destinations: goals.destinations || [], field_of_study: goals.field_of_study || '' });
  const [saving, setSaving] = useState(false);
  const toggle = (key, value) =>
    setForm((f) => ({ ...f, [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value] }));
  const changed = JSON.stringify(form) !== JSON.stringify({ levels: goals.levels || [], destinations: goals.destinations || [], field_of_study: goals.field_of_study || '' });

  if (readOnly) {
    const none = !form.levels.length && !form.destinations.length && !form.field_of_study;
    return none ? (
      <p className="muted">The student hasn’t set any study goals yet.</p>
    ) : (
      <dl className="kv">
        <div><dt>Level</dt><dd>{form.levels.join(', ') || '—'}</dd></div>
        <div><dt>Destinations</dt><dd>{form.destinations.map((d) => destinations[d]?.name || d).join(', ') || '—'}</dd></div>
        <div><dt>Field of study</dt><dd>{form.field_of_study || '—'}</dd></div>
      </dl>
    );
  }

  return (
    <form
      className="goals-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        await onSave(form);
        setSaving(false);
      }}
    >
      <fieldset>
        <legend>Level of study</legend>
        <div className="chip-row">
          {LEVELS.map((l) => (
            <button key={l} type="button" className={`chip${form.levels.includes(l) ? ' is-active' : ''}`} aria-pressed={form.levels.includes(l)} onClick={() => toggle('levels', l)}>
              {l}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Where would you like to study?</legend>
        <div className="chip-row">
          {Object.entries(destinations).map(([code, d]) => (
            <button key={code} type="button" className={`chip${form.destinations.includes(code) ? ' is-active' : ''}`} aria-pressed={form.destinations.includes(code)} onClick={() => toggle('destinations', code)}>
              <Flag code={code} size={18} /> {d.name}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="field">
        <label htmlFor="field_of_study">Field of study <span className="optional">(optional)</span></label>
        <input id="field_of_study" className="input" maxLength={200} placeholder="e.g. Public health" value={form.field_of_study} onChange={(e) => setForm((f) => ({ ...f, field_of_study: e.target.value }))} />
      </div>
      <button type="submit" className="btn btn--primary btn--sm" disabled={!changed || saving}>
        <i className="fas fa-floppy-disk" /> Save goals
      </button>
    </form>
  );
};

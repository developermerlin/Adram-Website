import { countries } from '../../data/countries';

/** One question of the scholarship application form, as the student answers it. */
export const FormQuestion = ({ field, value, onChange, error, disabled = false, number, flagged = false }) => {
  const id = `q-${field.id}`;
  const hintId = field.help ? `${id}-help` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined;
  const common = { id, disabled, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy, 'aria-required': field.required };
  const label = (
    <span className="af-q__label">
      {number && <span className="af-q__num">{number}</span>}{field.label}{field.required ? <span className="af-q__req" aria-hidden="true"> *</span> : <span className="af-q__opt"> (optional)</span>}
    </span>
  );

  let control;
  switch (field.type) {
    case 'textarea':
      control = <textarea className="input af-q__area" rows={5} maxLength={5000} value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...common} />;
      break;
    case 'select':
    case 'country':
      control = (
        <select className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...common}>
          <option value="">Choose…</option>
          {(field.type === 'country' ? countries : field.options).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
      break;
    case 'radio':
    case 'yes_no': {
      const options = field.type === 'yes_no' ? [['yes', 'Yes'], ['no', 'No']] : field.options.map((o) => [o, o]);
      control = (
        <div className={`af-choices${field.type === 'yes_no' ? ' af-choices--inline' : ''}`} role="radiogroup" aria-labelledby={`${id}-label`} aria-describedby={describedBy}>
          {options.map(([v, text]) => (
            <label key={v} className={`af-choice${value === v ? ' is-checked' : ''}`}>
              <input type="radio" name={id} value={v} checked={value === v} disabled={disabled} onChange={() => onChange(v)} />
              <span>{text}</span>
            </label>
          ))}
        </div>
      );
      break;
    }
    case 'checkboxes': {
      const list = Array.isArray(value) ? value : [];
      control = (
        <div className="af-choices" role="group" aria-labelledby={`${id}-label`} aria-describedby={describedBy}>
          {field.options.map((o) => (
            <label key={o} className={`af-choice af-choice--box${list.includes(o) ? ' is-checked' : ''}`}>
              <input type="checkbox" checked={list.includes(o)} disabled={disabled}
                onChange={() => onChange(list.includes(o) ? list.filter((x) => x !== o) : [...list, o])} />
              <span>{o}</span>
            </label>
          ))}
        </div>
      );
      break;
    }
    default: {
      const types = { email: 'email', phone: 'tel', date: 'date', number: 'number', text: 'text' };
      const auto = { email: 'email', phone: 'tel' };
      control = (
        <input className="input" type={types[field.type] || 'text'} inputMode={field.type === 'number' ? 'decimal' : undefined}
          autoComplete={auto[field.type] || (field.prefill === 'full_name' ? 'name' : 'off')} maxLength={field.type === 'number' ? undefined : 300}
          value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...common} />
      );
    }
  }

  const grouped = ['radio', 'yes_no', 'checkboxes'].includes(field.type);
  return (
    <div className={`af-q af-q--${field.width === 'full' ? 'full' : 'half'}${error ? ' has-error' : ''}${flagged ? ' is-flagged' : ''}`} id={`question-${field.id}`}>
      {grouped ? <span id={`${id}-label`} className="af-q__labelwrap">{label}</span> : <label htmlFor={id} className="af-q__labelwrap">{label}</label>}
      {field.help && <p id={hintId} className="af-q__help">{field.help}</p>}
      {flagged && <p className="af-q__flag"><i className="fas fa-flag" aria-hidden="true" /> ADRAM asked you to check this answer.</p>}
      {control}
      {error && <p id={errId} className="af-q__error" role="alert"><i className="fas fa-circle-exclamation" aria-hidden="true" /> {error}</p>}
    </div>
  );
};

export default FormQuestion;

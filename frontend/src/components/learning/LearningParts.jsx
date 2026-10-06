import { Link } from 'react-router-dom';
import { KIND_ICONS } from './levels';

/** "Hands-on lab", "Cheat sheet"... with its icon. */
export const KindBadge = ({ kind, kinds }) => (
  <span className={`lh-kind lh-kind--${kind}`}>
    <i className={`fas ${KIND_ICONS[kind] || KIND_ICONS.note}`} aria-hidden="true" /> {kinds?.[kind] || kind}
  </span>
);

/** How much of a field is finished, as a bar with words for screen readers. */
export const ProgressBar = ({ done, total, label }) => {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="lh-progress">
      <div className="lh-progress__text"><span>{label}</span><strong>{pct}%</strong></div>
      <div className="lh-progress__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`${label}: ${done} of ${total}`}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <small>{done} of {total}</small>
    </div>
  );
};

/** Five small steps showing which levels a field covers (filled) out of the five. */
export const LevelDots = ({ levels, names }) => (
  <span className="lh-dots" aria-label={`Levels covered: ${levels.map((l) => names[l - 1]?.name).join(', ')}`}>
    {[1, 2, 3, 4, 5].map((l) => <span key={l} className={levels.includes(l) ? 'is-on' : ''} title={names[l - 1]?.name} />)}
  </span>
);

/** The closing band on the Learning pages: an invitation to the paid training programmes. */
export const LearnCta = ({ cta }) => (
  <section className="section">
    <div className="container">
      <div className="cta-band">
        <div style={{ position: 'relative' }}>
          <h2>{cta.title}</h2>
          <p>{cta.text}</p>
        </div>
        <div className="cta-band__actions">
          <Link to="/courses" className="btn btn--primary"><i className="fas fa-graduation-cap" aria-hidden="true" /> {cta.button}</Link>
        </div>
      </div>
    </div>
  </section>
);

// KPI cards shared by the admin pages: header (icon, label, shortcut), then an inner panel with a
// small chart and the figure, then an optional note.
import { Link } from 'react-router-dom';

// Compact change indicator: arrow + percentage; the comparison (`vs`) is in the tooltip and for screen readers.
// `invert` is for measures where a rise is bad (failed sign-ins): up shows red, down shows green.
export const Delta = ({ now, prev, vs, invert = false }) => {
  const tone = (dir) => (invert && dir !== 'flat' ? (dir === 'up' ? 'down' : 'up') : dir);
  if (prev === 0 && now === 0) return <span className="delta delta--flat" title={vs}><i className="fas fa-minus" /> 0% <span className="sr-only">{vs}</span></span>;
  if (prev === 0) return <span className={`delta delta--${tone('up')}`} title={vs}><i className="fas fa-arrow-trend-up" /> New <span className="sr-only">{vs}</span></span>;
  const change = Math.round(((now - prev) / prev) * 100);
  const dir = change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
  const icon = { up: 'fa-arrow-trend-up', down: 'fa-arrow-trend-down', flat: 'fa-minus' }[dir];
  return (
    <span className={`delta delta--${tone(dir)}`} title={vs}>
      <i className={`fas ${icon}`} /> {change > 0 ? '+' : ''}{change}% <span className="sr-only">{vs}</span>
    </span>
  );
};

export const StatTile = ({ label, value, icon, tone = 'blue', chart, delta, children, to, action }) => (
  <div className={`kpi kpi--${tone}`}>
    <div className="kpi__head">
      <span className={`stat__icon stat__icon--${tone}`}><i className={`fas ${icon}`} /></span>
      <span className="kpi__label">{label}</span>
      {to && <Link to={to} className="kpi__link" aria-label={action} title={action}><i className="fas fa-arrow-right" /></Link>}
    </div>
    <div className={`kpi__panel${chart ? '' : ' kpi__panel--solo'}`}>
      {chart && <div className="kpi__chart">{chart}</div>}
      <div className="kpi__figures">
        <span className="kpi__value">{value ?? <span className="skeleton skeleton--num" />}</span>
        {delta}
      </div>
    </div>
    {children}
  </div>
);

export default StatTile;

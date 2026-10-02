import { Link } from 'react-router-dom';

/** A figure at the top of a dashboard, optionally a link. `value` null shows a loading placeholder. */
const Kpi = ({ icon, label, value, note, to, tone = 'blue' }) => {
  const body = (
    <>
      <span className={`ov-kpi__icon ov-kpi__icon--${tone}`} aria-hidden="true"><i className={`fas ${icon}`} /></span>
      <span className="ov-kpi__label">{label}</span>
      <strong className="ov-kpi__value">{value ?? <span className="skeleton skeleton--num" />}</strong>
      {note && <small className="ov-kpi__note">{note}</small>}
    </>
  );
  return to ? <Link to={to} className="ov-kpi">{body}</Link> : <div className="ov-kpi">{body}</div>;
};

export default Kpi;

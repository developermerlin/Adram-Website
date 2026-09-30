/** A card holding one chart, with a title and a short note (instructor and admin dashboards). */
export const ChartCard = ({ title, note, actions, children }) => (
  <section className="card panel chart-card">
    <div className="panel__head">
      <div>
        <h2 className="h3">{title}</h2>
        {note && <p className="muted small">{note}</p>}
      </div>
      {actions}
    </div>
    {children}
  </section>
);

/** 7 / 30 / 90 days / 1 year buttons. */
export const PeriodSwitch = ({ value, onChange, options = [7, 30, 90, 365] }) => (
  <div className="period-switch" role="group" aria-label="Reporting period">
    <i className="far fa-calendar" aria-hidden="true" />
    {options.map((d) => (
      <button key={d} type="button" className={value === d ? 'is-active' : ''} aria-pressed={value === d} onClick={() => onChange(d)}>
        {d === 365 ? '1 year' : `${d} days`}
      </button>
    ))}
  </div>
);

export default ChartCard;

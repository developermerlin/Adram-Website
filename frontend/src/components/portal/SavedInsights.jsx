// Statistics at the top of the student's Saved scholarships page: how the shortlist fits their goals,
// funding, deadlines and where it points. Worked out from the saved list already loaded for the page.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { daysUntil } from '../../utils/applicationStages';
import { LEVELS } from '../../data/scholarships';
import Flag from '../ui/Flag';
import { HBars, Meter } from '../admin/charts';
import { StatTile } from '../admin/StatTile';

const fmt = new Intl.NumberFormat();
const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const plural = (n, word) => `${fmt.format(n)} ${word}${n === 1 ? '' : 's'}`;
const rate = (part, whole) => (whole ? Math.round((part / whole) * 100) : null);
const HIDE_KEY = 'adram-saved-stats-hidden';
const HORIZON = 90; // days shown on the deadline countdown

// Does a scholarship fit the student's study goals? (Goals left empty don't rule anything out.)
const matchesGoals = (s, goals) => {
  const levelOk = !goals.levels?.length || s.levels.some((l) => goals.levels.includes(l));
  const destinationOk = !goals.destinations?.length || goals.destinations.includes(s.country);
  return levelOk && destinationOk;
};

const readHidden = () => {
  try {
    return localStorage.getItem(HIDE_KEY) === '1';
  } catch {
    return false;
  }
};

const Panel = ({ title, note, children, className = '' }) => (
  <section className={`card panel ${className}`}>
    <div className="panel__head">
      <div>
        <h2 className="h3">{title}</h2>
        {note && <p className="muted small">{note}</p>}
      </div>
    </div>
    {children}
  </section>
);

export const SavedInsights = ({ saved, goals, isTracking, onTrack }) => {
  const [hidden, setHidden] = useState(readHidden);
  const [starting, setStarting] = useState(null);
  const toggle = () =>
    setHidden((h) => {
      try {
        localStorage.setItem(HIDE_KEY, h ? '0' : '1');
      } catch {
        // storage blocked: the choice lasts until the page is closed
      }
      return !h;
    });

  if (!saved.length) return null;

  const hasGoals = Boolean(goals.levels?.length || goals.destinations?.length);
  const matching = saved.filter((s) => matchesGoals(s, goals)).length;
  const fullyFunded = saved.filter((s) => s.funding === 'full').length;
  const tracked = saved.filter((s) => isTracking(s.slug)).length;
  const dated = saved
    .filter((s) => s.deadline)
    .map((s) => ({ ...s, days: daysUntil(s.deadline) }))
    .filter((s) => s.days >= 0)
    .sort((a, b) => a.days - b.days);
  const next = dated[0];
  const noDate = saved.filter((s) => !s.deadline).length;
  const closed = saved.filter((s) => s.deadline && daysUntil(s.deadline) < 0).length;

  // Not tracked yet: closest deadline first, then the rest.
  const toStart = saved
    .filter((s) => !isTracking(s.slug))
    .map((s) => ({ ...s, days: s.deadline ? daysUntil(s.deadline) : null }))
    .filter((s) => s.days === null || s.days >= 0)
    .sort((a, b) => (a.days ?? 9999) - (b.days ?? 9999));

  const byCountry = {};
  saved.forEach((s) => {
    byCountry[s.country_name] = (byCountry[s.country_name] || 0) + 1;
  });
  const destinations = Object.entries(byCountry).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ key: label, label, value }));
  const levels = LEVELS.map((l) => ({ key: l, label: l, value: saved.filter((s) => s.levels.includes(l)).length }));

  const track = async (s) => {
    setStarting(s.slug);
    try {
      await onTrack(s);
    } finally {
      setStarting(null);
    }
  };

  return (
    <div className="viz-root admin-ov users-ov student-ov">
      <div className="admin-ov__label users-ov__label">
        <h2><i className="fas fa-chart-pie" aria-hidden="true" /> Your shortlist at a glance</h2>
        <button type="button" className="btn btn--text btn--sm" onClick={toggle} aria-expanded={!hidden}>
          <i className={`fas ${hidden ? 'fa-chevron-down' : 'fa-chevron-up'}`} /> {hidden ? 'Show statistics' : 'Hide statistics'}
        </button>
      </div>

      {!hidden && (
        <>
          <div className="kpi-grid">
            <StatTile label="Saved" value={fmt.format(saved.length)} icon="fa-bookmark" tone="violet"
              chart={<Meter value={rate(tracked, saved.length)} label="Share of your saved scholarships you're already tracking" />}>
              <span className="kpi__note">{`${fmt.format(tracked)} tracked · ${fmt.format(saved.length - tracked)} not started yet`}</span>
            </StatTile>

            <StatTile label="Match your goals" value={hasGoals ? `${rate(matching, saved.length)}%` : '—'} icon="fa-bullseye" tone="green"
              chart={hasGoals ? <Meter value={rate(matching, saved.length)} label="Share of saved scholarships that match your study goals" /> : null}>
              <span className="kpi__note">
                {hasGoals ? `${fmt.format(matching)} of ${plural(saved.length, 'scholarship')} fit your level and destinations` : <><a href="#goals">Set your study goals</a> to see how well these fit</>}
              </span>
            </StatTile>

            <StatTile label="Fully funded" value={fmt.format(fullyFunded)} icon="fa-sack-dollar" tone="cyan"
              chart={<Meter value={rate(fullyFunded, saved.length)} label="Share of saved scholarships that are fully funded" />}>
              <span className="kpi__note">{`${rate(fullyFunded, saved.length)}% of your shortlist · ${fmt.format(saved.length - fullyFunded)} partial`}</span>
            </StatTile>

            <StatTile label="Next deadline" value={next ? (next.days === 0 ? 'Today' : `${next.days} day${next.days === 1 ? '' : 's'}`) : '—'} icon="fa-hourglass-half"
              tone={next && next.days <= 14 ? 'red' : 'amber'}>
              <span className="kpi__note">{next ? `${next.name} · ${dateFmt.format(new Date(`${next.deadline}T00:00`))}` : 'No confirmed deadlines yet'}</span>
            </StatTile>
          </div>

          <div className="dash-grid dash-grid--charts">
            <Panel title="Ready to start" note="Saved, but not tracked yet — closest deadline first" className="chart-card">
              {toStart.length === 0 ? (
                <p className="ov-note"><i className="fas fa-circle-check" /> You’re tracking every scholarship on your shortlist.</p>
              ) : (
                <ul className="start-list">
                  {toStart.slice(0, 6).map((s) => (
                    <li key={s.slug}>
                      <Flag code={s.country} size={26} />
                      <span className="start-list__main">
                        <Link to={`/scholarships/${s.slug}`}><strong>{s.name}</strong></Link>
                        <small>
                          {s.country_name} · {s.funding === 'full' ? 'Fully funded' : 'Partial funding'}
                          {hasGoals && matchesGoals(s, goals) && <span className="start-list__match"><i className="fas fa-bullseye" /> Matches your goals</span>}
                        </small>
                      </span>
                      <span className={`closing-list__when${s.days !== null && s.days <= 14 ? ' is-soon' : ''}`}>
                        {s.days === null ? 'No date yet' : s.days === 0 ? 'Today' : `${s.days} days`}
                      </span>
                      <button type="button" className="btn btn--primary btn--sm" disabled={starting === s.slug} onClick={() => track(s)}>
                        <i className={`fas ${starting === s.slug ? 'fa-spinner fa-spin' : 'fa-play'}`} /> Track
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {toStart.length > 6 && <p className="panel__foot">and {fmt.format(toStart.length - 6)} more below</p>}
              <div className="how-it-works">
                <p className="how-it-works__title">What tracking does</p>
                <ul>
                  <li><i className="fas fa-list-check" aria-hidden="true" /> Adds the scholarship to <Link to="/student/applications">My applications</Link> with a document checklist</li>
                  <li><i className="fas fa-bell" aria-hidden="true" /> Counts its deadline in your reminders and progress</li>
                  <li><i className="fas fa-handshake-angle" aria-hidden="true" /> Lets you ask ADRAM to apply for you</li>
                </ul>
              </div>
            </Panel>

            <Panel title="Deadline countdown" note={`Confirmed deadlines in the next ${HORIZON} days`}>
              {dated.length === 0 && <p className="muted small">None of your saved scholarships has a confirmed deadline yet.</p>}
              <ul className="deadline-bars">
                {dated.filter((s) => s.days <= HORIZON).slice(0, 6).map((s) => (
                  <li key={s.slug} className={s.days <= 7 ? 'is-urgent' : s.days <= 30 ? 'is-soon' : ''}>
                    <span className="deadline-bars__top">
                      <strong>{s.name}</strong>
                      <span>{s.days === 0 ? 'Today' : `${s.days} days`}</span>
                    </span>
                    <span className="deadline-bars__track" title={dateFmt.format(new Date(`${s.deadline}T00:00`))}>
                      <span style={{ width: `${Math.max(4, 100 - Math.min(100, (s.days / HORIZON) * 100))}%` }} />
                    </span>
                  </li>
                ))}
              </ul>
              {(noDate > 0 || closed > 0) && (
                <p className="panel__foot">
                  {[noDate && `${plural(noDate, 'scholarship')} without a confirmed date`, closed && `${fmt.format(closed)} already closed`].filter(Boolean).join(' · ')}
                </p>
              )}
            </Panel>
          </div>

          <div className="dash-grid dash-grid--three">
            <Panel title="Destinations" note="Where your shortlist would take you">
              <HBars rows={destinations} />
            </Panel>

            <Panel title="Study level" note="A scholarship can cover several levels">
              <HBars rows={levels} />
            </Panel>

            <Panel title="Funding" note="What your shortlist pays for">
              <ul className="split-list">
                {[
                  { key: 'full', label: 'Fully funded', count: fullyFunded },
                  { key: 'partial', label: 'Partial funding', count: saved.length - fullyFunded },
                ].map((f) => (
                  <li key={f.key}>
                    <span className="split-list__top"><strong>{f.label}</strong><span>{fmt.format(f.count)} <small className="muted">· {rate(f.count, saved.length)}%</small></span></span>
                    <Meter value={rate(f.count, saved.length)} label={`${f.label} share of your saved scholarships`} />
                  </li>
                ))}
                <li className="split-list__facts">
                  <span><i className="fas fa-handshake-angle" aria-hidden="true" /> ADRAM can apply for you <strong>{fmt.format(saved.filter((s) => s.service_enabled).length)}</strong></span>
                </li>
              </ul>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
};

export default SavedInsights;

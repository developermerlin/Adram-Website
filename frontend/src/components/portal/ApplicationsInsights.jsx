// Statistics at the top of the student's My applications page: progress, documents, deadlines, results.
// Everything is worked out from the applications already loaded for the page.
import { useState } from 'react';
import { daysUntil, isClosed, PATH, progressOf, reviewState } from '../../utils/applicationStages';
import { Donut, HBars, Meter, StatusStack } from '../admin/charts';
import { StatTile } from '../admin/StatTile';

const fmt = new Intl.NumberFormat();
const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const plural = (n, word) => `${fmt.format(n)} ${word}${n === 1 ? '' : 's'}`;
const rate = (part, whole) => (whole ? Math.round((part / whole) * 100) : null);
const HIDE_KEY = 'adram-my-applications-stats-hidden';
const HORIZON = 60; // days shown on the deadline timeline

const RESULTS = [
  { key: 'awarded', label: 'Awarded', icon: 'fa-trophy', color: 'var(--status-good)' },
  { key: 'unsuccessful', label: 'Unsuccessful', icon: 'fa-circle-xmark', color: 'var(--status-critical)' },
  { key: 'active', label: 'Still in progress', icon: 'fa-spinner', color: 'var(--viz-accent)' },
  { key: 'withdrawn', label: 'Withdrawn', icon: 'fa-arrow-rotate-left', color: 'var(--viz-muted-line)' },
];

const DOCS = [
  { key: 'done', label: 'Accepted or ready', icon: 'fa-circle-check', color: 'var(--status-good)' },
  { key: 'review', label: 'Being checked by ADRAM', icon: 'fa-hourglass-half', color: 'var(--status-warning)' },
  { key: 'returned', label: 'Returned to fix', icon: 'fa-rotate-left', color: 'var(--status-critical)' },
  { key: 'todo', label: 'Still to upload', icon: 'fa-file-circle-plus', color: 'var(--viz-muted-line)' },
];

// A document's state for the chart: ADRAM reviews documents on applications it handles;
// on self-tracked applications the checklist tick is what counts.
const docState = (doc, app) => {
  if (!app.service) return doc.is_done || doc.has_file ? 'done' : 'todo';
  const s = reviewState(doc);
  if (s === 'accepted') return 'done';
  if (s === 'returned') return 'returned';
  if (s === 'in_review' || s === 'resubmitted') return 'review';
  return 'todo';
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

// The application path as a row of steps, with how many applications are at each one right now.
const Journey = ({ applications }) => {
  const at = Object.fromEntries(PATH.map((s) => [s.id, applications.filter((a) => a.stage === s.id).length]));
  // Everything that reached a step (or went past it), for the line between steps.
  const reached = (i) => applications.filter((a) => {
    const j = PATH.findIndex((s) => s.id === a.stage);
    return j >= i;
  }).length;
  return (
    <ol className="journey">
      {PATH.map((s, i) => (
        <li key={s.id} className={`journey__step${at[s.id] ? ' is-here' : ''}${reached(i) ? ' is-reached' : ''}`}>
          <span className="journey__dot" aria-hidden="true">
            <i className={`fas ${s.icon}`} />
            {at[s.id] > 0 && <span className="journey__count">{at[s.id]}</span>}
          </span>
          <strong>{s.label}</strong>
          <small>{at[s.id] ? plural(at[s.id], 'application') : '—'}</small>
        </li>
      ))}
    </ol>
  );
};

export const ApplicationsInsights = ({ applications }) => {
  const [hidden, setHidden] = useState(readHidden);
  const toggle = () =>
    setHidden((h) => {
      try {
        localStorage.setItem(HIDE_KEY, h ? '0' : '1');
      } catch {
        // storage blocked: the choice lasts until the page is closed
      }
      return !h;
    });

  if (!applications.length) return null;

  const active = applications.filter((a) => !isClosed(a.stage));
  const awarded = applications.filter((a) => a.stage === 'accepted').length;
  const unsuccessful = applications.filter((a) => a.stage === 'unsuccessful').length;
  const withdrawn = applications.filter((a) => a.stage === 'withdrawn').length;
  const successRate = rate(awarded, awarded + unsuccessful);
  const avgProgress = active.length ? Math.round(active.reduce((n, a) => n + progressOf(a), 0) / active.length) : null;
  const withAdram = applications.filter((a) => a.service && !['declined'].includes(a.service.status)).length;

  // Documents on applications that are still open.
  const docCounts = { done: 0, review: 0, returned: 0, todo: 0 };
  active.forEach((a) => a.documents.forEach((d) => { docCounts[docState(d, a)] += 1; }));
  const docTotal = Object.values(docCounts).reduce((a, b) => a + b, 0);

  // Deadlines of open applications, soonest first (including ones that have passed).
  const deadlines = active
    .filter((a) => a.deadline)
    .map((a) => ({ id: a.id, name: a.scholarship_name, date: a.deadline, days: daysUntil(a.deadline) }))
    .sort((x, y) => x.days - y.days);
  const upcoming = deadlines.filter((d) => d.days >= 0);
  const overdue = deadlines.filter((d) => d.days < 0).length;
  const next = upcoming[0];

  const byCountry = {};
  applications.forEach((a) => {
    const key = a.country_name || 'Not listed';
    byCountry[key] = (byCountry[key] || 0) + 1;
  });
  const destinations = Object.entries(byCountry).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ key: label, label, value }));

  return (
    <div className="viz-root admin-ov users-ov student-ov">
      <div className="admin-ov__label users-ov__label">
        <h2><i className="fas fa-chart-pie" aria-hidden="true" /> Your progress at a glance</h2>
        <button type="button" className="btn btn--text btn--sm" onClick={toggle} aria-expanded={!hidden}>
          <i className={`fas ${hidden ? 'fa-chevron-down' : 'fa-chevron-up'}`} /> {hidden ? 'Show statistics' : 'Hide statistics'}
        </button>
      </div>

      {!hidden && (
        <>
          <div className="kpi-grid">
            <StatTile label="Applications" value={fmt.format(applications.length)} icon="fa-list-check"
              chart={<Meter value={rate(active.length, applications.length)} label="Share of your applications still in progress" />}>
              <span className="kpi__note">{`${fmt.format(active.length)} in progress · ${fmt.format(applications.length - active.length)} finished`}{withAdram ? ` · ADRAM is applying for ${fmt.format(withAdram)}` : ''}</span>
            </StatTile>

            <StatTile label="Overall progress" value={avgProgress === null ? '—' : `${avgProgress}%`} icon="fa-route" tone="violet"
              chart={<Meter value={avgProgress} label="Average progress of your applications in progress" />}>
              <span className="kpi__note">{active.length ? `Average across ${plural(active.length, 'application')} in progress` : 'No applications in progress'}</span>
            </StatTile>

            <StatTile label="Documents" value={docTotal ? `${docCounts.done}/${docTotal}` : '—'} icon="fa-folder-open"
              tone={docCounts.returned ? 'red' : 'green'}
              chart={<Meter value={rate(docCounts.done, docTotal)} label="Share of your documents that are ready or accepted" />}>
              <span className="kpi__note">
                {docTotal
                  ? [docCounts.returned && `${fmt.format(docCounts.returned)} returned to fix`, docCounts.review && `${fmt.format(docCounts.review)} being checked`, docCounts.todo && `${fmt.format(docCounts.todo)} to upload`]
                    .filter(Boolean).join(' · ') || 'All documents are ready'
                  : 'No documents requested yet'}
              </span>
            </StatTile>

            <StatTile label="Next deadline" value={next ? (next.days === 0 ? 'Today' : `${next.days} day${next.days === 1 ? '' : 's'}`) : '—'} icon="fa-hourglass-half"
              tone={next && next.days <= 14 ? 'red' : 'amber'}>
              <span className="kpi__note">{next ? `${next.name} · ${dateFmt.format(new Date(`${next.date}T00:00`))}` : 'No upcoming deadlines'}</span>
            </StatTile>
          </div>

          <div className="dash-grid dash-grid--charts">
            <Panel title="Your journey" note="Where your applications stand right now, from first interest to an award" className="chart-card">
              <Journey applications={applications} />
              <div className="journey__foot">
                <span><i className="fas fa-trophy" aria-hidden="true" /> {fmt.format(awarded)} awarded</span>
                <span><i className="fas fa-circle-xmark" aria-hidden="true" /> {fmt.format(unsuccessful)} unsuccessful</span>
                <span><i className="fas fa-arrow-rotate-left" aria-hidden="true" /> {fmt.format(withdrawn)} withdrawn</span>
              </div>
              {active.length > 0 && (
                <>
                  <h3 className="panel__subhead">Progress by application</h3>
                  <ul className="app-progress">
                    {[...active].sort((x, y) => progressOf(x) - progressOf(y)).map((a) => {
                      const p = progressOf(a);
                      return (
                        <li key={a.id}>
                          <span className="app-progress__name">
                            <strong>{a.scholarship_name}</strong>
                            <small>{a.stage_display}{a.milestones?.length ? ` · ${a.milestones.filter((m) => m.status === 'done').length}/${a.milestones.length} steps done` : ''}</small>
                          </span>
                          <Meter value={p} label={`${a.scholarship_name}: ${p}% complete`} />
                          <span className="app-progress__pct">{p}%</span>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </Panel>

            <Panel title="Results" note="Every application you’ve tracked">
              <Donut
                label="Your results"
                segments={RESULTS.map((s) => ({ ...s, value: { awarded, unsuccessful, withdrawn, active: active.length }[s.key] }))}
                centre={successRate === null ? `${fmt.format(active.length)}` : `${successRate}%`}
                centreLabel={successRate === null ? 'in progress' : 'success rate'}
              />
            </Panel>
          </div>

          <div className="dash-grid dash-grid--three">
            <Panel title="Upcoming deadlines" note={`The next ${HORIZON} days`}>
              {overdue > 0 && (
                <p className="panel__hint"><i className="fas fa-circle-info" /> {plural(overdue, 'application')} past the deadline and still open. Update its stage, or message ADRAM.</p>
              )}
              {upcoming.length === 0 && <p className="muted small">No deadlines coming up.</p>}
              <ul className="deadline-bars">
                {upcoming.slice(0, 6).map((d) => {
                  const tone = d.days <= 7 ? 'is-urgent' : d.days <= 30 ? 'is-soon' : '';
                  return (
                    <li key={d.id} className={tone}>
                      <span className="deadline-bars__top">
                        <strong>{d.name}</strong>
                        <span>{d.days === 0 ? 'Today' : `${d.days} day${d.days === 1 ? '' : 's'}`}</span>
                      </span>
                      <span className="deadline-bars__track" title={dateFmt.format(new Date(`${d.date}T00:00`))}>
                        <span style={{ width: `${Math.max(4, 100 - Math.min(100, (d.days / HORIZON) * 100))}%` }} />
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Panel>

            <Panel title="Document checklist" note={docTotal ? `${plural(docTotal, 'document')} across your open applications` : 'For applications in progress'}>
              {docTotal ? <StatusStack total={docTotal} segments={DOCS.map((s) => ({ ...s, value: docCounts[s.key] }))} /> : <p className="muted small">No documents requested yet.</p>}
            </Panel>

            <Panel title="Destinations" note="Where you’re applying">
              <HBars rows={destinations} />
            </Panel>
          </div>
        </>
      )}
    </div>
  );
};

export default ApplicationsInsights;

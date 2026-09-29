// Statistics above the Applications table: volume, work waiting, results and service uptake, then charts.
import { useEffect, useState } from 'react';
import { staffPortalAPI } from '../../services/api';
import { ColumnChart, Funnel, HBars, Meter, MiniBars, StatusStack } from './charts';
import { Delta, StatTile } from './StatTile';

const fmt = new Intl.NumberFormat();
const dayFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const parseDay = (iso) => new Date(`${iso}T00:00:00`);
const plural = (n, word) => `${fmt.format(n)} ${word}${n === 1 ? '' : 's'}`;
const rate = (part, whole) => (whole ? Math.round((part / whole) * 100) : null);
const HIDE_KEY = 'adram-applications-stats-hidden';

// Deadline urgency is a state, so it uses the fixed status colours, each with an icon and label.
const URGENCY = [
  { key: 'overdue', label: 'Deadline passed', icon: 'fa-circle-exclamation', color: 'var(--status-critical)' },
  { key: 'this_week', label: 'Due within 7 days', icon: 'fa-fire', color: 'var(--status-serious)' },
  { key: 'this_month', label: 'Due within 30 days', icon: 'fa-hourglass-half', color: 'var(--status-warning)' },
  { key: 'later', label: 'More than 30 days', icon: 'fa-calendar-check', color: 'var(--status-good)' },
  { key: 'none', label: 'No deadline set', icon: 'fa-calendar-xmark', color: 'var(--viz-muted-line)' },
];

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

export const ApplicationsOverview = () => {
  const [data, setData] = useState(null);
  const [hidden, setHidden] = useState(readHidden);

  useEffect(() => {
    staffPortalAPI.applicationsOverview().then(({ data: d }) => setData(d)).catch(() => {});
  }, []);

  const toggle = () => {
    setHidden((h) => {
      try {
        localStorage.setItem(HIDE_KEY, h ? '0' : '1');
      } catch {
        // storage blocked: the choice lasts until the page is closed
      }
      return !h;
    });
  };

  const d = data;
  const weekly = d ? d.weekly.map((w) => ({ date: w.start, count: w.count })) : [];
  const weekRows = d
    ? d.weekly.map((w) => ({ key: w.start, label: dayFmt.format(parseDay(w.start)), value: w.count, sub: `Week of ${dayFmt.format(parseDay(w.start))} – ${dayFmt.format(parseDay(w.end))}` }))
    : [];
  const serviceRate = d && rate(d.with_service, d.total);
  const docs = d?.documents;

  return (
    <div className="viz-root admin-ov users-ov">
      <div className="admin-ov__label users-ov__label">
        <h2><i className="fas fa-chart-column" aria-hidden="true" /> Application statistics</h2>
        <button type="button" className="btn btn--text btn--sm" onClick={toggle} aria-expanded={!hidden}>
          <i className={`fas ${hidden ? 'fa-chevron-down' : 'fa-chevron-up'}`} /> {hidden ? 'Show statistics' : 'Hide statistics'}
        </button>
      </div>

      {!hidden && (
        <>
          <div className="kpi-grid">
            <StatTile
              label="Total applications"
              value={d && fmt.format(d.total)}
              icon="fa-list-check"
              chart={weekly.length > 0 && <MiniBars series={weekly} valueKey="count" label="New applications per week, last 12 weeks" />}
              delta={d && <Delta now={d.new_7} prev={d.new_prev_7} vs="New applications vs the previous 7 days" />}
            >
              <span className="kpi__note">{d ? `${fmt.format(d.active)} in progress · from ${plural(d.students, 'student')}` : ''}</span>
            </StatTile>

            <StatTile label="Needs your action" value={d && fmt.format(d.needs_action)} icon="fa-bell" tone="amber" to="/admin/applications?stage=review" action="Show applications that need action">
              <span className="kpi__note">{d ? (d.needs_action ? 'Requests, payments or documents to check' : 'Nothing waiting for you') : ''}</span>
            </StatTile>

            <StatTile
              label="Success rate"
              value={d && (d.success_rate === null ? '—' : `${d.success_rate}%`)}
              icon="fa-trophy"
              tone="green"
              chart={<Meter value={d?.success_rate} label="Awarded out of decided applications" />}
            >
              <span className="kpi__note">{d ? `${fmt.format(d.awarded)} awarded · ${fmt.format(d.unsuccessful)} unsuccessful · ${fmt.format(d.withdrawn)} withdrawn` : ''}</span>
            </StatTile>

            <StatTile
              label="ADRAM applying"
              value={d && (serviceRate === null ? '—' : `${serviceRate}%`)}
              icon="fa-handshake-angle"
              tone="cyan"
              to="/admin/applications?stage=service"
              action="Show applications ADRAM is handling"
              chart={<Meter value={serviceRate} label="Share of applications where the student asked ADRAM to apply" />}
            >
              <span className="kpi__note">{d ? `${fmt.format(d.with_service)} of ${plural(d.total, 'application')} use the service` : ''}</span>
            </StatTile>
          </div>

          <div className="dash-grid dash-grid--charts">
            <Panel title="New applications per week" note={d ? `Last 12 weeks · ${plural(weekRows.reduce((n, r) => n + r.value, 0), 'application')} started` : null} className="chart-card">
              {d ? <ColumnChart rows={weekRows} name="New applications" average="avg/week" W={720} H={240} /> : <div className="skeleton skeleton--chart" />}
            </Panel>
            <Panel title="Deadline urgency" note={d ? `${plural(d.active, 'open application')} by how soon they're due` : null}>
              {d ? <StatusStack total={d.active} segments={URGENCY.map((u) => ({ ...u, value: d.deadlines[u.key] }))} /> : <div className="skeleton skeleton--block" />}
            </Panel>
          </div>

          <div className="dash-grid dash-grid--three">
            <Panel title="Stage pipeline" note="Every application, by stage">
              {d ? <HBars rows={d.pipeline.map((p) => ({ key: p.stage, label: p.label, value: p.count }))} /> : <div className="skeleton skeleton--block" />}
            </Panel>

            <Panel title="Document review" note="Documents ADRAM asked students for">
              {!d && <div className="skeleton skeleton--block" />}
              {d && docs.total === 0 && <p className="muted small">No documents requested yet.</p>}
              {d && docs.total > 0 && (
                <Funnel
                  steps={[
                    { key: 'requested', label: 'Requested', count: docs.total },
                    { key: 'uploaded', label: 'Uploaded by students', count: docs.uploaded },
                    { key: 'accepted', label: 'Accepted by ADRAM', count: docs.accepted },
                  ]}
                  footer={`${plural(docs.to_check, 'document')} waiting for review · ${fmt.format(docs.returned)} returned`}
                />
              )}
            </Panel>

            <Panel title="Destinations" note="Where students are applying">
              {!d && <div className="skeleton skeleton--block" />}
              {d?.destinations.length === 0 && <p className="muted small">No applications yet.</p>}
              {d && d.destinations.length > 0 && <HBars rows={d.destinations.map((c) => ({ key: c.key, label: c.label, value: c.count }))} />}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
};

export default ApplicationsOverview;

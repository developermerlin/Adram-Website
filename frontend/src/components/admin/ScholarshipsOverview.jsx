// Statistics above the Scholarships table: catalogue health, deadlines and student interest, then charts.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { staffPortalAPI } from '../../services/api';
import Flag from '../ui/Flag';
import { ColumnChart, HBars, Meter, MiniBars, StatusStack } from './charts';
import { Delta, StatTile } from './StatTile';

const fmt = new Intl.NumberFormat();
const dayFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const parseDay = (iso) => new Date(`${iso}T00:00:00`);
const plural = (n, word) => `${fmt.format(n)} ${word}${n === 1 ? '' : 's'}`;
const rate = (part, whole) => (whole ? Math.round((part / whole) * 100) : null);
const HIDE_KEY = 'adram-scholarships-stats-hidden';
const daysLeft = (iso) => Math.round((parseDay(iso) - parseDay(new Date().toISOString().slice(0, 10))) / 86400000);

// Deadline status of published listings: states, so the fixed status colours with icons and labels.
const DEADLINES = [
  { key: 'passed', label: 'Deadline passed', icon: 'fa-circle-exclamation', color: 'var(--status-critical)' },
  { key: 'next_30', label: 'Closing within 30 days', icon: 'fa-hourglass-half', color: 'var(--status-warning)' },
  { key: 'later', label: 'Open for 30+ days', icon: 'fa-calendar-check', color: 'var(--status-good)' },
  { key: 'unknown', label: 'No date confirmed', icon: 'fa-calendar-xmark', color: 'var(--viz-muted-line)' },
];

const INTEREST = [
  { key: 'saves', label: 'Saves' },
  { key: 'applications', label: 'Applications started' },
];

const readHidden = () => {
  try {
    return localStorage.getItem(HIDE_KEY) === '1';
  } catch {
    return false;
  }
};

const Panel = ({ title, note, action, children, className = '' }) => (
  <section className={`card panel ${className}`}>
    <div className="panel__head">
      <div>
        <h2 className="h3">{title}</h2>
        {note && <p className="muted small">{note}</p>}
      </div>
      {action}
    </div>
    {children}
  </section>
);

export const ScholarshipsOverview = ({ refreshKey = '' }) => {
  const [data, setData] = useState(null);
  const [hidden, setHidden] = useState(readHidden);
  const [metric, setMetric] = useState('saves');

  useEffect(() => {
    staffPortalAPI.scholarshipsOverview().then(({ data: d }) => setData(d)).catch(() => {});
  }, [refreshKey]);

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
  const weeklySaves = d ? d.weekly.map((w) => ({ date: w.start, count: w.saves })) : [];
  const weekRows = d
    ? d.weekly.map((w) => ({ key: w.start, label: dayFmt.format(parseDay(w.start)), value: w[metric], sub: `Week of ${dayFmt.format(parseDay(w.start))} – ${dayFmt.format(parseDay(w.end))}` }))
    : [];
  const metricLabel = INTEREST.find((m) => m.key === metric).label;

  return (
    <div className="viz-root admin-ov users-ov">
      <div className="admin-ov__label users-ov__label">
        <h2><i className="fas fa-graduation-cap" aria-hidden="true" /> Scholarship statistics</h2>
        <button type="button" className="btn btn--text btn--sm" onClick={toggle} aria-expanded={!hidden}>
          <i className={`fas ${hidden ? 'fa-chevron-down' : 'fa-chevron-up'}`} /> {hidden ? 'Show statistics' : 'Hide statistics'}
        </button>
      </div>

      {!hidden && (
        <>
          <div className="kpi-grid">
            <StatTile label="Listings" value={d && fmt.format(d.total)} icon="fa-layer-group"
              chart={<Meter value={d && rate(d.published, d.total)} label="Share of listings that are published" />}>
              <span className="kpi__note">{d ? `${fmt.format(d.published)} published · ${plural(d.drafts, 'draft')}` : ''}</span>
            </StatTile>

            <StatTile
              label="Student saves"
              value={d && fmt.format(d.interest.saves)}
              icon="fa-bookmark"
              tone="violet"
              chart={weeklySaves.length > 0 && <MiniBars series={weeklySaves} valueKey="count" label="Saves per week, last 12 weeks" />}
              delta={d && <Delta now={d.interest.saves_7} prev={d.interest.saves_prev_7} vs="Saves vs the previous 7 days" />}
            >
              <span className="kpi__note">{d ? `${plural(d.interest.applications, 'application')} · ${fmt.format(d.interest.service)} ADRAM requests` : ''}</span>
            </StatTile>

            <StatTile label="Closing soon" value={d && fmt.format(d.deadlines.next_30)} icon="fa-hourglass-half" tone="amber">
              <span className="kpi__note">{d ? `Within 30 days · ${fmt.format(d.deadlines.passed)} past their deadline` : ''}</span>
            </StatTile>

            <StatTile label="No interest yet" value={d && fmt.format(d.no_interest_count)} icon="fa-eye-low-vision" tone={d && d.no_interest_count === 0 ? 'green' : 'red'}>
              <span className="kpi__note">{d ? (d.no_interest_count ? 'Published listings with no saves or applications' : 'Every published listing has some interest') : ''}</span>
            </StatTile>
          </div>

          <div className="dash-grid dash-grid--charts">
            <Panel
              title="Student interest per week"
              note={d ? `${metricLabel} · last 12 weeks · ${fmt.format(weekRows.reduce((n, r) => n + r.value, 0))} in total` : null}
              className="chart-card"
              action={
                <div className="period-switch period-switch--sm" role="group" aria-label="Interest measure">
                  {INTEREST.map((m) => (
                    <button key={m.key} type="button" className={metric === m.key ? 'is-active' : ''} aria-pressed={metric === m.key} onClick={() => setMetric(m.key)}>
                      {m.key === 'saves' ? 'Saves' : 'Applications'}
                    </button>
                  ))}
                </div>
              }
            >
              {d ? <ColumnChart key={metric} rows={weekRows} name={metricLabel} average="avg/week" W={720} H={240} /> : <div className="skeleton skeleton--chart" />}
            </Panel>

            <Panel title="Deadlines" note={d ? `${plural(d.published, 'published listing')}` : null}>
              {!d && <div className="skeleton skeleton--block" />}
              {d && (
                <>
                  <StatusStack total={d.published} segments={DEADLINES.map((s) => ({ ...s, value: d.deadlines[s.key] }))} />
                  <h3 className="panel__subhead">Closing next</h3>
                  {d.closing.length === 0 && <p className="muted small">No upcoming deadlines confirmed.</p>}
                  <ul className="closing-list">
                    {d.closing.map((s) => {
                      const left = daysLeft(s.deadline);
                      return (
                        <li key={s.id}>
                          <Flag code={s.country} size={20} />
                          <Link to={`/admin/scholarships/${s.id}`}>{s.name}</Link>
                          <span className={`closing-list__when${left <= 14 ? ' is-soon' : ''}`} title={dateFmt.format(parseDay(s.deadline))}>
                            {left === 0 ? 'Today' : `${left} day${left === 1 ? '' : 's'}`}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </Panel>
          </div>

          <div className={`dash-grid ${d && d.no_interest_count === 0 ? 'dash-grid--full' : 'dash-grid--charts'}`}>
            <Panel title="Most popular scholarships" note="By applications, then saves">
              {!d && <div className="skeleton skeleton--block" />}
              {d?.top.length === 0 && <p className="muted small">No scholarships yet.</p>}
              {d && d.top.length > 0 && (
                <table className="rank-table">
                  <thead>
                    <tr>
                      <th scope="col">Scholarship</th>
                      <th scope="col" className="num">Applications</th>
                      <th scope="col" className="num">Saves</th>
                      <th scope="col" className="num">ADRAM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.top.map((s, i) => (
                      <tr key={s.id}>
                        <td>
                          <span className="rank-table__name">
                            <span className="rank-table__n">{i + 1}</span>
                            <Flag code={s.country} size={22} />
                            <Link to={`/admin/scholarships/${s.id}`}>{s.name}</Link>
                            {!s.is_published && <span className="badge badge--gray">Draft</span>}
                          </span>
                        </td>
                        <td className="num">{fmt.format(s.applications)}</td>
                        <td className="num">{fmt.format(s.saves)}</td>
                        <td className="num">{fmt.format(s.service)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>

            {(!d || d.no_interest_count > 0) && (
              <Panel title="No interest yet" note="Published, but no saves or applications — worth promoting or reviewing">
                {!d && <div className="skeleton skeleton--block" />}
                <ul className="closing-list">
                  {d?.no_interest.map((s) => (
                    <li key={s.id}>
                      <i className="fas fa-graduation-cap closing-list__icon" aria-hidden="true" />
                      <Link to={`/admin/scholarships/${s.id}`}>{s.name}</Link>
                      <i className="fas fa-pen closing-list__icon" aria-hidden="true" />
                    </li>
                  ))}
                </ul>
                {d && d.no_interest_count > d.no_interest.length && <p className="panel__foot">and {fmt.format(d.no_interest_count - d.no_interest.length)} more</p>}
              </Panel>
            )}
          </div>

          <div className="dash-grid dash-grid--three">
            <Panel title="Destinations" note="Published listings by country">
              {!d && <div className="skeleton skeleton--block" />}
              {d?.destinations.length === 0 && <p className="muted small">Nothing published yet.</p>}
              {d && d.destinations.length > 0 && <HBars rows={d.destinations.map((c) => ({ key: c.key, label: c.label, value: c.count }))} />}
            </Panel>

            <Panel title="Study levels" note="A listing can cover several levels">
              {d ? <HBars rows={d.levels.map((l) => ({ key: l.key, label: l.label, value: l.count }))} /> : <div className="skeleton skeleton--block" />}
            </Panel>

            <Panel title="Funding & access" note="Published listings">
              {!d && <div className="skeleton skeleton--block" />}
              {d && (
                <ul className="split-list">
                  {d.funding.map((f) => (
                    <li key={f.key}>
                      <span className="split-list__top"><strong>{f.label}</strong><span>{fmt.format(f.count)}</span></span>
                      <Meter value={rate(f.count, d.published)} label={`${f.label} share of published listings`} />
                    </li>
                  ))}
                  <li className="split-list__facts">
                    <span><i className="fas fa-handshake-angle" aria-hidden="true" /> ADRAM service offered <strong>{fmt.format(d.service_on)}</strong></span>
                    <span><i className="fas fa-lock" aria-hidden="true" /> Sign-in to view details <strong>{fmt.format(d.members_only)}</strong></span>
                    <span><i className="fas fa-link-slash" aria-hidden="true" /> Official link hidden <strong>{fmt.format(d.link_hidden)}</strong></span>
                  </li>
                </ul>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
};

export default ScholarshipsOverview;

// Statistics above the Training tables: programmes, enrollments, requests and completion, then charts.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { staffPortalAPI } from '../../services/api';
import BrandIcon from '../brand/BrandIcon';
import { ColumnChart, Meter, MiniBars, StatusStack } from './charts';
import { Delta, StatTile } from './StatTile';

const fmt = new Intl.NumberFormat();
const dayFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const parseDay = (iso) => new Date(`${iso}T00:00:00`);
const plural = (n, word) => `${fmt.format(n)} ${word}${n === 1 ? '' : 's'}`;
const rate = (part, whole) => (whole ? Math.round((part / whole) * 100) : null);
const HIDE_KEY = 'adram-training-stats-hidden';
const daysLeft = (iso) => Math.round((parseDay(iso) - parseDay(new Date().toISOString().slice(0, 10))) / 86400000);

// Enrollment states, each with an icon and label.
const STATUS = [
  { key: 'requested', label: 'Waiting for confirmation', icon: 'fa-hourglass-half', color: 'var(--status-warning)' },
  { key: 'active', label: 'Enrolled', icon: 'fa-user-graduate', color: 'var(--viz-accent)' },
  { key: 'completed', label: 'Completed', icon: 'fa-circle-check', color: 'var(--status-good)' },
  { key: 'cancelled', label: 'Cancelled', icon: 'fa-ban', color: 'var(--viz-muted-line)' },
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

export const TrainingOverview = ({ refreshKey = '' }) => {
  const [data, setData] = useState(null);
  const [hidden, setHidden] = useState(readHidden);

  useEffect(() => {
    staffPortalAPI.trainingOverview().then(({ data: d }) => setData(d)).catch(() => {});
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
  const s = d?.status;
  const weekly = d ? d.weekly.map((w) => ({ date: w.start, count: w.count })) : [];
  const weekRows = d
    ? d.weekly.map((w) => ({ key: w.start, label: dayFmt.format(parseDay(w.start)), value: w.count, sub: `Week of ${dayFmt.format(parseDay(w.start))} – ${dayFmt.format(parseDay(w.end))}` }))
    : [];
  const completion = s && rate(s.completed, s.active + s.completed);
  const nextIntake = d?.upcoming.find((u) => u.kind === 'intake');
  const topTotal = d ? Math.max(...d.programmes.map((p) => p.total), 1) : 1;

  return (
    <div className="viz-root admin-ov users-ov">
      <div className="admin-ov__label users-ov__label">
        <h2><i className="fas fa-laptop-code" aria-hidden="true" /> Training statistics</h2>
        <button type="button" className="btn btn--text btn--sm" onClick={toggle} aria-expanded={!hidden}>
          <i className={`fas ${hidden ? 'fa-chevron-down' : 'fa-chevron-up'}`} /> {hidden ? 'Show statistics' : 'Hide statistics'}
        </button>
      </div>

      {!hidden && (
        <>
          <div className="kpi-grid">
            <StatTile label="Programmes" value={d && fmt.format(d.programmes_total)} icon="fa-layer-group"
              chart={<Meter value={d && rate(d.programmes_published, d.programmes_total)} label="Share of programmes that are published" />}>
              <span className="kpi__note">
                {d ? `${fmt.format(d.programmes_published)} published · ${nextIntake ? `next intake in ${plural(daysLeft(nextIntake.date), 'day')}` : 'no upcoming intake'}` : ''}
              </span>
            </StatTile>

            <StatTile
              label="Enrollments"
              value={d && fmt.format(d.total - s.cancelled)}
              icon="fa-user-plus"
              tone="violet"
              chart={weekly.length > 0 && <MiniBars series={weekly} valueKey="count" label="Enrollments per week, last 12 weeks" />}
              delta={d && <Delta now={d.new_7} prev={d.new_prev_7} vs="New enrollments vs the previous 7 days" />}
            >
              <span className="kpi__note">{d ? `${plural(d.learners, 'learner')} · ${fmt.format(d.multi_programme)} in more than one programme` : ''}</span>
            </StatTile>

            <StatTile label="To confirm" value={d && fmt.format(s.requested)} icon="fa-bell" tone="amber" to="/admin/courses#enrollments" action="Go to enrollments">
              <span className="kpi__note">{d ? (s.requested ? 'Open a student to confirm their place' : 'Nothing waiting for you') : ''}</span>
            </StatTile>

            <StatTile label="Completion rate" value={d && (completion === null ? '—' : `${completion}%`)} icon="fa-award" tone="green"
              chart={<Meter value={completion} label="Completed out of enrolled and completed learners" />}>
              <span className="kpi__note">{d ? `${fmt.format(s.completed)} completed · ${fmt.format(s.active)} studying now` : ''}</span>
            </StatTile>
          </div>

          <div className="dash-grid dash-grid--charts">
            <Panel title="Enrollments per week" note={d ? `Last 12 weeks · ${plural(weekRows.reduce((n, r) => n + r.value, 0), 'enrollment')}` : null} className="chart-card">
              {d ? <ColumnChart rows={weekRows} name="Enrollments" average="avg/week" W={720} H={240} /> : <div className="skeleton skeleton--chart" />}
            </Panel>
            <Panel title="Enrollment status" note={d ? plural(d.total, 'enrollment') : null}>
              {d ? <StatusStack total={d.total} segments={STATUS.map((x) => ({ ...x, value: s[x.key] }))} /> : <div className="skeleton skeleton--block" />}
            </Panel>
          </div>

          <div className="dash-grid dash-grid--charts">
            <Panel title="Programme performance" note="Enrollments per programme, by status">
              {!d && <div className="skeleton skeleton--block" />}
              {d?.programmes.length === 0 && <p className="muted small">No programmes yet.</p>}
              {d && d.programmes.length > 0 && (
                <table className="rank-table programme-table">
                  <thead>
                    <tr>
                      <th scope="col">Programme</th>
                      <th scope="col" className="programme-table__bar">Enrollments</th>
                      <th scope="col" className="num">Waiting</th>
                      <th scope="col" className="num">Enrolled</th>
                      <th scope="col" className="num">Done</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.programmes.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <span className="rank-table__name">
                            <span className="programme-table__icon"><BrandIcon name={p.icon} size={18} /></span>
                            <Link to={`/admin/courses/${p.id}`}>{p.title}</Link>
                            {!p.is_published && <span className="badge badge--gray">Draft</span>}
                          </span>
                        </td>
                        <td className="programme-table__bar">
                          <span className="programme-bar" title={`${p.total} enrollments`}>
                            <span style={{ width: p.total ? `max(${(p.total / topTotal) * 100}%, 6px)` : 0 }} />
                            <strong>{p.total}</strong>
                          </span>
                        </td>
                        <td className="num">{fmt.format(p.requested)}</td>
                        <td className="num">{fmt.format(p.active)}</td>
                        <td className="num">{fmt.format(p.completed)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>

            <Panel title="Coming up" note="Intakes and confirmed start dates">
              {!d && <div className="skeleton skeleton--block" />}
              {d?.upcoming.length === 0 && <p className="muted small">No intakes or start dates set yet.</p>}
              {d && d.no_intake > 0 && (
                <p className="panel__hint"><i className="fas fa-circle-info" /> {plural(d.no_intake, 'published programme')} without a next intake date.</p>
              )}
              <ul className="closing-list">
                {d?.upcoming.map((u) => {
                  const left = daysLeft(u.date);
                  return (
                    <li key={`${u.kind}-${u.id}-${u.date}`}>
                      <i className={`fas ${u.kind === 'intake' ? 'fa-door-open' : 'fa-user-graduate'} closing-list__icon`} aria-hidden="true" />
                      <span className="closing-list__main">
                        <Link to={u.kind === 'intake' ? `/admin/courses/${u.id}` : `/admin/students/${u.id}`}>{u.kind === 'intake' ? u.title : u.student}</Link>
                        <small>{u.kind === 'intake' ? 'New intake' : `Starts ${u.title}`} · {dayFmt.format(parseDay(u.date))}</small>
                      </span>
                      <span className={`closing-list__when${left <= 14 ? ' is-soon' : ''}`}>{left === 0 ? 'Today' : `${left} day${left === 1 ? '' : 's'}`}</span>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
};

export default TrainingOverview;

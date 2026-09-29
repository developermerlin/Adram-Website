// Platform-wide activity for admins: statistics, security signals and a filterable log of every event.
import { useCallback, useEffect, useState } from 'react';
import { adminAPI } from '../../services/api';
import { ACTIVITY_ICONS } from '../../config/roles';
import { formatDateTime, timeAgo } from '../../utils/format';
import { Alert } from '../ui/Form';
import { ColumnChart, HBars, Meter, MiniBars } from './charts';
import { Delta, StatTile } from './StatTile';

const fmt = new Intl.NumberFormat();
const dayFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const longDayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const parseDay = (iso) => new Date(`${iso}T00:00:00`);
const plural = (n, word, many = `${word}s`) => `${fmt.format(n)} ${n === 1 ? word : many}`;
const rate = (part, whole) => (whole ? Math.round((part / whole) * 100) : null);
const RANGES = [7, 30, 90];

const SERIES = [
  { key: 'events', label: 'All events' },
  { key: 'logins', label: 'Sign-ins' },
  { key: 'failed', label: 'Failed sign-ins' },
];

const FILTERS = [
  { value: '', label: 'All events' },
  { value: 'LOGIN', label: 'Sign-ins' },
  { value: 'FAILED_LOGIN', label: 'Failed sign-ins' },
  { value: 'REGISTRATION', label: 'Registrations' },
  { value: 'password', label: 'Password changes & resets' },
  { value: 'admin', label: 'Admin actions (approve, role, disable…)' },
  { value: 'PROFILE_UPDATE', label: 'Profile updates' },
  { value: 'EMAIL_VERIFICATION', label: 'Email verifications' },
  { value: 'LOGOUT', label: 'Sign-outs' },
];

const DEVICES = {
  desktop: { label: 'Desktop', icon: 'fa-desktop' },
  mobile: { label: 'Mobile', icon: 'fa-mobile-screen' },
  tablet: { label: 'Tablet', icon: 'fa-tablet-screen-button' },
  unknown: { label: 'Unknown', icon: 'fa-circle-question' },
};

// Daily points grouped into weeks for 90 days (a shorter period stays daily).
const toRows = (series, key) => {
  const size = series.length > 30 ? 7 : 1;
  const groups = [];
  for (let end = series.length; end > 0; end -= size) groups.unshift(series.slice(Math.max(0, end - size), end));
  return groups.map((g) => ({
    key: g[0].date,
    label: dayFmt.format(parseDay(g[0].date)),
    value: g.reduce((n, p) => n + p[key], 0),
    sub: g.length > 1 ? `${dayFmt.format(parseDay(g[0].date))} – ${dayFmt.format(parseDay(g[g.length - 1].date))}` : longDayFmt.format(parseDay(g[0].date)),
  }));
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

export const AdminActivity = ({ onOpenUser }) => {
  const [days, setDays] = useState(30);
  const [overview, setOverview] = useState(null);
  const [metric, setMetric] = useState('events');
  // Log filters
  const [action, setAction] = useState('');
  const [search, setSearch] = useState('');
  const [ip, setIp] = useState('');
  const [page, setPage] = useState(1);
  const [log, setLog] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    adminAPI.activityOverview(days).then(({ data }) => setOverview(data)).catch(() => {});
  }, [days]);

  const loadLog = useCallback(
    () =>
      adminAPI
        .activity({ action, search: search.trim(), ip, page })
        .then(({ data }) => {
          setLog(data);
          setError('');
        })
        .catch(() => setError('The activity log couldn’t be loaded.')),
    [action, search, ip, page],
  );

  useEffect(() => {
    const t = setTimeout(loadLog, 250); // debounce the search box
    return () => clearTimeout(t);
  }, [loadLog]);

  // Jump from a statistic to the matching events in the log below.
  const focusLog = (patch) => {
    setAction(patch.action ?? '');
    setIp(patch.ip ?? '');
    setSearch(patch.search ?? '');
    setPage(1);
    document.getElementById('activity-log')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const o = overview;
  const rows = o ? toRows(o.series, metric) : [];
  const metricLabel = SERIES.find((s) => s.key === metric).label;
  const failRate = o && rate(o.failed, o.failed + o.logins);
  const deviceTotal = o ? o.devices.reduce((n, d) => n + d.count, 0) : 0;
  const vs = `vs the previous ${days} days`;
  const hasFilters = action || search || ip;

  return (
    <div className="viz-root admin-ov users-ov">
      <div className="admin-ov__label users-ov__label">
        <h2><i className="fas fa-wave-square" aria-hidden="true" /> Platform activity</h2>
        <div className="period-switch" role="group" aria-label="Reporting period">
          <i className="far fa-calendar" aria-hidden="true" />
          {RANGES.map((d) => (
            <button key={d} type="button" className={days === d ? 'is-active' : ''} aria-pressed={days === d} onClick={() => setDays(d)}>{d} days</button>
          ))}
        </div>
      </div>

      <div className="kpi-grid">
        <StatTile label="Events" value={o && fmt.format(o.events)} icon="fa-wave-square"
          chart={o && <MiniBars series={o.series} valueKey="events" label={`Events per day, last ${days} days`} />}
          delta={o && <Delta now={o.events} prev={o.events_prev} vs={vs} />}>
          <span className="kpi__note">{o ? `${plural(o.password_events, 'password change')} · ${plural(o.admin_actions, 'admin action')}` : ''}</span>
        </StatTile>

        <StatTile label="Sign-ins" value={o && fmt.format(o.logins)} icon="fa-right-to-bracket" tone="cyan"
          chart={o && <MiniBars series={o.series} valueKey="logins" label={`Sign-ins per day, last ${days} days`} />}
          delta={o && <Delta now={o.logins} prev={o.logins_prev} vs={vs} />}>
          <span className="kpi__note">{o ? `${plural(o.unique_users, 'person', 'people')} active in this period` : ''}</span>
        </StatTile>

        <StatTile label="Failed sign-ins" value={o && fmt.format(o.failed)} icon="fa-triangle-exclamation" tone={o && o.failed ? 'red' : 'green'}
          chart={o && <MiniBars series={o.series} valueKey="failed" label={`Failed sign-ins per day, last ${days} days`} />}
          delta={o && <Delta now={o.failed} prev={o.failed_prev} vs={vs} invert />}>
          <span className="kpi__note">{o ? `${failRate ?? 0}% of sign-in attempts failed` : ''}</span>
        </StatTile>

        <StatTile label="Admin actions" value={o && fmt.format(o.admin_actions)} icon="fa-user-shield" tone="violet"
          chart={<Meter value={o && rate(o.admin_actions, o.events)} label="Admin actions as a share of all events" />}>
          <span className="kpi__note">Approvals, rejections, role changes and suspensions</span>
        </StatTile>
      </div>

      <div className="dash-grid dash-grid--charts">
        <Panel
          title="Activity over time"
          note={o ? `${metricLabel} ${days > 30 ? 'per week' : 'per day'} · last ${days} days` : null}
          className="chart-card"
          action={
            <div className="period-switch period-switch--sm" role="group" aria-label="Measure">
              {SERIES.map((s) => (
                <button key={s.key} type="button" className={metric === s.key ? 'is-active' : ''} aria-pressed={metric === s.key} onClick={() => setMetric(s.key)}>
                  {s.key === 'events' ? 'All' : s.key === 'logins' ? 'Sign-ins' : 'Failed'}
                </button>
              ))}
            </div>
          }
        >
          {o ? <ColumnChart key={`${metric}-${days}`} rows={rows} name={metricLabel} average={days > 30 ? 'avg/week' : 'avg/day'} W={720} H={330} /> : <div className="skeleton skeleton--chart" />}
        </Panel>

        <Panel title="Events by type" note="Click a type to see those events">
          {!o && <div className="skeleton skeleton--block" />}
          {o && o.events === 0 && <p className="muted small">No events in this period.</p>}
          {o && o.events > 0 && (
            <ul className="type-list">
              {o.by_action.filter((a) => a.count > 0).sort((a, b) => b.count - a.count).map((a) => (
                <li key={a.action}>
                  <button type="button" onClick={() => focusLog({ action: a.action })} className={a.action === 'FAILED_LOGIN' ? 'is-warning' : ''}>
                    <i className={`fas ${ACTIVITY_ICONS[a.action] || 'fa-circle-dot'}`} aria-hidden="true" />
                    <span>{a.label}</span>
                    <strong>{fmt.format(a.count)}</strong>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="dash-grid dash-grid--three">
        <Panel title="Failed sign-ins by IP" note="Many attempts from one address can mean password guessing">
          {!o && <div className="skeleton skeleton--block" />}
          {o?.failed_ips.length === 0 && <p className="muted small"><i className="fas fa-shield-halved" /> No failed sign-ins in this period.</p>}
          {o && o.failed_ips.length > 0 && (
            <table className="rank-table">
              <thead>
                <tr><th scope="col">IP address</th><th scope="col" className="num">Tries</th><th scope="col" className="num">Accounts</th></tr>
              </thead>
              <tbody>
                {o.failed_ips.map((r) => (
                  <tr key={r.ip}>
                    <td>
                      <button type="button" className="link-button link-button--ink mono" onClick={() => focusLog({ ip: r.ip })} title={`Last attempt ${formatDateTime(r.last)}`}>{r.ip}</button>
                      <small className="rank-table__sub">last {timeAgo(r.last)}</small>
                    </td>
                    <td className="num">{fmt.format(r.count)}</td>
                    <td className="num">{fmt.format(r.accounts)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="Accounts with failed sign-ins" note="People who may be locked out, or targeted">
          {!o && <div className="skeleton skeleton--block" />}
          {o?.failed_accounts.length === 0 && <p className="muted small"><i className="fas fa-shield-halved" /> Nobody had a failed sign-in.</p>}
          <ul className="closing-list">
            {o?.failed_accounts.map((a) => (
              <li key={a.user_id}>
                <i className="fas fa-user-lock closing-list__icon" aria-hidden="true" />
                <span className="closing-list__main">
                  <button type="button" className="link-button link-button--ink" onClick={() => onOpenUser?.(a.user_id)}>{a.name || a.email}</button>
                  <small>{a.email} · last {timeAgo(a.last)}</small>
                </span>
                <button type="button" className="closing-list__when is-soon closing-list__btn" onClick={() => focusLog({ action: 'FAILED_LOGIN', search: a.email })} title="Show these attempts">
                  {plural(a.count, 'try', 'tries')}
                </button>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Sign-in devices" note={o ? `${plural(deviceTotal, 'sign-in')} in this period` : null}>
          {!o && <div className="skeleton skeleton--block" />}
          {o && (
            <ul className="split-list">
              {o.devices.filter((d) => d.key !== 'unknown' || d.count > 0).map((d) => (
                <li key={d.key}>
                  <span className="split-list__top">
                    <strong><i className={`fas ${DEVICES[d.key].icon} split-list__icon`} aria-hidden="true" /> {DEVICES[d.key].label}</strong>
                    <span>{fmt.format(d.count)} <small className="muted">· {rate(d.count, deviceTotal) ?? 0}%</small></span>
                  </span>
                  <Meter value={rate(d.count, deviceTotal)} label={`${DEVICES[d.key].label} share of sign-ins`} />
                </li>
              ))}
            </ul>
          )}
          {o && o.most_active.length > 0 && (
            <>
              <h3 className="panel__subhead">Most active people</h3>
              <HBars rows={o.most_active.map((u) => ({ key: u.user_id, label: u.name || u.email, value: u.count }))} />
            </>
          )}
        </Panel>
      </div>

      {/* The log itself */}
      <section className="card table-card" id="activity-log">
        <div className="table-card__head">
          <div className="table-card__filters">
            <div className="input-icon">
              <i className="fas fa-magnifying-glass" aria-hidden="true" />
              <input type="search" className="input" placeholder="Search person, email, IP or detail" aria-label="Search activity" value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </div>
            <select className="input" aria-label="Filter by event type" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}>
              {FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
            {ip && (
              <button type="button" className="chip is-active" onClick={() => { setIp(''); setPage(1); }}>
                IP {ip} <i className="fas fa-xmark" aria-hidden="true" />
              </button>
            )}
            {hasFilters && <button type="button" className="btn btn--text btn--sm" onClick={() => focusLog({})}>Clear filters</button>}
          </div>
          <span className="muted small">{log ? plural(log.count, 'event') : 'Loading…'}</span>
        </div>

        {error && <Alert>{error}</Alert>}

        <div className="table-scroll">
          <table className="table table--catalog activity-table">
            <thead>
              <tr><th>Event</th><th>Person</th><th>IP address</th><th>Device</th><th className="col-when">When</th></tr>
            </thead>
            <tbody className={log ? '' : 'is-loading'}>
              {log?.results.length === 0 && (
                <tr><td colSpan="5" className="table__empty"><i className="fas fa-wave-square" /> No events match your filters.</td></tr>
              )}
              {log?.results.map((e) => (
                <tr key={e.id} className={e.action === 'FAILED_LOGIN' ? 'is-warning' : ''}>
                  <td>
                    <span className="activity-table__event">
                      <span className={`activity-table__icon activity-table__icon--${e.action.toLowerCase()}`}><i className={`fas ${ACTIVITY_ICONS[e.action] || 'fa-circle-dot'}`} aria-hidden="true" /></span>
                      <span className="title-cell">
                        <strong>{e.action_display}</strong>
                        {e.description && <small>{e.description}</small>}
                      </span>
                    </span>
                  </td>
                  <td>
                    <button type="button" className="title-cell link-button link-button--ink" onClick={() => onOpenUser?.(e.user)}>
                      <strong>{e.user_name || e.user_email}</strong>
                      <small>{e.user_email}</small>
                    </button>
                  </td>
                  <td>{e.ip_address ? <button type="button" className="link-button mono" onClick={() => focusLog({ ip: e.ip_address })}>{e.ip_address}</button> : <span className="muted">—</span>}</td>
                  <td><span className="device-cell"><i className={`fas ${DEVICES[e.device]?.icon || 'fa-circle-question'}`} aria-hidden="true" /> {DEVICES[e.device]?.label || 'Unknown'}</span></td>
                  <td className="col-when">
                    <div className="cell-stack">
                      <span>{timeAgo(e.timestamp)}</span>
                      <small>{formatDateTime(e.timestamp)}</small>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {(log?.next || log?.previous) && (
          <div className="table-card__foot">
            <span className="muted small">Page {page}</span>
            <div className="pager">
              <button type="button" className="btn btn--outline btn--sm" disabled={!log.previous} onClick={() => setPage((p) => p - 1)}><i className="fas fa-chevron-left" /> Newer</button>
              <button type="button" className="btn btn--outline btn--sm" disabled={!log.next} onClick={() => setPage((p) => p + 1)}>Older <i className="fas fa-chevron-right" /></button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default AdminActivity;

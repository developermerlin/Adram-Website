// Statistics above the personal activity log: sign-ins, the previous session, failed attempts, password age,
// where and on what the account was used, and a short security checklist.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { authAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { ACTIVITY_ICONS } from '../../config/roles';
import { formatDateTime, timeAgo } from '../../utils/format';
import { ColumnChart, Meter, MiniBars } from '../admin/charts';
import { Delta, StatTile } from '../admin/StatTile';

const fmt = new Intl.NumberFormat();
const dayFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const longDayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const parseDay = (iso) => new Date(`${iso}T00:00:00`);
const plural = (n, word) => `${fmt.format(n)} ${word}${n === 1 ? '' : 's'}`;
const rate = (part, whole) => (whole ? Math.round((part / whole) * 100) : null);
const HIDE_KEY = 'adram-my-activity-stats-hidden';
const RANGES = [7, 30, 90];
const PASSWORD_OLD_DAYS = 180;

const DEVICES = {
  desktop: { label: 'Computer', icon: 'fa-desktop' },
  mobile: { label: 'Phone', icon: 'fa-mobile-screen' },
  tablet: { label: 'Tablet', icon: 'fa-tablet-screen-button' },
  unknown: { label: 'Unknown', icon: 'fa-circle-question' },
};

const SERIES = [
  { key: 'events', label: 'All' },
  { key: 'logins', label: 'Sign-ins' },
  { key: 'failed', label: 'Failed' },
];

const daysSince = (iso) => (iso ? Math.floor((Date.now() - new Date(iso)) / 86400000) : null);

// A longer period reads better by week.
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

export const MyActivityInsights = () => {
  const { user } = useAuth();
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [metric, setMetric] = useState('events');
  const [hidden, setHidden] = useState(readHidden);

  useEffect(() => {
    if (hidden) return;
    authAPI.getActivityOverview(days).then(({ data: d }) => setData(d)).catch(() => {});
  }, [days, hidden]);

  const toggle = () =>
    setHidden((h) => {
      try {
        localStorage.setItem(HIDE_KEY, h ? '0' : '1');
      } catch {
        // storage blocked: the choice lasts until the page is closed
      }
      return !h;
    });

  const d = data;
  const vs = `vs the previous ${days} days`;
  const rows = d ? toRows(d.series, metric) : [];
  const passwordAge = d ? daysSince(d.password_changed_at) : null;
  const deviceTotal = d ? d.devices.reduce((n, x) => n + x.count, 0) : 0;
  const usedDevices = d ? d.devices.filter((x) => x.count > 0 && x.key !== 'unknown').length : 0;

  const checks = d
    ? [
        { ok: user?.is_verified !== false, text: user?.is_verified !== false ? 'Your email address is verified' : 'Verify your email address' },
        {
          ok: passwordAge !== null && passwordAge <= PASSWORD_OLD_DAYS,
          text: passwordAge === null ? 'You haven’t changed your password yet' : passwordAge <= PASSWORD_OLD_DAYS ? `Password changed ${plural(passwordAge, 'day')} ago` : `Your password is ${plural(passwordAge, 'day')} old — consider changing it`,
          link: passwordAge === null || passwordAge > PASSWORD_OLD_DAYS ? { to: '/profile', label: 'Change password' } : null,
        },
        {
          ok: d.failed === 0,
          text: d.failed === 0 ? `No failed sign-ins in the last ${days} days` : `${plural(d.failed, 'failed sign-in')} in the last ${days} days — check it was you`,
        },
        { ok: true, text: 'Every sign-in is confirmed with a code sent to your email' },
      ]
    : [];

  return (
    <div className="viz-root admin-ov users-ov student-ov">
      <div className="admin-ov__label users-ov__label">
        <h2><i className="fas fa-shield-halved" aria-hidden="true" /> Your account at a glance</h2>
        <div className="users-ov__tools">
          {!hidden && (
            <div className="period-switch period-switch--sm" role="group" aria-label="Reporting period">
              {RANGES.map((r) => (
                <button key={r} type="button" className={days === r ? 'is-active' : ''} aria-pressed={days === r} onClick={() => setDays(r)}>{r} days</button>
              ))}
            </div>
          )}
          <button type="button" className="btn btn--text btn--sm" onClick={toggle} aria-expanded={!hidden}>
            <i className={`fas ${hidden ? 'fa-chevron-down' : 'fa-chevron-up'}`} /> {hidden ? 'Show statistics' : 'Hide statistics'}
          </button>
        </div>
      </div>

      {!hidden && (
        <>
          <div className="kpi-grid">
            <StatTile label="Sign-ins" value={d && fmt.format(d.logins)} icon="fa-right-to-bracket"
              chart={d && <MiniBars series={d.series} valueKey="logins" label={`Your sign-ins per day, last ${days} days`} />}
              delta={d && <Delta now={d.logins} prev={d.logins_prev} vs={vs} />}>
              <span className="kpi__note">{d ? `Active on ${plural(d.active_days, 'day')} of the last ${days}` : ''}</span>
            </StatTile>

            <StatTile label="Previous sign-in" value={d && (d.previous_login ? timeAgo(d.previous_login.at) : '—')} icon="fa-clock-rotate-left" tone="cyan">
              <span className="kpi__note">
                {d && (d.previous_login
                  ? `${DEVICES[d.previous_login.device].label}${d.previous_login.ip ? ` · IP ${d.previous_login.ip}` : ''} · ${formatDateTime(d.previous_login.at)}`
                  : 'This is your first sign-in')}
              </span>
            </StatTile>

            <StatTile label="Failed sign-ins" value={d && fmt.format(d.failed)} icon="fa-triangle-exclamation" tone={d && d.failed ? 'red' : 'green'}
              chart={d && d.failed > 0 ? <MiniBars series={d.series} valueKey="failed" label={`Failed sign-ins per day, last ${days} days`} /> : null}
              delta={d && d.failed > 0 ? <Delta now={d.failed} prev={d.failed_prev} vs={vs} invert /> : null}>
              <span className="kpi__note">{d ? (d.failed ? `Last one ${timeAgo(d.last_failed_at)} · wrong password or code` : 'Nobody tried to get into your account') : ''}</span>
            </StatTile>

            <StatTile label="Password age" value={d && (passwordAge === null ? 'Original' : plural(passwordAge, 'day'))} icon="fa-key"
              tone={passwordAge !== null && passwordAge <= PASSWORD_OLD_DAYS ? 'green' : 'amber'}
              chart={<Meter value={passwordAge === null ? 100 : rate(Math.min(passwordAge, PASSWORD_OLD_DAYS), PASSWORD_OLD_DAYS)} label="How close your password is to six months old" />}>
              <span className="kpi__note">
                {d ? (passwordAge === null ? 'Not changed since you joined · ' : `Changed ${formatDateTime(d.password_changed_at)} · `) : ''}
                {d && <Link to="/profile">Change it</Link>}
              </span>
            </StatTile>
          </div>

          <div className="dash-grid dash-grid--charts">
            <Panel
              title="Your activity"
              note={d ? `${SERIES.find((s) => s.key === metric).label === 'All' ? 'Everything you did' : SERIES.find((s) => s.key === metric).label} ${days > 30 ? 'per week' : 'per day'} · last ${days} days` : null}
              className="chart-card"
              action={
                <div className="period-switch period-switch--sm" role="group" aria-label="Measure">
                  {SERIES.map((s) => (
                    <button key={s.key} type="button" className={metric === s.key ? 'is-active' : ''} aria-pressed={metric === s.key} onClick={() => setMetric(s.key)}>{s.label}</button>
                  ))}
                </div>
              }
            >
              {d ? <ColumnChart key={`${metric}-${days}`} rows={rows} name={SERIES.find((s) => s.key === metric).label} average={days > 30 ? 'avg/week' : 'avg/day'} W={720} H={230} /> : <div className="skeleton skeleton--chart" />}
            </Panel>

            <Panel title="Where you signed in" note="Addresses your account was used from, latest first">
              {!d && <div className="skeleton skeleton--block" />}
              {d?.addresses.length === 0 && <p className="muted small">No sign-ins in this period.</p>}
              <ul className="closing-list">
                {d?.addresses.map((a) => (
                  <li key={a.ip}>
                    <i className={`fas ${a.failed && !a.logins ? 'fa-triangle-exclamation' : 'fa-location-dot'} closing-list__icon`} aria-hidden="true" />
                    <span className="closing-list__main">
                      <strong className="mono">{a.ip}</strong>
                      <small>{plural(a.logins, 'sign-in')}{a.failed ? ` · ${plural(a.failed, 'failed attempt')}` : ''} · last {timeAgo(a.last)}</small>
                    </span>
                    {a.failed > 0 && <span className="closing-list__when is-soon">Check</span>}
                  </li>
                ))}
              </ul>
              {d && d.addresses.some((a) => a.failed) && (
                <p className="panel__hint"><i className="fas fa-circle-info" /> Don’t recognise an address with failed attempts? Change your password from Profile &amp; security.</p>
              )}
            </Panel>
          </div>

          <div className="dash-grid dash-grid--three">
            <Panel title="What you did" note={d ? plural(d.events, 'event') : null}>
              {!d && <div className="skeleton skeleton--block" />}
              {d && d.events === 0 && <p className="muted small">Nothing in this period.</p>}
              {d && d.events > 0 && (
                <ul className="type-list type-list--static">
                  {d.by_action.filter((a) => a.count > 0).sort((a, b) => b.count - a.count).map((a) => (
                    <li key={a.action} className={a.action === 'FAILED_LOGIN' ? 'is-warning' : ''}>
                      <i className={`fas ${ACTIVITY_ICONS[a.action] || 'fa-circle-dot'}`} aria-hidden="true" />
                      <span>{a.label}</span>
                      <strong>{fmt.format(a.count)}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Your devices" note={d ? `${plural(usedDevices, 'kind')} of device · ${plural(deviceTotal, 'sign-in')}` : null}>
              {!d && <div className="skeleton skeleton--block" />}
              {d && deviceTotal === 0 && <p className="muted small">No sign-ins in this period.</p>}
              {d && deviceTotal > 0 && (
                <ul className="split-list">
                  {d.devices.filter((x) => x.count > 0).map((x) => (
                    <li key={x.key}>
                      <span className="split-list__top">
                        <strong><i className={`fas ${DEVICES[x.key].icon} split-list__icon`} aria-hidden="true" /> {DEVICES[x.key].label}</strong>
                        <span>{fmt.format(x.count)} <small className="muted">· {rate(x.count, deviceTotal)}%</small></span>
                      </span>
                      <Meter value={rate(x.count, deviceTotal)} label={`${DEVICES[x.key].label} share of your sign-ins`} />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Account security" note={d ? `Member since ${longDayFmt.format(new Date(d.member_since))}` : null}>
              {!d && <div className="skeleton skeleton--block" />}
              <ul className="security-checks">
                {checks.map((c) => (
                  <li key={c.text} className={c.ok ? 'is-ok' : 'is-warn'}>
                    <i className={`fas ${c.ok ? 'fa-circle-check' : 'fa-circle-exclamation'}`} aria-hidden="true" />
                    <span>{c.text}{c.link && <> · <Link to={c.link.to}>{c.link.label}</Link></>}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
};

export default MyActivityInsights;

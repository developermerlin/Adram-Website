// Statistics above the Users table: growth, engagement, approval and verification cards, then charts.
import { useEffect, useState } from 'react';
import { adminAPI } from '../../services/api';
import { ColumnChart, HBars, Meter, MiniBars, StatusStack } from './charts';
import { Delta, StatTile } from './StatTile';

const fmt = new Intl.NumberFormat();
const dayFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const parseDay = (iso) => new Date(`${iso}T00:00:00`);
const plural = (n, word) => `${fmt.format(n)} ${word}${n === 1 ? '' : 's'}`;
const rate = (part, whole) => (whole ? Math.round((part / whole) * 100) : null);
const HIDE_KEY = 'adram-users-stats-hidden';

// Fixed status colours, always with an icon and label (same as the overview page).
const STATUS_SEGMENTS = [
  { key: 'approved', label: 'Approved', icon: 'fa-circle-check', color: 'var(--status-good)' },
  { key: 'pending', label: 'Pending approval', icon: 'fa-hourglass-half', color: 'var(--status-warning)' },
  { key: 'rejected', label: 'Rejected', icon: 'fa-circle-xmark', color: 'var(--status-critical)' },
  { key: 'suspended', label: 'Disabled', icon: 'fa-ban', color: 'var(--status-serious)' },
];

const METHOD_ICONS = { email: 'fa-envelope', google: 'fa-google', facebook: 'fa-facebook-f', github: 'fa-github' };

// "36 h" under two days, otherwise "3.5 days"
const duration = (hours) => (hours < 48 ? `${Math.round(hours)} h` : `${Math.round((hours / 24) * 10) / 10} days`);

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

export const UsersOverview = ({ version = 0, onPickStatus }) => {
  const [data, setData] = useState(null);
  const [hidden, setHidden] = useState(readHidden);

  useEffect(() => {
    adminAPI.getOverview().then(({ data: d }) => setData(d)).catch(() => {});
  }, [version]);

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
  const activeRate = d && rate(d.active_30, d.total);
  const verifiedRate = d && rate(d.verified, d.total);
  const methodTotal = d ? d.methods.reduce((n, m) => n + m.count, 0) : 0;

  return (
    <div className="viz-root admin-ov users-ov">
      <div className="admin-ov__label users-ov__label">
        <h2><i className="fas fa-chart-pie" aria-hidden="true" /> User statistics</h2>
        <button type="button" className="btn btn--text btn--sm" onClick={toggle} aria-expanded={!hidden}>
          <i className={`fas ${hidden ? 'fa-chevron-down' : 'fa-chevron-up'}`} /> {hidden ? 'Show statistics' : 'Hide statistics'}
        </button>
      </div>

      {!hidden && (
        <>
          <div className="kpi-grid">
            <StatTile
              label="Total users"
              value={d && fmt.format(d.total)}
              icon="fa-users"
              chart={weekly.length > 0 && <MiniBars series={weekly} valueKey="count" label="New sign-ups per week, last 12 weeks" />}
              delta={d && <Delta now={d.new_7} prev={d.new_prev_7} vs="New sign-ups vs the previous 7 days" />}
            >
              <span className="kpi__note">{d ? `${plural(d.new_7, 'new sign-up')} in the last 7 days` : ''}</span>
            </StatTile>

            <StatTile
              label="Active users"
              value={d && fmt.format(d.active_30)}
              icon="fa-user-clock"
              tone="cyan"
              chart={<Meter value={activeRate} label="Share of all accounts that signed in in the last 30 days" />}
              delta={d && <Delta now={d.active_30} prev={d.active_prev_30} vs="vs the previous 30 days" />}
            >
              <span className="kpi__note">{d ? `Signed in within 30 days · ${activeRate ?? 0}% of all accounts` : ''}</span>
            </StatTile>

            <StatTile
              label="Awaiting approval"
              value={d && fmt.format(d.pending)}
              icon="fa-hourglass-half"
              tone="amber"
              to="/admin/users?status=pending"
              action="Show pending accounts"
            >
              <span className="kpi__note">
                {d
                  ? [
                      d.oldest_pending_days !== null ? `Oldest waiting ${plural(d.oldest_pending_days, 'day')}` : 'Nobody waiting',
                      d.avg_approval_hours !== null ? `approved in ${duration(d.avg_approval_hours)} on average` : null,
                    ].filter(Boolean).join(' · ')
                  : ''}
              </span>
            </StatTile>

            <StatTile
              label="Email verified"
              value={d && (verifiedRate === null ? '—' : `${verifiedRate}%`)}
              icon="fa-envelope-circle-check"
              tone="green"
              chart={<Meter value={verifiedRate} label="Share of accounts with a verified email" />}
            >
              <span className="kpi__note">{d ? `${fmt.format(d.unverified)} unverified · ${fmt.format(d.never_signed_in)} never signed in` : ''}</span>
            </StatTile>
          </div>

          <div className="dash-grid dash-grid--charts">
            <Panel title="New sign-ups per week" note={d ? `Last 12 weeks · ${plural(weekRows.reduce((n, r) => n + r.value, 0), 'account')} created` : null} className="chart-card">
              {d ? <ColumnChart rows={weekRows} name="New sign-ups" average="avg/week" W={720} H={240} /> : <div className="skeleton skeleton--chart" />}
            </Panel>
            <Panel title="Account status" note="Click a status to filter the table">
              {d ? (
                <>
                  <StatusStack total={d.total} segments={STATUS_SEGMENTS.map((s) => ({ ...s, value: d[s.key] }))} />
                  <div className="users-ov__filters">
                    {STATUS_SEGMENTS.map((s) => (
                      <button key={s.key} type="button" className="chip" onClick={() => onPickStatus?.(s.key)}>
                        <i className={`fas ${s.icon}`} aria-hidden="true" /> {s.label}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="skeleton skeleton--block" />
              )}
            </Panel>
          </div>

          <div className="dash-grid dash-grid--three">
            <Panel title="Users by role">
              {d ? <HBars rows={d.roles.map((r) => ({ key: r.role, label: r.label, value: r.count }))} /> : <div className="skeleton skeleton--block" />}
            </Panel>

            <Panel title="Sign-in methods" note="How accounts sign in">
              {!d && <div className="skeleton skeleton--block" />}
              {d && (
                <ul className="split-list">
                  {d.methods.map((m) => (
                    <li key={m.key}>
                      <span className="split-list__top">
                        <strong><i className={`${m.key === 'email' ? 'fas' : 'fab'} ${METHOD_ICONS[m.key] || 'fa-key'} split-list__icon`} aria-hidden="true" /> {m.label}</strong>
                        <span>{fmt.format(m.count)}</span>
                      </span>
                      <Meter value={rate(m.count, methodTotal)} label={`${m.label} share of accounts`} />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Where users are" note="Country of residence">
              {!d && <div className="skeleton skeleton--block" />}
              {d?.countries.length === 0 && <p className="muted small">No countries recorded yet.</p>}
              {d && d.countries.length > 0 && <HBars rows={d.countries.map((c) => ({ key: c.label, label: c.label, value: c.count }))} />}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
};

export default UsersOverview;

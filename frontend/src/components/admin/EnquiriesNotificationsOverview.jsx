// "Enquiries & notifications" on the admin Overview: contact-form messages and partnership requests (volume, unread,
// what people ask about, when they write) and the in-site notifications the portal sends (volume, read rate, types,
// who receives them), for the dashboard's period compared with the one before.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { contactAPI } from '../../services/api';
import { timeAgo } from '../../utils/format';
import { ColumnChart, HBars, Heatmap, Meter, MiniBars, StatusStack } from './charts';
import { Delta, StatTile } from './StatTile';

const fmt = new Intl.NumberFormat();
const dayFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const longDayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const plural = (n, word, many = `${word}s`) => `${fmt.format(n)} ${n === 1 ? word : many}`;
const parseDay = (iso) => new Date(`${iso}T00:00:00`);
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_PARTS = ['12am', '3am', '6am', '9am', '12pm', '3pm', '6pm', '9pm'];

const METRICS = [
  { key: 'enquiries', label: 'Enquiries', note: 'Contact-form messages and partnership requests' },
  { key: 'notifications', label: 'Notifications sent', note: 'In-site notifications sent to everyone' },
  { key: 'notifications_read', label: 'Notifications read', note: 'Notifications sent in the period that have been read' },
];

// Statuses use the fixed status colours, always with an icon and a label.
const PARTNER_SEGMENTS = {
  new: { icon: 'fa-inbox', color: 'var(--status-warning)' },
  contacted: { icon: 'fa-phone', color: 'var(--viz-accent)' },
  approved: { icon: 'fa-circle-check', color: 'var(--status-good)' },
  declined: { icon: 'fa-circle-xmark', color: 'var(--status-critical)' },
};

// Daily points grouped into periods of `size` days counted back from today (1 = daily).
const groupDays = (points, key, size) => {
  const groups = [];
  for (let end = points.length; end > 0; end -= size) groups.unshift(points.slice(Math.max(0, end - size), end));
  return groups.map((g) => ({
    key: g[0].date,
    label: dayFmt.format(parseDay(g[0].date)),
    value: g.reduce((n, p) => n + p[key], 0),
    sub: g.length > 1 ? `${dayFmt.format(parseDay(g[0].date))} – ${dayFmt.format(parseDay(g[g.length - 1].date))}` : longDayFmt.format(parseDay(g[0].date)),
  }));
};

const Panel = ({ title, note, link, linkLabel, ready = true, className = '', children }) => (
  <section className={`card panel ${className}`}>
    <div className="panel__head">
      <div>
        <h2 className="h3">{title}</h2>
        {note && <p className="muted small">{note}</p>}
      </div>
      {link && <Link to={link} className="panel__link">{linkLabel}</Link>}
    </div>
    {ready ? children : <div className="skeleton skeleton--block" />}
  </section>
);

export const EnquiriesNotificationsOverview = ({ days }) => {
  const [data, setData] = useState(null);
  const [loadedDays, setLoadedDays] = useState(null);
  const [metric, setMetric] = useState('enquiries');

  useEffect(() => {
    let live = true;
    contactAPI.stats(days).then(({ data: d }) => {
      if (live) { setData(d); setLoadedDays(days); }
    }).catch(() => {});
    return () => { live = false; };
  }, [days]);

  const e = data?.enquiries;
  const n = data?.notifications;
  const series = data?.series || [];
  const vs = `vs previous ${days} days`;
  const step = days > 30 ? 7 : 1;
  const active = METRICS.find((m) => m.key === metric);
  const rows = series.length ? groupDays(series, metric, step) : [];
  const total = (key) => series.reduce((sum, p) => sum + p[key], 0);
  const refreshing = data && loadedDays !== days;

  return (
    <div className={`dash-refresh${refreshing ? ' is-refreshing' : ''}`}>
      <div className="admin-ov__label">
        <h2><i className="fas fa-envelope-open-text" aria-hidden="true" /> Enquiries &amp; notifications</h2>
        <span>Last {days} days, compared with the {days} days before</span>
      </div>

      <div className="kpi-grid">
        <StatTile label="Enquiries received" value={e && fmt.format(e.total)} icon="fa-envelope" to="/admin/messages" action="Open the inbox"
          chart={series.length > 0 && <MiniBars series={series} valueKey="enquiries" label={`Enquiries per day, last ${days} days`} />}
          delta={e && <Delta now={e.total} prev={e.total_prev} vs={vs} />}>
          <span className="kpi__note">{e ? `${plural(e.contact, 'contact message')} · ${plural(e.partnerships, 'partnership request')}` : ''}</span>
        </StatTile>

        <StatTile label="Unread enquiries" value={e && fmt.format(e.unread)} icon="fa-envelope-circle-check" tone={e && e.unread ? 'amber' : 'green'}
          to="/admin/messages" action="Read them"
          chart={<Meter value={e?.read_rate} label={`Share of this period’s contact messages that have been read`} />}>
          <span className="kpi__note">
            {e && (e.unread ? `Oldest unread: ${timeAgo(e.oldest_unread)}` : 'Every message has been read')}
            {e && e.read_rate !== null ? ` · ${e.read_rate}% read` : ''}
          </span>
        </StatTile>

        <StatTile label="Notifications sent" value={n && fmt.format(n.sent)} icon="fa-bell" tone="violet"
          chart={series.length > 0 && <MiniBars series={series} valueKey="notifications" label={`Notifications sent per day, last ${days} days`} />}
          delta={n && <Delta now={n.sent} prev={n.sent_prev} vs={vs} />}>
          <span className="kpi__note">{n ? `To ${plural(n.recipients, 'person', 'people')}` : ''}</span>
        </StatTile>

        <StatTile label="Notification read rate" value={n ? (n.read_rate === null ? '—' : `${n.read_rate}%`) : null} icon="fa-eye" tone="cyan"
          chart={<Meter value={n?.read_rate} label="Share of this period’s notifications that have been read" />}>
          <span className="kpi__note">{n ? `${fmt.format(n.read)} of ${fmt.format(n.sent)} read · ${plural(n.unread_total, 'unread notification')} in total` : ''}</span>
        </StatTile>
      </div>

      <div className="dash-grid dash-grid--charts">
        <section className="card panel chart-card">
          <div className="panel__head">
            <div>
              <h2 className="h3">Over time</h2>
              <p className="muted small">{active.note} · {step === 7 ? 'per week' : 'per day'}, last {days} days</p>
            </div>
          </div>
          <div className="metric-tabs" role="tablist" aria-label="Enquiry and notification metric">
            {METRICS.map((m) => (
              <button key={m.key} type="button" role="tab" aria-selected={metric === m.key}
                className={`metric-tab${metric === m.key ? ' is-active' : ''}`} onClick={() => setMetric(m.key)}>
                <span>{m.label}</span>
                <strong>{series.length ? fmt.format(total(m.key)) : '—'}</strong>
              </button>
            ))}
          </div>
          {series.length === 0 ? <div className="skeleton skeleton--chart" /> : (
            <ColumnChart key={`${metric}-${days}`} rows={rows} name={active.label} average={step === 7 ? 'avg/week' : 'avg/day'} W={720} H={260} />
          )}
        </section>

        <Panel title="What people ask about" note="Most common subjects on the contact form" link="/admin/messages" linkLabel="Inbox" ready={Boolean(e)}>
          {e?.top_subjects.length === 0 && <p className="muted small">No contact messages in this period.</p>}
          {e && e.top_subjects.length > 0 && <HBars rows={e.top_subjects.map((s) => ({ key: s.label, label: s.label, value: s.count }))} />}
          {e && (
            <>
              <h3 className="panel__subhead">Where enquiries come from</h3>
              <HBars rows={[{ key: 'contact', label: 'Contact form', value: e.contact }, { key: 'partners', label: 'Partnerships', value: e.partnerships }]} />
            </>
          )}
        </Panel>
      </div>

      <div className="dash-grid dash-grid--three">
        <Panel title="When enquiries arrive" note={`By day and time, last ${days} days`} ready={Boolean(e)}>
          {e && <Heatmap grid={e.heatmap} rowLabels={WEEKDAYS} colLabels={DAY_PARTS} unit="enquiry message" />}
        </Panel>

        <Panel title="Notifications by type" note={`What the portal told people about, last ${days} days`} ready={Boolean(n)}>
          {n?.by_kind.length === 0 && <p className="muted small">No notifications in this period.</p>}
          {n && n.by_kind.length > 0 && <HBars rows={n.by_kind.map((k) => ({ key: k.key, label: k.label, value: k.count }))} />}
          {n && n.sent > 0 && (
            <>
              <h3 className="panel__subhead">Read or not</h3>
              <StatusStack total={n.sent} segments={[
                { key: 'read', label: 'Read', icon: 'fa-envelope-open', color: 'var(--status-good)', value: n.read },
                { key: 'unread', label: 'Not read yet', icon: 'fa-envelope', color: 'var(--status-warning)', value: n.sent - n.read },
              ]} />
            </>
          )}
        </Panel>

        <Panel title="Who gets notified" note="Notifications by the recipient’s role" ready={Boolean(n && e)}>
          {n?.by_role.length === 0 && <p className="muted small">No notifications in this period.</p>}
          {n && n.by_role.length > 0 && <HBars rows={n.by_role.map((r) => ({ key: r.key, label: r.label, value: r.count }))} />}
          {n && n.by_role.length > 0 && <p className="panel__foot">Reached {n.by_role.map((r) => `${plural(r.people, r.label.toLowerCase())}`).join(' · ')}</p>}
          {n && <p className="panel__foot">{n.admin_unread ? `${plural(n.admin_unread, 'notification')} for administrators not read yet` : 'Administrators have read every notification'}</p>}
          {e && (
            <>
              <h3 className="panel__subhead">Partnership requests, all time</h3>
              <StatusStack total={e.partnership_status.reduce((sum, s) => sum + s.count, 0)}
                segments={e.partnership_status.map((s) => ({ ...s, ...PARTNER_SEGMENTS[s.key], value: s.count }))} />
              <p className="panel__foot"><Link to="/admin/partners?tab=applications" className="panel__link">Review partnership requests</Link></p>
            </>
          )}
        </Panel>
      </div>
    </div>
  );
};

export default EnquiriesNotificationsOverview;

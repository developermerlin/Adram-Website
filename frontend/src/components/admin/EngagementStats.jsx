// Statistic cards for the Enquiries page and the Notifications page, in the same style as the admin Overview.
// Both read /contact/stats/ (admins only) for the chosen period, compared with the period before.
import { useEffect, useState } from 'react';
import { contactAPI } from '../../services/api';
import { timeAgo } from '../../utils/format';
import { Meter, MiniBars } from './charts';
import { Delta, StatTile } from './StatTile';

const fmt = new Intl.NumberFormat();
const plural = (n, word, many = `${word}s`) => `${fmt.format(n)} ${n === 1 ? word : many}`;
const RANGES = [7, 30, 90];

/** Loads the statistics for a period; reloads when the period or `refreshKey` changes. */
const useStats = (days, refreshKey) => {
  const [data, setData] = useState(null);
  useEffect(() => {
    let live = true;
    contactAPI.stats(days).then(({ data: d }) => live && setData(d)).catch(() => {});
    return () => { live = false; };
  }, [days, refreshKey]);
  return data;
};

const Heading = ({ icon, title, days, setDays }) => (
  <div className="admin-ov__label stats-head">
    <h2><i className={`fas ${icon}`} aria-hidden="true" /> {title}</h2>
    <div className="period-switch" role="group" aria-label="Period">
      <i className="far fa-calendar" aria-hidden="true" />
      {RANGES.map((d) => (
        <button key={d} type="button" className={days === d ? 'is-active' : ''} aria-pressed={days === d} onClick={() => setDays(d)}>{d} days</button>
      ))}
    </div>
  </div>
);

/** Enquiries: received (contact form + partnership requests), unread, read rate, what people ask about. */
export const EnquiryStats = ({ refreshKey }) => {
  const [days, setDays] = useState(30);
  const data = useStats(days, refreshKey);
  const e = data?.enquiries;
  const series = data?.series || [];
  const vs = `vs previous ${days} days`;
  return (
    <div className="viz-root stats-block">
      <Heading icon="fa-chart-simple" title={`Enquiries, last ${days} days`} days={days} setDays={setDays} />
      <div className="kpi-grid">
        <StatTile label="Enquiries received" value={e && fmt.format(e.total)} icon="fa-envelope"
          chart={series.length > 0 && <MiniBars series={series} valueKey="enquiries" label={`Enquiries per day, last ${days} days`} />}
          delta={e && <Delta now={e.total} prev={e.total_prev} vs={vs} />}>
          <span className="kpi__note">{e ? `${plural(e.contact, 'contact message')} · ${plural(e.partnerships, 'partnership request')}` : ''}</span>
        </StatTile>
        <StatTile label="Unread" value={e && fmt.format(e.unread)} icon="fa-envelope-circle-check" tone={e && e.unread ? 'amber' : 'green'}
          chart={<Meter value={e && e.read_rate} label="Share of this period’s messages that have been read" />}>
          <span className="kpi__note">{e ? (e.unread ? `Oldest unread: ${timeAgo(e.oldest_unread)}` : 'Every message has been read') : ''}</span>
        </StatTile>
        <StatTile label="Read rate" value={e ? (e.read_rate === null ? '—' : `${e.read_rate}%`) : null} icon="fa-eye" tone="cyan"
          chart={<Meter value={e && e.read_rate} label="Read rate" />}>
          <span className="kpi__note">{e ? `Of the ${plural(e.contact, 'message')} received in this period` : ''}</span>
        </StatTile>
        <StatTile label="All time" value={e && fmt.format(e.all_time)} icon="fa-inbox" tone="violet" to="/admin/partners?tab=applications" action="Partnership requests">
          <span className="kpi__note">
            {e ? `${plural(e.partnerships_new, 'new partnership request')} waiting` : ''}
            {e && e.top_subjects[0] ? ` · most asked: ${e.top_subjects[0].label}` : ''}
          </span>
        </StatTile>
      </div>
    </div>
  );
};

/** Notifications across the whole portal (for administrators): sent, read rate, unread, who receives them. */
export const NotificationSiteStats = ({ refreshKey }) => {
  const [days, setDays] = useState(30);
  const data = useStats(days, refreshKey);
  const n = data?.notifications;
  const series = data?.series || [];
  return (
    <div className="viz-root stats-block">
      <Heading icon="fa-tower-broadcast" title={`Across the portal, last ${days} days`} days={days} setDays={setDays} />
      <div className="kpi-grid">
        <StatTile label="Notifications sent" value={n && fmt.format(n.sent)} icon="fa-bell" tone="violet"
          chart={series.length > 0 && <MiniBars series={series} valueKey="notifications" label={`Notifications sent per day, last ${days} days`} />}
          delta={n && <Delta now={n.sent} prev={n.sent_prev} vs={`vs previous ${days} days`} />}>
          <span className="kpi__note">{n ? `To ${plural(n.recipients, 'person', 'people')}` : ''}</span>
        </StatTile>
        <StatTile label="Read rate" value={n ? (n.read_rate === null ? '—' : `${n.read_rate}%`) : null} icon="fa-eye" tone="cyan"
          chart={<Meter value={n && n.read_rate} label="Share of this period’s notifications that have been read" />}>
          <span className="kpi__note">{n ? `${fmt.format(n.read)} of ${fmt.format(n.sent)} read` : ''}</span>
        </StatTile>
        <StatTile label="Unread in total" value={n && fmt.format(n.unread_total)} icon="fa-envelope" tone={n && n.unread_total ? 'amber' : 'green'}
          chart={series.length > 0 && <MiniBars series={series} valueKey="notifications_read" label={`Notifications read per day, last ${days} days`} />}>
          <span className="kpi__note">{n ? `${fmt.format(n.admin_unread)} of them for administrators` : ''}</span>
        </StatTile>
        <StatTile label="Most sent" value={n ? (n.by_kind[0]?.label || '—') : null} icon="fa-ranking-star" tone="green">
          <span className="kpi__note">
            {n && n.by_kind[0] ? `${plural(n.by_kind[0].count, 'notification')} of this type` : ''}
            {n && n.by_role[0] ? ` · mostly to: ${n.by_role.map((r) => `${r.label.toLowerCase()}s ${fmt.format(r.count)}`).join(', ')}` : ''}
          </span>
        </StatTile>
      </div>
    </div>
  );
};

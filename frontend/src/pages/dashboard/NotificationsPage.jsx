import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { notificationsAPI } from '../../services/api';
import PortalLayout from '../../components/layout/PortalLayout';
import { Alert } from '../../components/ui/Form';
import { NOTIFICATION_ICONS, NOTIFICATION_LABELS, NOTIFICATIONS_CHANGED } from '../../components/lms/notifications';
import { formatDateTime, timeAgo } from '../../utils/format';
import { useAuth } from '../../context/AuthContext';
import { Meter, MiniBars } from '../../components/admin/charts';
import { StatTile } from '../../components/admin/StatTile';
import { NotificationSiteStats } from '../../components/admin/EngagementStats';
import '../../styles/shop.css';

const changed = () => window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
const fmt = new Intl.NumberFormat();
const DAY = 86400000;

/** This person's own figures: unread, read rate, the last 14 days, the most common type. */
const MyNotificationStats = ({ refreshKey }) => {
  const [all, setAll] = useState(null);
  useEffect(() => {
    notificationsAPI.list({ limit: 200 }).then(({ data }) => setAll(data)).catch(() => {});
  }, [refreshKey]);
  const list = all?.notifications || [];
  const read = list.filter((x) => x.is_read).length;
  const readRate = list.length ? Math.round((read / list.length) * 100) : null;
  const today = new Date(new Date().toDateString()).getTime();
  const series = Array.from({ length: 14 }, (_, i) => {
    const start = today - (13 - i) * DAY;
    return { date: new Date(start).toISOString().slice(0, 10), count: list.filter((x) => { const t = new Date(x.created_at).getTime(); return t >= start && t < start + DAY; }).length };
  });
  const week = list.filter((x) => new Date(x.created_at).getTime() >= today - 6 * DAY).length;
  const kinds = list.reduce((m, x) => ({ ...m, [x.kind]: (m[x.kind] || 0) + 1 }), {});
  const top = Object.entries(kinds).sort((a, b) => b[1] - a[1])[0];
  return (
    <div className="viz-root stats-block">
      <div className="admin-ov__label stats-head"><h2><i className="fas fa-user" aria-hidden="true" /> Your notifications</h2></div>
      <div className="kpi-grid">
        <StatTile label="Unread" value={all && fmt.format(all.unread)} icon="fa-bell" tone={all && all.unread ? 'amber' : 'green'}>
          <span className="kpi__note">{all ? (all.unread ? 'Waiting for you below' : 'You’re all caught up') : ''}</span>
        </StatTile>
        <StatTile label="Last 7 days" value={all && fmt.format(week)} icon="fa-calendar-week" tone="violet"
          chart={all && <MiniBars series={series} valueKey="count" label="Notifications per day, last 14 days" />}>
          <span className="kpi__note">{all ? `${fmt.format(list.length)} in total` : ''}</span>
        </StatTile>
        <StatTile label="Read rate" value={all ? (readRate === null ? '—' : `${readRate}%`) : null} icon="fa-eye" tone="cyan"
          chart={<Meter value={readRate} label="Share of your notifications you have read" />}>
          <span className="kpi__note">{all ? `${fmt.format(read)} of ${fmt.format(list.length)} read` : ''}</span>
        </StatTile>
        <StatTile label="Most common" value={all ? (top ? NOTIFICATION_LABELS[top[0]] || 'Update' : '—') : null} icon={top ? NOTIFICATION_ICONS[top[0]] || 'fa-bell' : 'fa-bell'} tone="green">
          <span className="kpi__note">{top ? `${fmt.format(top[1])} of your notifications` : all ? 'Nothing yet' : ''}</span>
        </StatTile>
      </div>
    </div>
  );
};

/** The notification centre: everything the site told this person, newest first, with read/unread. */
export const NotificationsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [kind, setKind] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() =>
    notificationsAPI.list({ limit: 200, ...(unreadOnly ? { unread: 'true' } : {}), ...(kind ? { kind } : {}) })
      .then(({ data: d }) => {
        setData(d);
        setError('');
      })
      .catch(() => setError('Your notifications could not be loaded.')), [unreadOnly, kind]);
  useEffect(() => {
    load();
  }, [load]);

  const open = async (n) => {
    if (!n.is_read) {
      await notificationsAPI.markRead([n.id]).catch(() => {});
      changed();
    }
    if (n.link) navigate(n.link);
    else load();
  };
  const readAll = async () => {
    await notificationsAPI.markAllRead().catch(() => {});
    changed();
    load();
  };

  const kinds = Object.keys(NOTIFICATION_LABELS);

  return (
    <PortalLayout
      title="Notifications"
      subtitle={data ? (data.unread ? `${data.unread} unread` : 'You’re all caught up.') : 'Updates about your courses, orders and account.'}
      actions={data?.unread > 0 && <button type="button" className="btn btn--outline btn--sm" onClick={readAll}><i className="fas fa-check-double" /> Mark all as read</button>}
    >
      {user?.role === 'ADMIN' && <NotificationSiteStats refreshKey={data} />}
      <MyNotificationStats refreshKey={data} />
      <div className="lms-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={!unreadOnly} className={!unreadOnly ? 'is-active' : ''} onClick={() => setUnreadOnly(false)}>All</button>
        <button type="button" role="tab" aria-selected={unreadOnly} className={unreadOnly ? 'is-active' : ''} onClick={() => setUnreadOnly(true)}>
          Unread{data?.unread ? <span className="lms-tabs__count">{data.unread}</span> : null}
        </button>
      </div>
      <div className="field nt-kinds">
        <label htmlFor="nt-kind" className="sr-only">Type</label>
        <select id="nt-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Every type</option>
          {kinds.map((k) => <option key={k} value={k}>{NOTIFICATION_LABELS[k]}</option>)}
        </select>
      </div>
      <Alert>{error}</Alert>
      {!data && !error && <div className="skeleton skeleton--block" />}
      {data && data.notifications.length === 0 && (
        <section className="card panel empty-state">
          <span className="empty-state__icon"><i className="far fa-bell" /></span>
          <h3>{unreadOnly ? 'No unread notifications' : 'No notifications yet'}</h3>
          <p className="muted">We’ll let you know here about enrolments, payments, new lessons, answers to your questions and more.</p>
        </section>
      )}
      {data && data.notifications.length > 0 && (
        <section className="card">
          <ul className="nt-list">
            {data.notifications.map((n) => (
              <li key={n.id} className={`nt-item${n.is_read ? '' : ' is-unread'}`}>
                <button type="button" onClick={() => open(n)}>
                  <span className="nt-item__icon"><i className={`fas ${NOTIFICATION_ICONS[n.kind] || 'fa-bell'}`} aria-hidden="true" /></span>
                  <span className="nt-item__text">
                    <strong>{n.title}{!n.is_read && <span className="nt-item__dot" aria-label="Unread" />}</strong>
                    {n.body && <span>{n.body}</span>}
                    <small title={formatDateTime(n.created_at)}>{NOTIFICATION_LABELS[n.kind] || 'Update'} · {timeAgo(n.created_at)}</small>
                  </span>
                  {n.link && <i className="fas fa-chevron-right muted" aria-hidden="true" />}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </PortalLayout>
  );
};

export default NotificationsPage;

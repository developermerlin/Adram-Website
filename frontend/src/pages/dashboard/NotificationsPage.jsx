import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { notificationsAPI } from '../../services/api';
import PortalLayout from '../../components/layout/PortalLayout';
import { Alert } from '../../components/ui/Form';
import { NOTIFICATION_ICONS, NOTIFICATION_LABELS, NOTIFICATIONS_CHANGED } from '../../components/lms/notifications';
import { formatDateTime, timeAgo } from '../../utils/format';
import '../../styles/shop.css';

const changed = () => window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));

/** The notification centre: everything the site told this person, newest first, with read/unread. */
export const NotificationsPage = () => {
  const navigate = useNavigate();
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

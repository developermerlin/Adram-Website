import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { notificationsAPI } from '../../services/api';
import { timeAgo } from '../../utils/format';
import { NOTIFICATIONS_CHANGED, NOTIFICATION_ICONS } from './notifications';
import '../../styles/marketplace.css';

const POLL_MS = 60000;

/**
 * The bell: the signed-in person's notifications, newest first, with the unread count. `waiting` adds the
 * admin's "work waiting" shortcuts (applications to review…) at the top, as the old bell did.
 */
export const NotificationBell = ({ waiting = [], className = 'topbar__notify', buttonClass = 'topbar__icon' }) => {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ unread: 0, notifications: [] });
  const ref = useRef(null);
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const load = useCallback(() => notificationsAPI.list({ limit: 8 }).then(({ data: d }) => setData(d)).catch(() => {}), []);
  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    window.addEventListener(NOTIFICATIONS_CHANGED, load);
    return () => {
      clearInterval(timer);
      window.removeEventListener(NOTIFICATIONS_CHANGED, load);
    };
  }, [load, pathname]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const waitingTotal = waiting.reduce((n, i) => n + i.count, 0);
  const total = data.unread + waitingTotal;

  const openOne = async (n) => {
    setOpen(false);
    if (!n.is_read) {
      await notificationsAPI.markRead([n.id]).catch(() => {});
      load();
    }
    if (n.link) navigate(n.link);
  };
  const readAll = async () => {
    await notificationsAPI.markAllRead().catch(() => {});
    load();
  };

  return (
    <div className={className} ref={ref}>
      <button type="button" className={buttonClass} aria-label={total ? `${total} notifications` : 'Notifications'} aria-expanded={open} title="Notifications" onClick={() => setOpen((v) => !v)}>
        <i className="far fa-bell" />
        {total > 0 && <span className="topbar__dot">{total > 99 ? '99+' : total}</span>}
      </button>
      {open && (
        <div className="topbar__menu-pop notif-pop" role="dialog" aria-label="Notifications">
          <div className="notif-pop__head">
            <p className="topbar__pop-title">Notifications</p>
            {data.unread > 0 && <button type="button" className="btn btn--text btn--sm" onClick={readAll}>Mark all as read</button>}
          </div>
          {waiting.length > 0 && (
            <ul className="notif-pop__waiting">
              {waiting.map((i) => (
                <li key={i.to}>
                  <Link to={i.to} onClick={() => setOpen(false)}>
                    <span className="topbar__pop-icon"><i className={`fas ${i.icon}`} aria-hidden="true" /></span>
                    <span>{i.label}</span>
                    <strong>{i.count}</strong>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {data.notifications.length === 0 && waiting.length === 0 && <p className="topbar__pop-empty"><i className="fas fa-circle-check" /> You’re all caught up.</p>}
          <ul className="notif-pop__list">
            {data.notifications.map((n) => (
              <li key={n.id}>
                <button type="button" className={n.is_read ? '' : 'is-unread'} onClick={() => openOne(n)}>
                  <span className="notif-pop__icon"><i className={`fas ${NOTIFICATION_ICONS[n.kind] || 'fa-bell'}`} aria-hidden="true" /></span>
                  <span className="notif-pop__text">
                    <strong>{n.title}</strong>
                    {n.body && <small>{n.body}</small>}
                    <time>{timeAgo(n.created_at)}</time>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Link to="/notifications" className="msg-pop__all" onClick={() => setOpen(false)}>See all notifications <i className="fas fa-arrow-right" /></Link>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;

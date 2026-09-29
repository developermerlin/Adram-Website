// Two small panels for the student Overview: messages from ADRAM, and account security at a glance.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { authAPI, messagesAPI } from '../../services/api';
import { timeAgo } from '../../utils/format';

const fmt = new Intl.NumberFormat();
const plural = (n, word) => `${fmt.format(n)} ${word}${n === 1 ? '' : 's'}`;
const DEVICES = { desktop: 'computer', mobile: 'phone', tablet: 'tablet', unknown: 'device' };

// "12 min", "3.5 h", "2 days"
const formatWait = (minutes) => {
  if (minutes === null || minutes === undefined) return null;
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min`;
  if (minutes < 48 * 60) return `${Math.round((minutes / 60) * 10) / 10} h`;
  return `${Math.round(minutes / 1440)} days`;
};

/** Unread replies from ADRAM (with previews), how fast ADRAM usually answers, and a link to the chat. */
export const MessagesPanel = () => {
  const [stats, setStats] = useState(null);
  const [unread, setUnread] = useState(null);

  useEffect(() => {
    messagesAPI.stats().then(({ data }) => setStats(data)).catch(() => {});
    messagesAPI.unread().then(({ data }) => setUnread(data)).catch(() => setUnread({ unread: 0, recent: [] }));
  }, []);

  const wait = formatWait(stats?.median_reply_minutes);
  const count = unread?.unread || 0;

  return (
    <section className="card panel ov-msgs">
      <div className="panel__head">
        <h2 className="h3">Messages</h2>
        {count > 0 ? <span className="ov-count">{count}</span> : <Link to="/messages" className="panel__link">Open</Link>}
      </div>
      {unread === null && <div className="skeleton skeleton--block" />}
      {unread && count === 0 && (
        <p className="ov-note">
          <i className="fas fa-circle-check" />
          {stats?.awaiting_reply ? 'Waiting for ADRAM to reply to your last message.' : 'No new messages from the ADRAM team.'}
        </p>
      )}
      {count > 0 && (
        <ul className="convo-list">
          {unread.recent.map((r, i) => (
            <li key={i}>
              <Link to="/messages" className="is-unread">
                <span className="msg-pop__team" aria-hidden="true"><i className="fas fa-headset" /></span>
                <span className="convo-list__main">
                  <span className="convo-list__top"><strong>{r.sender_name}</strong><time>{timeAgo(r.at)}</time></span>
                  <small>{r.body}</small>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {stats && (
        <p className="ov-msgs__meta">
          <span><i className="fas fa-comments" aria-hidden="true" /> {plural(stats.sent + stats.received, 'message')}</span>
          {wait && <span><i className="fas fa-stopwatch" aria-hidden="true" /> ADRAM usually replies in {wait}</span>}
        </p>
      )}
      <Link to="/messages" className="btn btn--primary btn--sm btn--block">
        <i className="fas fa-comment-dots" /> {count ? 'Read and reply' : 'Message ADRAM'}
      </Link>
    </section>
  );
};

/** Previous sign-in, failed attempts and password age, with a link to the full activity log. */
export const SecurityPanel = () => {
  const [data, setData] = useState(null);

  useEffect(() => {
    authAPI.getActivityOverview(30)
      .then(({ data: d }) => setData({
        ...d,
        // Worked out once, when the figures arrive.
        password_days: d.password_changed_at ? Math.floor((Date.now() - new Date(d.password_changed_at)) / 86400000) : null,
      }))
      .catch(() => {});
  }, []);

  const passwordDays = data?.password_days ?? null;
  const rows = data
    ? [
        {
          ok: true,
          icon: 'fa-clock-rotate-left',
          text: data.previous_login
            ? `Last signed in ${timeAgo(data.previous_login.at)} on a ${DEVICES[data.previous_login.device]}`
            : 'This is your first sign-in',
        },
        {
          ok: data.failed === 0,
          icon: data.failed ? 'fa-triangle-exclamation' : 'fa-shield-halved',
          text: data.failed ? `${plural(data.failed, 'failed sign-in')} in the last 30 days` : 'No failed sign-ins in the last 30 days',
        },
        {
          ok: passwordDays !== null && passwordDays <= 180,
          icon: 'fa-key',
          text: passwordDays === null ? 'Password not changed since you joined' : `Password changed ${plural(passwordDays, 'day')} ago`,
        },
      ]
    : [];

  return (
    <section className="card panel">
      <div className="panel__head">
        <h2 className="h3">Account security</h2>
        <Link to="/activity" className="panel__link">Activity log</Link>
      </div>
      {!data && <div className="skeleton skeleton--block" />}
      <ul className="security-checks">
        {rows.map((r) => (
          <li key={r.text} className={r.ok ? 'is-ok' : 'is-warn'}>
            <i className={`fas ${r.icon}`} aria-hidden="true" />
            <span>{r.text}</span>
          </li>
        ))}
      </ul>
      {data && (data.failed > 0 || passwordDays === null || passwordDays > 180) && (
        <Link to="/profile" className="btn btn--outline btn--sm btn--block ov-security__cta"><i className="fas fa-key" /> Change password</Link>
      )}
    </section>
  );
};

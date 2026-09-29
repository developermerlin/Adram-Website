// "Messages & security" on the admin Overview: the inbox (unread, waiting, response time, latest conversations)
// and account security (failed sign-ins, suspicious addresses, who's active), for the dashboard's period.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminAPI, messagesAPI } from '../../services/api';
import { timeAgo } from '../../utils/format';
import Avatar from '../ui/Avatar';
import { Meter, MiniBars } from './charts';
import { Delta, StatTile } from './StatTile';

const fmt = new Intl.NumberFormat();
const plural = (n, word, many = `${word}s`) => `${fmt.format(n)} ${n === 1 ? word : many}`;

// "12 min", "3.5 h", "2 days"
const formatWait = (minutes) => {
  if (minutes === null || minutes === undefined) return '—';
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min`;
  if (minutes < 48 * 60) return `${Math.round((minutes / 60) * 10) / 10} h`;
  return `${Math.round(minutes / 1440)} days`;
};

export const CommsSecurityOverview = ({ days }) => {
  const [messages, setMessages] = useState(null);
  const [conversations, setConversations] = useState(null);
  const [activity, setActivity] = useState(null);

  useEffect(() => {
    messagesAPI.stats().then(({ data }) => setMessages(data)).catch(() => {});
    messagesAPI.conversations().then(({ data }) => setConversations(data.slice(0, 5))).catch(() => setConversations([]));
  }, []);

  useEffect(() => {
    adminAPI.activityOverview(days).then(({ data }) => setActivity(data)).catch(() => {});
  }, [days]);

  const m = messages;
  const a = activity;
  const vs = `vs the previous ${days} days`;
  const calls = m ? m.calls.answered + m.calls.missed + m.calls.declined : 0;

  return (
    <>
      <div className="admin-ov__label">
        <h2><i className="fas fa-comments" aria-hidden="true" /> Messages &amp; security</h2>
        <span>{a ? `Sign-ins over the last ${days} days · messages over the last 30` : ''}</span>
      </div>

      <div className="kpi-grid">
        <StatTile label="Unread messages" value={m && fmt.format(m.unread)} icon="fa-comment-dots" tone={m && m.unread ? 'amber' : 'green'} to="/messages" action="Open messages"
          chart={m && <MiniBars series={m.series} valueKey="people" label="Messages received per day, last 14 days" />}>
          <span className="kpi__note">{m ? (m.awaiting_reply ? `${plural(m.awaiting_reply, 'conversation')} waiting for a reply` : 'Every conversation has a reply') : ''}</span>
        </StatTile>

        <StatTile label="Median response time" value={m && formatWait(m.median_reply_minutes)} icon="fa-stopwatch" tone="cyan"
          chart={<Meter value={m?.replied_within_hour} label="Share of messages answered within an hour" />}>
          <span className="kpi__note">
            {m ? (m.replies_counted ? `${m.replied_within_hour}% answered within an hour` : 'No replies in the last 30 days') : ''}
            {m && calls > 0 ? ` · ${plural(calls, 'call')}` : ''}
          </span>
        </StatTile>

        <StatTile label="Failed sign-ins" value={a && fmt.format(a.failed)} icon="fa-triangle-exclamation" tone={a && a.failed ? 'red' : 'green'} to="/activity" action="Open the activity log"
          chart={a && <MiniBars series={a.series} valueKey="failed" label={`Failed sign-ins per day, last ${days} days`} />}
          delta={a && <Delta now={a.failed} prev={a.failed_prev} vs={vs} invert />}>
          <span className="kpi__note">{a ? (a.failed_ips.length ? `${plural(a.failed_ips.length, 'address', 'addresses')} involved` : 'No failed attempts') : ''}</span>
        </StatTile>

        <StatTile label="People active" value={a && fmt.format(a.unique_users)} icon="fa-user-clock" tone="violet"
          chart={a && <MiniBars series={a.series} valueKey="logins" label={`Sign-ins per day, last ${days} days`} />}
          delta={a && <Delta now={a.logins} prev={a.logins_prev} vs={`Sign-ins ${vs}`} />}>
          <span className="kpi__note">{a ? `${plural(a.logins, 'sign-in')} · ${plural(a.admin_actions, 'admin action')}` : ''}</span>
        </StatTile>
      </div>

      <div className="dash-grid dash-grid--even">
        <section className="card panel">
          <div className="panel__head">
            <div>
              <h2 className="h3">Latest conversations</h2>
              <p className="muted small">Newest first · unread highlighted</p>
            </div>
            <Link to="/messages" className="panel__link">Open inbox</Link>
          </div>
          {conversations === null && <div className="skeleton skeleton--block" />}
          {conversations?.length === 0 && <p className="muted small">No messages yet. When someone writes to ADRAM, it appears here.</p>}
          <ul className="convo-list">
            {conversations?.map((c) => (
              <li key={c.user.id}>
                <Link to={`/messages?user=${c.user.id}`} className={c.unread ? 'is-unread' : ''}>
                  <Avatar person={c.user} size={38} />
                  <span className="convo-list__main">
                    <span className="convo-list__top"><strong>{c.user.full_name}</strong><time>{timeAgo(c.last_message_at)}</time></span>
                    <small>
                      {c.last?.from_staff ? 'You: ' : ''}
                      {c.last?.kind && <i className={`fas ${c.last.kind === 'audio' ? 'fa-microphone' : c.last.kind === 'image' ? 'fa-image' : 'fa-paperclip'} inbox__kind`} aria-hidden="true" />}
                      {c.last?.body}
                    </small>
                  </span>
                  {c.unread > 0 && <span className="inbox__badge" aria-label={`${c.unread} unread`}>{c.unread}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="card panel">
          <div className="panel__head">
            <div>
              <h2 className="h3">Security watch</h2>
              <p className="muted small">Addresses with failed sign-ins, last {days} days</p>
            </div>
            <Link to="/activity" className="panel__link">Activity log</Link>
          </div>
          {!a && <div className="skeleton skeleton--block" />}
          {a && a.failed_ips.length === 0 && (
            <p className="ov-note"><i className="fas fa-shield-halved" /> No failed sign-ins in this period. Nothing to review.</p>
          )}
          {a && a.failed_ips.length > 0 && (
            <table className="rank-table">
              <thead>
                <tr><th scope="col">IP address</th><th scope="col" className="num">Tries</th><th scope="col" className="num">Accounts</th></tr>
              </thead>
              <tbody>
                {a.failed_ips.slice(0, 4).map((r) => (
                  <tr key={r.ip}>
                    <td>
                      <span className="mono">{r.ip}</span>
                      <small className="rank-table__sub">last {timeAgo(r.last)}</small>
                    </td>
                    <td className="num">{fmt.format(r.count)}</td>
                    <td className="num">{fmt.format(r.accounts)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {a && a.failed_accounts.length > 0 && (
            <p className="panel__foot">
              Most targeted: <strong>{a.failed_accounts[0].name || a.failed_accounts[0].email}</strong> ({plural(a.failed_accounts[0].count, 'failed try', 'failed tries')})
            </p>
          )}
        </section>
      </div>
    </>
  );
};

export default CommsSecurityOverview;

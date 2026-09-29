// Statistics above the chat on the Messages page. Administrators see the whole inbox (conversations waiting,
// response time, calls); everyone else sees their own conversation with the ADRAM team.
import { useEffect, useState } from 'react';
import { messagesAPI } from '../../services/api';
import { MESSAGES_CHANGED } from '../../utils/messageEvents';
import { ColumnChart, Meter, MiniBars, StatusStack } from '../admin/charts';
import { StatTile } from '../admin/StatTile';

const fmt = new Intl.NumberFormat();
const dayFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const longDayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const parseDay = (iso) => new Date(`${iso}T00:00:00`);
const plural = (n, word) => `${fmt.format(n)} ${word}${n === 1 ? '' : 's'}`;
const HIDE_KEY = 'adram-messages-stats-hidden';
const REFRESH_MS = 60000;
const MIN_GAP_MS = 15000;

// "12 min", "3.5 h", "2 days"
const formatWait = (minutes) => {
  if (minutes === null || minutes === undefined) return '—';
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min`;
  if (minutes < 48 * 60) return `${Math.round((minutes / 60) * 10) / 10} h`;
  return `${Math.round(minutes / 1440)} days`;
};

const CALLS = [
  { key: 'answered', label: 'Answered', icon: 'fa-phone', color: 'var(--status-good)' },
  { key: 'missed', label: 'Missed', icon: 'fa-phone-slash', color: 'var(--status-critical)' },
  { key: 'declined', label: 'Declined', icon: 'fa-ban', color: 'var(--status-warning)' },
];

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

export const MessagesInsights = ({ isAdmin }) => {
  const [data, setData] = useState(null);
  const [hidden, setHidden] = useState(readHidden);
  const [side, setSide] = useState('people');

  // Refresh when messages are read or sent (and every minute), so the figures follow the chat.
  useEffect(() => {
    if (hidden) return undefined;
    let alive = true;
    let last = 0;
    const load = () => {
      if (Date.now() - last < MIN_GAP_MS) return; // the chat announces changes often; a refresh every 15 s is plenty
      last = Date.now();
      messagesAPI.stats().then(({ data: d }) => alive && setData(d)).catch(() => {});
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    window.addEventListener(MESSAGES_CHANGED, load);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener(MESSAGES_CHANGED, load);
    };
  }, [hidden]);

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
  const sides = isAdmin
    ? [{ key: 'people', label: 'Received' }, { key: 'team', label: 'Sent' }]
    : [{ key: 'people', label: 'You' }, { key: 'team', label: 'ADRAM' }];
  const rows = d ? d.series.map((p) => ({ key: p.date, label: dayFmt.format(parseDay(p.date)), value: p[side], sub: longDayFmt.format(parseDay(p.date)) })) : [];
  const callTotal = d ? d.calls.answered + d.calls.missed + d.calls.declined : 0;
  const files = d ? d.attachments.files + d.attachments.images : 0;

  return (
    <div className="viz-root admin-ov users-ov student-ov">
      <div className="admin-ov__label users-ov__label">
        <h2><i className="fas fa-comments" aria-hidden="true" /> {isAdmin ? 'Inbox at a glance' : 'Your conversation at a glance'}</h2>
        <button type="button" className="btn btn--text btn--sm" onClick={toggle} aria-expanded={!hidden}>
          <i className={`fas ${hidden ? 'fa-chevron-down' : 'fa-chevron-up'}`} /> {hidden ? 'Show statistics' : 'Hide statistics'}
        </button>
      </div>

      {!hidden && (
        <>
          <div className="kpi-grid">
            {isAdmin ? (
              <>
                <StatTile label="Conversations" value={d && fmt.format(d.conversations)} icon="fa-comments"
                  chart={d && <MiniBars series={d.series} valueKey="people" label="Messages received per day, last 14 days" />}>
                  <span className="kpi__note">{d ? `${fmt.format(d.active_7)} active in the last 7 days` : ''}</span>
                </StatTile>
                <StatTile label="Waiting for a reply" value={d && fmt.format(d.awaiting_reply)} icon="fa-hourglass-half" tone={d && d.awaiting_reply ? 'amber' : 'green'}>
                  <span className="kpi__note">{d ? `${plural(d.unread, 'unread message')} · last message is from the person` : ''}</span>
                </StatTile>
                <StatTile label="Median response time" value={d && formatWait(d.median_reply_minutes)} icon="fa-stopwatch" tone="cyan"
                  chart={<Meter value={d?.replied_within_hour} label="Share of messages answered within an hour" />}>
                  <span className="kpi__note">{d ? (d.replies_counted ? `${d.replied_within_hour}% answered within an hour · last 30 days` : 'No replies in the last 30 days') : ''}</span>
                </StatTile>
              </>
            ) : (
              <>
                <StatTile label="Messages" value={d && fmt.format(d.sent + d.received)} icon="fa-comments"
                  chart={d && <MiniBars series={d.series} valueKey="team" label="Messages from ADRAM per day, last 14 days" />}>
                  <span className="kpi__note">{d ? `${fmt.format(d.sent)} sent · ${fmt.format(d.received)} from ADRAM` : ''}</span>
                </StatTile>
                <StatTile label="Unread replies" value={d && fmt.format(d.unread)} icon="fa-envelope-open-text" tone={d && d.unread ? 'red' : 'green'}>
                  <span className="kpi__note">{d ? (d.awaiting_reply ? 'ADRAM hasn’t replied to your last message yet' : 'You’re up to date') : ''}</span>
                </StatTile>
                <StatTile label="Typical reply time" value={d && formatWait(d.median_reply_minutes)} icon="fa-stopwatch" tone="cyan"
                  chart={<Meter value={d?.replied_within_hour} label="Share of your messages answered within an hour" />}>
                  <span className="kpi__note">{d ? (d.replies_counted ? `${d.replied_within_hour}% of replies within an hour · last 30 days` : 'Based on replies in the last 30 days') : ''}</span>
                </StatTile>
              </>
            )}
            <StatTile label="Calls" value={d && fmt.format(callTotal)} icon="fa-phone" tone="violet"
              chart={<Meter value={callTotal ? Math.round((d.calls.answered / callTotal) * 100) : null} label="Share of calls answered" />}>
              <span className="kpi__note">
                {d
                  ? `${fmt.format(d.calls.answered)} answered · ${fmt.format(d.calls.missed)} missed · ${
                    d.calls.talk_minutes || !d.calls.answered ? plural(d.calls.talk_minutes, 'minute') : 'under a minute'} talked`
                  : ''}
              </span>
            </StatTile>
          </div>

          <div className="dash-grid dash-grid--charts">
            <Panel
              title="Messages per day"
              note={d ? `Last 14 days · ${fmt.format(rows.reduce((n, r) => n + r.value, 0))} ${isAdmin ? (side === 'people' ? 'received' : 'sent by the team') : side === 'people' ? 'sent by you' : 'from ADRAM'}` : null}
              className="chart-card"
              action={
                <div className="period-switch period-switch--sm" role="group" aria-label="Whose messages">
                  {sides.map((s) => (
                    <button key={s.key} type="button" className={side === s.key ? 'is-active' : ''} aria-pressed={side === s.key} onClick={() => setSide(s.key)}>{s.label}</button>
                  ))}
                </div>
              }
            >
              {d ? <ColumnChart key={side} rows={rows} name={sides.find((s) => s.key === side).label} average="avg/day" W={720} H={220} /> : <div className="skeleton skeleton--chart" />}
            </Panel>

            <Panel title="Calls & files" note="Last 30 days for calls">
              {!d && <div className="skeleton skeleton--block" />}
              {d && (
                <>
                  {callTotal ? (
                    <StatusStack total={callTotal} segments={CALLS.map((c) => ({ ...c, value: d.calls[c.key] }))} />
                  ) : (
                    <p className="muted small">No calls in the last 30 days.</p>
                  )}
                  <h3 className="panel__subhead">Shared in the chat</h3>
                  <ul className="split-list">
                    <li className="split-list__facts">
                      <span><i className="fas fa-paperclip" aria-hidden="true" /> Files &amp; photos <strong>{fmt.format(files)}</strong></span>
                      <span><i className="fas fa-microphone" aria-hidden="true" /> Voice messages <strong>{fmt.format(d.attachments.voice)}</strong></span>
                      <span><i className="fas fa-video" aria-hidden="true" /> Video calls <strong>{fmt.format(d.calls.video)}</strong></span>
                    </li>
                  </ul>
                </>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
};

export default MessagesInsights;

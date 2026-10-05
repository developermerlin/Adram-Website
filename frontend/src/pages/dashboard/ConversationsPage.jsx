// Messages between people and the ADRAM team. Administrators get an inbox of every conversation;
// everyone else gets their own conversation with the team.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { adminAPI, messagesAPI, parseApiErrors } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { timeAgo } from '../../utils/format';
import { announceMessagesChanged } from '../../utils/messageEvents';
import {
  ATTACHMENT_ACCEPT, MAX_ATTACHMENT_MB, MAX_VOICE_SECONDS, checkAttachment, fileIcon, formatDuration, formatSize,
} from '../../utils/chatFiles';
import PortalLayout from '../../components/layout/PortalLayout';
import { assetUrl } from '../../utils/assets';
import Avatar from '../../components/ui/Avatar';
import Attachment from '../../components/chat/Attachment';
import MessagesInsights from '../../components/chat/MessagesInsights';
import { canRecordVoice, useVoiceRecorder } from '../../components/chat/useVoiceRecorder';
import ConfirmDialog from '../../components/admin/ConfirmDialog';
import '../../styles/team.css';
import { callsSupported, startCall, useCall } from '../../components/chat/callStore';

const THREAD_POLL_MS = 10000;
const LIST_POLL_MS = 20000;
const MAX_LENGTH = 4000;
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
// Full date and time sent, for administrators ("29 Sep 2026, 9:21 AM").
const stampFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

const dayLabel = (iso) => {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return dayFmt.format(d);
};

// Speech bubbles, grouped by day. `ourSide(m)` decides which messages sit on the right.
// Administrators get the full date on every message (`fullDates`) and a bin on each one (`onDelete`).
const Thread = ({ messages, ourSide, emptyText, fullDates = false, onDelete }) => {
  const box = useRef(null);
  const count = messages?.length || 0;

  // Keep the newest message in view by scrolling the chat box only (never the whole page).
  useLayoutEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [count]);

  if (messages === null) return <div className="chat__scroll"><div className="skeleton skeleton--block" /></div>;

  return (
    <div className="chat__scroll" role="log" aria-live="polite" aria-label="Conversation" ref={box}>
      {count === 0 && <div className="chat__empty"><i className="far fa-comments" aria-hidden="true" /><p>{emptyText}</p></div>}
      {messages.map((m, i) => {
        const day = dayLabel(m.created_at);
        const showDay = i === 0 || dayLabel(messages[i - 1].created_at) !== day;
        const ours = ourSide(m);
        const sent = new Date(m.created_at);
        const stamp = (fullDates ? stampFmt : timeFmt).format(sent);
        const bin = onDelete && (
          <button type="button" className="bubble__delete" onClick={() => onDelete(m)} aria-label="Delete this message" title="Delete message">
            <i className="fas fa-trash-can" />
          </button>
        );
        if (m.call) {
          // Call log: a small centred entry, red when missed or declined.
          const missed = ['missed', 'cancelled', 'declined'].includes(m.call.status);
          return (
            <div key={m.id}>
              {showDay && <div className="chat__day"><span>{day}</span></div>}
              <div className={`call-log${missed ? ' is-missed' : ''}`}>
                <i className={`fas ${m.call.kind === 'video' ? 'fa-video' : 'fa-phone'}`} aria-hidden="true" />
                <span>{m.call.summary}</span>
                <small>{m.from_staff ? (m.mine ? 'You called' : `${m.sender_name} called`) : (ours ? 'You called' : 'Incoming')} · <time dateTime={m.created_at}>{stamp}</time></small>
                {bin}
              </div>
            </div>
          );
        }
        return (
          <div key={m.id}>
            {showDay && <div className="chat__day"><span>{day}</span></div>}
            <div className={`bubble${ours ? ' bubble--ours' : ''}${m.attachment && !m.body ? ' bubble--bare' : ''}`}>
              <div className="bubble__body">
                {m.attachment && <Attachment attachment={m.attachment} ours={ours} />}
                {m.body && <div className="bubble__text">{m.body}</div>}
              </div>
              <div className="bubble__meta">
                {m.from_staff && <span>{m.mine ? 'You' : m.sender_name}</span>}
                <time dateTime={m.created_at} title={sent.toLocaleString()}>{stamp}</time>
                {/* Read receipts on every message we sent: one grey tick = sent, two blue ticks = read */}
                {ours && (
                  <span className={`ticks${m.read_at ? ' is-read' : ''}`} title={m.read_at ? `Read ${new Date(m.read_at).toLocaleString()}` : 'Sent'}
                    aria-label={m.read_at ? 'Read' : 'Sent'}>
                    <i className={`fas ${m.read_at ? 'fa-check-double' : 'fa-check'}`} />
                  </span>
                )}
                {bin}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const errorText = (err, fallback) => {
  const e = parseApiErrors(err, fallback);
  return e.file || e.body || e.duration || e.form || fallback;
};

// Message box: text, one attachment (paperclip or drag-and-drop) or a voice message (microphone).
// Enter sends, Shift+Enter adds a line. `file`/`setFile` are owned by the chat so files can be dropped anywhere on it.
const Composer = ({ onSend, placeholder, disabled = false, file, setFile }) => {
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(null);
  const box = useRef(null);
  const picker = useRef(null);

  const deliver = async (message) => {
    setSending(true);
    setProgress(message.file ? 0 : null);
    try {
      await onSend(message, message.file ? setProgress : undefined);
      return true;
    } catch (err) {
      toast.error(errorText(err, 'Your message couldn’t be sent. Try again.'));
      return false;
    } finally {
      setSending(false);
      setProgress(null);
    }
  };

  const voice = useVoiceRecorder(({ file: recording, duration }) => deliver({ file: recording, voice: true, duration }));

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [body]);

  const send = async () => {
    const text = body.trim();
    if ((!text && !file) || sending) return;
    if (await deliver({ body: text, file })) {
      setBody('');
      setFile(null);
    }
    box.current?.focus();
  };

  const pick = (chosen) => {
    if (!chosen) return;
    const problem = checkAttachment(chosen);
    if (problem) toast.error(problem);
    else setFile(chosen);
  };

  const record = async () => {
    try {
      await voice.start();
    } catch (err) {
      toast.error(err?.message === 'unsupported'
        ? 'Voice messages aren’t supported in this browser.'
        : 'Allow microphone access in your browser to record a voice message.');
    }
  };

  const left = MAX_LENGTH - body.length;
  const canSend = (body.trim() || file) && !sending && !disabled;

  if (voice.recording) {
    return (
      <div className="chat__composer chat__composer--recording" role="group" aria-label="Recording a voice message">
        <button type="button" className="icon-btn chat__tool chat__tool--danger" onClick={voice.cancel} aria-label="Cancel recording" title="Cancel">
          <i className="fas fa-trash-can" />
        </button>
        <div className="rec">
          <span className="rec__dot" aria-hidden="true" />
          <span className="rec__label">Recording</span>
          <span className="rec__time" aria-live="off">{formatDuration(voice.seconds)}</span>
          <span className="rec__max">/ {formatDuration(MAX_VOICE_SECONDS)}</span>
        </div>
        <button type="button" className="btn btn--primary chat__send" onClick={voice.stop} aria-label="Send voice message" title="Send">
          <i className="fas fa-paper-plane" />
        </button>
      </div>
    );
  }

  return (
    <form className="chat__composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
      {progress !== null && <span className="chat__progress" style={{ width: `${progress}%` }} aria-hidden="true" />}
      {file && (
        <div className="chat__pending">
          <span className="att-file__icon"><i className={`fas ${fileIcon(file.name)}`} aria-hidden="true" /></span>
          <span className="chat__pending-text">
            <strong>{file.name}</strong>
            <small>{sending && progress !== null ? `Uploading… ${progress}%` : formatSize(file.size)}</small>
          </span>
          {!sending && (
            <button type="button" className="icon-btn" onClick={() => setFile(null)} aria-label="Remove attachment"><i className="fas fa-xmark" /></button>
          )}
        </div>
      )}
      <div className="chat__row">
        <input ref={picker} type="file" hidden accept={ATTACHMENT_ACCEPT} onChange={(e) => { pick(e.target.files[0]); e.target.value = ''; }} />
        <button type="button" className="icon-btn chat__tool" onClick={() => picker.current?.click()} disabled={disabled || sending} aria-label="Attach a file" title={`Attach a file (up to ${MAX_ATTACHMENT_MB} MB)`}>
          <i className="fas fa-paperclip" />
        </button>
        <textarea
          ref={box}
          rows={1}
          className="input chat__input"
          placeholder={file ? 'Add a message (optional)…' : placeholder}
          aria-label="Message"
          maxLength={MAX_LENGTH}
          value={body}
          disabled={disabled}
          onChange={(e) => setBody(e.target.value)}
          onPaste={(e) => {
            const pasted = e.clipboardData?.files?.[0];
            if (pasted) {
              e.preventDefault();
              pick(pasted);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        {left < 300 && <span className={`chat__left${left < 50 ? ' is-low' : ''}`}>{left}</span>}
        {body.trim() || file ? (
          <button type="submit" className="btn btn--primary chat__send" disabled={!canSend} aria-label="Send message">
            <i className={`fas ${sending ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`} />
          </button>
        ) : (
          <button type="button" className="btn btn--primary chat__send" onClick={record} disabled={disabled || sending || !canRecordVoice()}
            aria-label="Record a voice message" title={canRecordVoice() ? 'Record a voice message' : 'Voice messages aren’t supported in this browser'}>
            <i className={`fas ${sending ? 'fa-spinner fa-spin' : 'fa-microphone'}`} />
          </button>
        )}
      </div>
    </form>
  );
};

// The chat card accepts files dropped anywhere on it.
const useDropZone = (setFile) => {
  const [over, setOver] = useState(false);
  const handlers = {
    onDragOver: (e) => {
      if (![...e.dataTransfer.types].includes('Files')) return;
      e.preventDefault();
      setOver(true);
    },
    onDragLeave: (e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) setOver(false);
    },
    onDrop: (e) => {
      if (!e.dataTransfer.files?.length) return;
      e.preventDefault();
      setOver(false);
      const dropped = e.dataTransfer.files[0];
      const problem = checkAttachment(dropped);
      if (problem) toast.error(problem);
      else setFile(dropped);
    },
  };
  return [over, handlers];
};

// Voice and video call buttons for a chat header (disabled while a call is already on).
const CallButtons = ({ onCall }) => {
  const { phase } = useCall();
  const busy = phase !== 'idle' && phase !== 'ended';
  const supported = callsSupported();
  const title = (what) => (supported ? what : 'Calls aren’t supported in this browser');
  return (
    <div className="chat__calls">
      <button type="button" className="icon-btn chat__call" onClick={() => onCall('audio')} disabled={busy || !supported} aria-label="Voice call" title={title('Voice call')}>
        <i className="fas fa-phone" />
      </button>
      <button type="button" className="icon-btn chat__call" onClick={() => onCall('video')} disabled={busy || !supported} aria-label="Video call" title={title('Video call')}>
        <i className="fas fa-video" />
      </button>
    </div>
  );
};

const DropHint = () => (
  <div className="chat__drop" aria-hidden="true">
    <i className="fas fa-cloud-arrow-up" />
    <span>Drop the file to attach it</span>
  </div>
);

/* ---------------------------------------------------------------- Everyone except admins */

const MyConversation = ({ member = null, onSent }) => {
  const [messages, setMessages] = useState(null);
  const [who, setWho] = useState(null); // the team member, when talking to one

  const load = useCallback(
    () =>
      messagesAPI.mine(member || undefined).then(({ data }) => {
        setMessages((cur) => (cur && cur.length === data.messages.length && cur.every((m, i) => m.read_at === data.messages[i].read_at) ? cur : data.messages));
        if (data.member) setWho(data.member);
        announceMessagesChanged();
      }).catch((err) => {
        setMessages((cur) => cur || []);
        if (member && err.response?.status === 404) toast.error('This team member can’t be messaged right now.');
      }),
    [member],
  );

  useEffect(() => {
    load();
    const timer = setInterval(load, THREAD_POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const [file, setFile] = useState(null);
  const [dragging, drop] = useDropZone(setFile);

  const send = async (message, onProgress) => {
    const { data } = await messagesAPI.send(message, onProgress, member || undefined);
    setMessages((cur) => [...(cur || []), data]);
    onSent?.();
  };

  const first = who?.first_name || 'them';
  return (
    <section className={`card chat chat--single${dragging ? ' is-dragging' : ''}`} {...drop}>
      {dragging && <DropHint />}
      {member ? (
        <header className="chat__head">
          {who?.photo ? <img className="chat__member-photo" src={assetUrl(who.photo)} alt="" /> : <Avatar person={who || {}} size={42} />}
          <div>
            <strong>{who?.full_name || '…'}</strong>
            <small>{who ? `${who.job_title || 'ADRAM team member'} · ADRAM Technologies` : ''}</small>
          </div>
          {who?.slug && <Link to={`/team/${who.slug}`} className="btn btn--outline btn--sm chat__profile"><i className="fas fa-id-badge" /> Profile</Link>}
        </header>
      ) : (
        <header className="chat__head">
          <span className="chat__team" aria-hidden="true"><i className="fas fa-headset" /></span>
          <div>
            <strong>ADRAM team</strong>
            <small>We usually reply within one working day. You’ll also get an email when we do.</small>
          </div>
          <CallButtons onCall={(kind) => startCall({ kind, peer: { name: 'ADRAM team' } })} />
        </header>
      )}
      <Thread messages={messages} ourSide={(m) => !m.from_staff}
        emptyText={member ? `Say hello to ${first}. They’ll reply here, and you’ll get an email when they do.` : 'Ask us anything about your applications, documents, payments or training.'} />
      <Composer key={member || 'team'} onSend={send} placeholder={member ? `Write a message to ${first}…` : 'Write a message to the ADRAM team…'} file={file} setFile={setFile} />
    </section>
  );
};

/** The person's conversations: the ADRAM team, plus each team member they have written to. */
const ThreadSwitcher = ({ member, threads, onPick }) => {
  if (!threads || (threads.length <= 1 && !member)) return null;
  const shown = member && !threads.some((t) => t.member?.id === member) ? [...threads, { member: { id: member, full_name: 'New conversation' }, unread: 0 }] : threads;
  return (
    <nav className="chat-threads" aria-label="Your conversations">
      {shown.map((t) => {
        const id = t.member?.id || null;
        const active = (member || null) === id;
        return (
          <button key={id || 'team'} type="button" className={`chat-threads__item${active ? ' is-active' : ''}`} aria-pressed={active} onClick={() => onPick(id)}>
            {t.member ? (t.member.photo ? <img src={assetUrl(t.member.photo)} alt="" /> : <Avatar person={t.member} size={32} />)
              : <span className="chat-threads__team" aria-hidden="true"><i className="fas fa-headset" /></span>}
            <span><strong>{t.member ? t.member.full_name : 'ADRAM team'}</strong><small>{t.member ? t.member.job_title || 'Team member' : 'Support and applications'}</small></span>
            {t.unread > 0 && <span className="inbox__badge" aria-label={`${t.unread} unread`}>{t.unread}</span>}
          </button>
        );
      })}
    </nav>
  );
};

const PersonMessages = () => {
  const [params, setParams] = useSearchParams();
  const member = Number(params.get('member')) || null;
  const [threads, setThreads] = useState(null);
  const loadThreads = useCallback(() => messagesAPI.threads().then(({ data }) => setThreads(data)).catch(() => setThreads([])), []);
  useEffect(() => {
    loadThreads();
    const timer = setInterval(loadThreads, LIST_POLL_MS);
    return () => clearInterval(timer);
  }, [loadThreads]);
  return (
    <>
      <ThreadSwitcher member={member} threads={threads} onPick={(id) => setParams(id ? { member: String(id) } : {})} />
      <MyConversation key={member || 'team'} member={member} onSent={loadThreads} />
    </>
  );
};

/* ---------------------------------------------------------------- Administrators */

// Start a conversation with anyone who isn't an administrator.
const NewConversation = ({ onPick }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => {
      adminAPI.getUsers({ search: search.trim(), page: 1 })
        .then(({ data }) => setResults(data.results.filter((u) => u.role !== 'ADMIN').slice(0, 8)))
        .catch(() => setResults([]));
    }, 200);
    return () => clearTimeout(t);
  }, [open, search]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  return (
    <div className="new-chat" ref={ref}>
      <button type="button" className="btn btn--primary btn--sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <i className="fas fa-pen-to-square" /> New message
      </button>
      {open && (
        <div className="new-chat__pop" role="dialog" aria-label="Start a conversation">
          <div className="input-icon">
            <i className="fas fa-magnifying-glass" aria-hidden="true" />
            <input className="input" autoFocus placeholder="Search a person by name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <ul>
            {results.length === 0 && <li className="muted small new-chat__empty">No matching people.</li>}
            {results.map((u) => (
              <li key={u.id}>
                <button type="button" onClick={() => { setOpen(false); onPick(u.id); }}>
                  <Avatar person={u} size={32} />
                  <span><strong>{u.full_name}</strong><small>{u.email} · {u.role_display}</small></span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

// `memberMode`: a team member's own inbox (people who wrote to them). No deleting or calls there.
const Inbox = ({ memberMode = false }) => {
  const [params, setParams] = useSearchParams();
  const selected = Number(params.get('user')) || null;
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [list, setList] = useState(null);
  const [thread, setThread] = useState(null); // { user, messages }

  const loadList = useCallback(
    () => (memberMode
      ? messagesAPI.memberInbox().then(({ data }) => {
        const q = search.trim().toLowerCase();
        setList(data.filter((c) => (filter !== 'unread' || c.unread > 0)
          && (!q || `${c.user.full_name} ${c.user.email} ${c.last?.body || ''}`.toLowerCase().includes(q))));
      })
      : messagesAPI.conversations({ search: search.trim(), unread: filter === 'unread' ? 1 : undefined }).then(({ data }) => setList(data)))
      .catch(() => setList((cur) => cur || [])),
    [search, filter, memberMode],
  );

  useEffect(() => {
    const t = setTimeout(loadList, 200);
    const timer = setInterval(loadList, LIST_POLL_MS);
    return () => {
      clearTimeout(t);
      clearInterval(timer);
    };
  }, [loadList]);

  const loadThread = useCallback(() => {
    if (!selected) return Promise.resolve();
    return (memberMode ? messagesAPI.memberThread(selected) : messagesAPI.conversation(selected)).then(({ data }) => {
      setThread((cur) => (cur && cur.user.id === data.user.id && cur.messages.length === data.messages.length
        && cur.messages.every((m, i) => m.read_at === data.messages[i].read_at) ? cur : data));
      announceMessagesChanged();
      // Opening a conversation clears its unread count in the list straight away.
      setList((cur) => cur?.map((c) => (c.user.id === data.user.id ? { ...c, unread: 0 } : c)));
    }).catch(() => toast.error('That conversation couldn’t be loaded.'));
  }, [selected, memberMode]);

  useEffect(() => {
    if (!selected) return undefined;
    loadThread();
    const timer = setInterval(loadThread, THREAD_POLL_MS);
    return () => clearInterval(timer);
  }, [selected, loadThread]);

  const open = (userId) => setParams({ user: String(userId) }, { replace: false });

  // A file waiting to be sent belongs to the conversation it was attached in.
  const [pending, setPending] = useState({ user: null, file: null });
  const file = pending.user === selected ? pending.file : null;
  const setFile = useCallback((f) => setPending({ user: selected, file: f }), [selected]);
  const [dragging, drop] = useDropZone(setFile);

  const send = async (message, onProgress) => {
    const { data } = await (memberMode ? messagesAPI.memberReply(selected, message, onProgress) : messagesAPI.reply(selected, message, onProgress));
    setThread((cur) => ({ ...cur, messages: [...cur.messages, data] }));
    loadList();
  };

  // Deleting: tick conversations in the list, or bin one conversation or a single message. Always confirmed first.
  const [checked, setChecked] = useState([]);
  const [deleting, setDeleting] = useState(null); // { users: [ids] } or { message }
  const listIds = list ? list.map((c) => c.user.id) : [];
  const allChecked = listIds.length > 0 && listIds.every((id) => checked.includes(id));
  const toggleCheck = (id) => setChecked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const nameOf = (id) => list?.find((c) => c.user.id === id)?.user.full_name || thread?.user.full_name || 'this person';

  const deleteConversations = async (ids) => {
    const results = await Promise.allSettled(ids.map((id) => messagesAPI.deleteConversation(id)));
    const done = results.filter((r) => r.status === 'fulfilled').length;
    if (done) toast.success(done === 1 ? 'Conversation deleted.' : `${done} conversations deleted.`);
    const failed = results.find((r) => r.status === 'rejected');
    if (failed) toast.error(errorText(failed.reason, `${ids.length - done} couldn’t be deleted. Try again.`));
    if (ids.includes(selected)) setParams({});
    setChecked((cur) => cur.filter((id) => !ids.includes(id)));
    setDeleting(null);
    loadList();
    announceMessagesChanged();
  };

  const deleteMessage = async (message) => {
    try {
      await messagesAPI.deleteMessage(selected, message.id);
      setThread((cur) => (cur ? { ...cur, messages: cur.messages.filter((m) => m.id !== message.id) } : cur));
      toast.success('Message deleted.');
      loadList();
      announceMessagesChanged();
    } catch (err) {
      toast.error(errorText(err, 'The message couldn’t be deleted. Try again.'));
    }
    setDeleting(null);
  };

  const confirmConfig = !deleting ? null : deleting.message ? {
    title: 'Delete this message?',
    text: `It’s removed for you and ${nameOf(selected)}, along with any file or voice note in it, and can’t be restored.`,
    confirm: 'Delete message',
  } : {
    title: deleting.users.length === 1 ? `Delete the conversation with ${nameOf(deleting.users[0])}?` : `Delete ${deleting.users.length} conversations?`,
    text: 'Every message, file, voice note and call record in it is removed permanently, for everyone.',
    confirm: deleting.users.length === 1 ? 'Delete conversation' : `Delete ${deleting.users.length} conversations`,
  };

  const totalUnread = list ? list.reduce((n, c) => n + c.unread, 0) : 0;
  // A thread still on screen from the previous selection isn't shown while the new one loads.
  const current = thread && thread.user.id === selected ? thread : null;
  const u = current?.user;

  return (
    <div className={`inbox${selected ? ' has-selection' : ''}`}>
      <aside className="card inbox__list" aria-label="Conversations">
        <div className="inbox__tools">
          <div className="input-icon">
            <i className="fas fa-magnifying-glass" aria-hidden="true" />
            <input type="search" className="input" placeholder="Search people or messages" aria-label="Search conversations" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="period-switch period-switch--sm" role="group" aria-label="Show">
            <button type="button" className={filter === 'all' ? 'is-active' : ''} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All</button>
            <button type="button" className={filter === 'unread' ? 'is-active' : ''} aria-pressed={filter === 'unread'} onClick={() => setFilter('unread')}>
              Unread{totalUnread > 0 && filter !== 'unread' ? ` · ${totalUnread}` : ''}
            </button>
          </div>
        </div>
        {!memberMode && list?.length > 0 && (
          <div className={`inbox__bulk${checked.length ? ' is-active' : ''}`}>
            <label className="inbox__check">
              <input type="checkbox" checked={allChecked} onChange={() => setChecked(allChecked ? [] : listIds)} aria-label="Select all conversations" />
              <span>{checked.length ? `${checked.length} selected` : 'Select all'}</span>
            </label>
            {checked.length > 0 && (
              <>
                <button type="button" className="btn btn--text btn--sm" onClick={() => setChecked([])}>Clear</button>
                <button type="button" className="btn btn--danger btn--sm btn--icon-only" onClick={() => setDeleting({ users: checked })}
                  aria-label="Delete selected conversations" title="Delete selected">
                  <i className="fas fa-trash-can" />
                </button>
              </>
            )}
          </div>
        )}
        {list === null && <div className="skeleton skeleton--block" />}
        {list?.length === 0 && (
          <div className="inbox__empty">
            <i className="far fa-comments" aria-hidden="true" />
            <p>{search || filter === 'unread' ? 'No conversations match.' : memberMode
              ? 'No messages yet. When someone writes to you from your team profile, it appears here.'
              : 'No messages yet. When someone writes to ADRAM, it appears here.'}</p>
          </div>
        )}
        <ul className="inbox__items">
          {list?.map((c) => (
            <li key={c.user.id} className={`inbox__row${checked.includes(c.user.id) ? ' is-checked' : ''}`}>
              {!memberMode && <input
                type="checkbox"
                className="inbox__row-check"
                checked={checked.includes(c.user.id)}
                onChange={() => toggleCheck(c.user.id)}
                aria-label={`Select the conversation with ${c.user.full_name}`}
              />}
              <button type="button" className={`inbox__item${c.user.id === selected ? ' is-active' : ''}${c.unread ? ' is-unread' : ''}`} onClick={() => open(c.user.id)}>
                <Avatar person={c.user} size={42} />
                <span className="inbox__text">
                  <span className="inbox__top">
                    <strong>{c.user.full_name}</strong>
                    <time dateTime={c.last_message_at} title={new Date(c.last_message_at).toLocaleString()}>{timeAgo(c.last_message_at)}</time>
                  </span>
                  <span className="inbox__preview">
                    <small>
                      {c.last?.from_staff ? 'You: ' : ''}
                      {c.last?.kind && <i className={`fas ${c.last.kind === 'audio' ? 'fa-microphone' : c.last.kind === 'image' ? 'fa-image' : 'fa-paperclip'} inbox__kind`} aria-hidden="true" />}
                      {c.last?.body}
                    </small>
                    {c.unread > 0 && <span className="inbox__badge" aria-label={`${c.unread} unread`}>{c.unread}</span>}
                  </span>
                  <span className="inbox__date">
                    <i className="far fa-clock" aria-hidden="true" /> {stampFmt.format(new Date(c.last_message_at))}
                  </span>
                </span>
              </button>
              {!memberMode && (
                <button type="button" className="icon-btn inbox__row-delete" onClick={() => setDeleting({ users: [c.user.id] })}
                  aria-label={`Delete the conversation with ${c.user.full_name}`} title="Delete conversation">
                  <i className="fas fa-trash-can" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </aside>

      <section className={`card chat${dragging && selected ? ' is-dragging' : ''}`} {...(selected ? drop : {})}>
        {dragging && selected && <DropHint />}
        {!selected && (
          <div className="chat__placeholder">
            <i className="far fa-comments" aria-hidden="true" />
            <h2 className="h3">Select a conversation</h2>
            <p className="muted">Pick someone on the left, or start a new message.</p>
          </div>
        )}
        {selected && (
          <>
            <header className="chat__head">
              <button type="button" className="icon-btn chat__back" aria-label="Back to conversations" onClick={() => setParams({})}><i className="fas fa-arrow-left" /></button>
              {u ? <Avatar person={u} size={42} /> : <span className="skeleton skeleton--icon" />}
              <div>
                <strong>{u?.full_name || '…'}</strong>
                <small>{u ? `${u.email} · ${u.role_display}` : ''}</small>
              </div>
              {u && !memberMode && <CallButtons onCall={(kind) => startCall({ kind, userId: u.id, peer: { name: u.full_name, person: u } })} />}
              {u?.role === 'STUDENT' && !memberMode && <Link to={`/admin/students/${u.id}`} className="btn btn--outline btn--sm chat__profile"><i className="fas fa-user-graduate" /> Student portal</Link>}
              {!memberMode && current?.messages.length > 0 && (
                <button type="button" className="icon-btn chat__call chat__delete" onClick={() => setDeleting({ users: [u.id] })}
                  aria-label="Delete this conversation" title="Delete conversation">
                  <i className="fas fa-trash-can" />
                </button>
              )}
            </header>
            <Thread
              messages={current ? current.messages : null}
              ourSide={(m) => m.from_staff}
              emptyText={`No messages with ${u?.first_name || 'this person'} yet. Say hello below.`}
              fullDates
              onDelete={memberMode ? undefined : (m) => setDeleting({ message: m })}
            />
            <Composer key={selected} onSend={send} placeholder={u ? `Reply to ${u.first_name}…` : 'Reply…'} disabled={!current} file={file} setFile={setFile} />
          </>
        )}
      </section>

      {confirmConfig && (
        <ConfirmDialog
          config={confirmConfig}
          onClose={() => setDeleting(null)}
          onConfirm={() => (deleting.message ? deleteMessage(deleting.message) : deleteConversations(deleting.users))}
        />
      )}
    </div>
  );
};

export const ConversationsPage = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const isMember = user?.role === 'TEAM_MEMBER';
  const [, setParams] = useSearchParams();

  return (
    <PortalLayout
      title="Messages"
      subtitle={isAdmin ? 'Every conversation between people and the ADRAM team. Any administrator can reply.'
        : isMember ? 'People who messaged you from your team profile. Reply here; they get an email when you do.'
          : 'Talk to the ADRAM team, or to a team member you messaged from their profile.'}
      actions={isAdmin ? <NewConversation onPick={(id) => setParams({ user: String(id) })} /> : null}
    >
      <MessagesInsights isAdmin={isAdmin || isMember} />
      {isAdmin ? <Inbox /> : isMember ? <Inbox memberMode /> : <PersonMessages />}
    </PortalLayout>
  );
};

export default ConversationsPage;

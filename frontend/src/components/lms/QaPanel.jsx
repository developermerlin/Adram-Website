import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { lmsAPI, parseApiErrors } from '../../services/api';
import { REPORT_REASONS } from '../../utils/learn';
import { formatDate } from '../../utils/format';
import '../../styles/learn.css';

/** "Report" for a question or answer: pick a reason, send it to the moderators. */
const Report = ({ target, id }) => {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('inappropriate');
  const send = async () => {
    try {
      const { data } = await lmsAPI.report({ target_type: target, target_id: id, reason });
      toast.success(data.detail || 'Thanks. Our team will review it.');
      setOpen(false);
    } catch (err) {
      toast.error(parseApiErrors(err).form || 'Your report could not be sent.');
    }
  };
  if (!open) return <button type="button" className="qa-link" onClick={() => setOpen(true)}><i className="far fa-flag" aria-hidden="true" /> Report</button>;
  return (
    <span className="qa-report">
      <label className="sr-only" htmlFor={`qr-${target}-${id}`}>Reason</label>
      <select id={`qr-${target}-${id}`} className="input input--sm" value={reason} onChange={(e) => setReason(e.target.value)}>
        {REPORT_REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <button type="button" className="btn btn--primary btn--sm" onClick={send}>Send</button>
      <button type="button" className="btn btn--text btn--sm" onClick={() => setOpen(false)}>Cancel</button>
    </span>
  );
};

const Thread = ({ id, admin, onChanged, onClose }) => {
  const [thread, setThread] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => lmsAPI.thread(id).then(({ data }) => setThread(data)).catch(() => setThread(false)), [id]);
  useEffect(() => {
    load();
  }, [load]);

  if (thread === false) return <p className="muted">This question is no longer available. <button type="button" className="link-arrow" onClick={onClose}>Back</button></p>;
  if (!thread) return <p className="muted">Loading…</p>;
  const staff = admin || thread.can_moderate;

  const send = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await lmsAPI.reply(id, text);
      setText('');
      await load();
      onChanged();
    } catch (err) {
      toast.error(parseApiErrors(err).body || 'Your answer could not be sent.');
    } finally {
      setBusy(false);
    }
  };
  const replace = (next) => setThread((t) => ({ ...t, replies: t.replies.map((r) => (r.id === next.id ? next : r)) }));
  const like = async (r) => {
    try {
      const { data } = await lmsAPI.likeReply(r.id, !r.liked);
      replace(data);
    } catch {
      toast.error('That did not work. Try again.');
    }
  };
  const mark = async (r) => {
    const { data } = await lmsAPI.markAnswer(r.id, !r.is_instructor_answer);
    replace(data);
    onChanged();
  };
  const removeReply = async (replyId) => {
    await lmsAPI.removeReply(replyId);
    await load();
    onChanged();
  };
  const removeThread = async () => {
    if (!window.confirm('Delete this question and its answers?')) return;
    await lmsAPI.removeThread(id);
    onChanged();
    onClose();
  };
  // The instructor's chosen answer first, then the most useful, then oldest first
  const replies = [...thread.replies].sort((a, b) => (b.is_instructor_answer - a.is_instructor_answer) || 0);

  return (
    <div className="qa-thread">
      <button type="button" className="btn btn--text btn--sm" onClick={onClose}><i className="fas fa-arrow-left" /> All questions</button>
      <h3>{thread.title}</h3>
      <p className="muted small">{thread.author} · {formatDate(thread.created_at)}{thread.lesson ? ` · ${thread.lesson.title}` : ''}</p>
      {thread.body && <p className="qa-thread__body">{thread.body}</p>}
      <div className="qa-thread__tools">
        {(thread.mine || staff) && <button type="button" className="qa-link" onClick={removeThread}>Delete question</button>}
        {!thread.mine && <Report target="thread" id={thread.id} />}
      </div>
      <h4 className="qa-thread__count">{thread.replies.length} {thread.replies.length === 1 ? 'answer' : 'answers'}</h4>
      <ul className="qa-replies">
        {replies.map((r) => (
          <li key={r.id} className={`${r.is_staff ? 'is-staff' : ''}${r.is_instructor_answer ? ' is-answer' : ''}`}>
            <div className="qa-replies__head">
              <strong>{r.author}</strong>
              {r.is_staff && <span className="qa-badge">Instructor</span>}
              {r.is_instructor_answer && <span className="qa-badge qa-badge--answer"><i className="fas fa-circle-check" aria-hidden="true" /> Instructor answer</span>}
              <small className="muted">{formatDate(r.created_at)}</small>
            </div>
            <p>{r.body}</p>
            <div className="qa-replies__tools">
              <button type="button" className={`qa-like${r.liked ? ' is-on' : ''}`} onClick={() => like(r)} aria-pressed={r.liked} aria-label={r.liked ? 'Remove your like' : 'Mark as useful'}>
                <i className={`${r.liked ? 'fas' : 'far'} fa-thumbs-up`} aria-hidden="true" /> {r.likes > 0 ? r.likes : ''} <span>Useful</span>
              </button>
              {staff && <button type="button" className="qa-link" onClick={() => mark(r)}>{r.is_instructor_answer ? 'Unmark answer' : 'Mark as answer'}</button>}
              {(r.mine || staff) && <button type="button" className="qa-link" onClick={() => removeReply(r.id)}>Delete</button>}
              {!r.mine && <Report target="reply" id={r.id} />}
            </div>
          </li>
        ))}
      </ul>
      <form onSubmit={send} className="qa-form">
        <label htmlFor={`qa-answer-${id}`} className="sr-only">Your answer</label>
        <textarea id={`qa-answer-${id}`} className="input" rows={3} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} placeholder={staff ? 'Write your answer as the instructor…' : 'Write an answer…'} />
        <div><button type="submit" className="btn btn--primary btn--sm" disabled={busy || !text.trim()}>Post answer</button></div>
      </form>
    </div>
  );
};

/** Questions and answers for a course. `lessonId` ties new questions to a lesson; `admin` is the course staff's view. */
export const QaPanel = ({ slug, lessonId, admin = false }) => {
  const [params, setParams] = useSearchParams();
  const linked = Number(params.get('qa') || params.get('thread')) || null;
  const [filter, setFilter] = useState(admin ? 'unanswered' : lessonId ? 'lesson' : 'all');
  const [query, setQuery] = useState('');
  const [data, setData] = useState(null);
  const [picked, setPicked] = useState(null);
  const [asking, setAsking] = useState(false);
  const [form, setForm] = useState({ title: '', body: '' });
  const [error, setError] = useState('');
  const open = picked ?? linked;

  const load = useCallback(() => {
    const p = {};
    if (filter === 'lesson' && lessonId) p.lesson = lessonId;
    if (filter === 'mine' || filter === 'unanswered') p.filter = filter;
    if (query.trim()) p.q = query.trim();
    return lmsAPI.questions(slug, p).then(({ data: d }) => setData(d)).catch(() => setError('The questions could not be loaded.'));
  }, [slug, lessonId, filter, query]);
  useEffect(() => {
    load();
  }, [load]);

  const close = () => {
    setPicked(0);
    if (linked) {
      const next = new URLSearchParams(params);
      next.delete('qa');
      next.delete('thread');
      setParams(next, { replace: true });
    }
  };
  if (open) return <Thread key={open} id={open} admin={admin} onChanged={load} onClose={close} />;

  const ask = async (e) => {
    e.preventDefault();
    try {
      await lmsAPI.ask(slug, { ...form, lesson: lessonId || undefined });
      setForm({ title: '', body: '' });
      setAsking(false);
      toast.success('Question posted. Your instructor will answer soon.');
      load();
    } catch (err) {
      setError(parseApiErrors(err).title || 'Your question could not be posted.');
    }
  };

  return (
    <div className="qa">
      <div className="qa-bar">
        <input className="input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search questions" aria-label="Search questions" />
        <select className="input" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter questions">
          {lessonId && <option value="lesson">This lesson</option>}
          <option value="all">All questions</option>
          {!admin && <option value="mine">My questions</option>}
          <option value="unanswered">Unanswered{data ? ` (${data.unanswered})` : ''}</option>
        </select>
        {!admin && <button type="button" className="btn btn--primary btn--sm" onClick={() => setAsking((v) => !v)} aria-expanded={asking}><i className="fas fa-plus" /> Ask a question</button>}
      </div>
      {asking && (
        <form onSubmit={ask} className="qa-form qa-form--ask">
          <input className="input" value={form.title} maxLength={200} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Your question in one line" aria-label="Your question" />
          <textarea className="input" rows={3} maxLength={2000} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} placeholder="Add details: what you tried, where you got stuck (optional)" aria-label="Details" />
          <div className="qa-form__actions">
            <button type="submit" className="btn btn--primary btn--sm" disabled={!form.title.trim()}>Post question</button>
            <button type="button" className="btn btn--text btn--sm" onClick={() => setAsking(false)}>Cancel</button>
          </div>
        </form>
      )}
      {error && <p className="co-error" role="alert">{error}</p>}
      {!data ? <p className="muted">Loading…</p> : data.threads.length === 0 ? (
        <p className="muted qa-empty">{query ? 'No questions match your search.' : 'No questions here yet. Be the first to ask!'}</p>
      ) : (
        <ul className="qa-list">
          {data.threads.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => setPicked(t.id)}>
                <strong>{t.title}</strong>
                {t.body && <span className="qa-list__body">{t.body}</span>}
                <small className="muted">{t.author} · {formatDate(t.created_at)}{t.lesson ? ` · ${t.lesson.title}` : ''}</small>
                <span className={`qa-count${t.answered ? ' is-answered' : ''}`}>
                  {t.answered ? <><i className="fas fa-circle-check" /> Answered</> : 'Waiting for an answer'} · {t.reply_count} {t.reply_count === 1 ? 'reply' : 'replies'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default QaPanel;

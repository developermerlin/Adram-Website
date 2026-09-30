import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { lmsAPI, parseApiErrors } from '../../services/api';
import { clock } from '../../utils/learn';

/**
 * Private notes on a lesson. For an uploaded video `getTime()` stamps the note with the current position and
 * `onSeek(seconds)` jumps back there. "All notes" searches every note in the course.
 */
export const NotesPanel = ({ slug, lessonId, canTrack, getTime, onSeek }) => {
  const [notes, setNotes] = useState(null);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(null);
  const [scope, setScope] = useState('lesson');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    const request = scope === 'lesson' ? lmsAPI.lessonNotes(lessonId) : lmsAPI.courseNotes(slug, query.trim());
    return request.then(({ data }) => setNotes(data)).catch(() => setNotes([]));
  }, [scope, lessonId, slug, query]);
  useEffect(() => {
    load();
  }, [load]);

  if (!canTrack) return <p className="muted">Enrol on this course to keep private notes on its lessons.</p>;
  const stamped = Boolean(getTime);

  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await lmsAPI.addNote(lessonId, { body: text, position: getTime?.() ?? null });
      setText('');
      if (scope !== 'lesson') setScope('lesson');
      else load();
    } catch (err) {
      toast.error(parseApiErrors(err).body || 'Your note could not be saved.');
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    await lmsAPI.updateNote(editing.id, editing.body);
    setEditing(null);
    load();
  };
  const remove = async (id) => {
    if (!window.confirm('Delete this note?')) return;
    await lmsAPI.removeNote(id);
    load();
  };
  const filtered = scope === 'lesson' && query.trim() ? (notes || []).filter((n) => n.body.toLowerCase().includes(query.trim().toLowerCase())) : notes;

  return (
    <div className="notes">
      <form className="notes-add" onSubmit={add}>
        <label htmlFor={`note-${lessonId}`} className="sr-only">New note</label>
        <textarea id={`note-${lessonId}`} className="input" rows={2} maxLength={5000} value={text} onChange={(e) => setText(e.target.value)}
          placeholder={stamped ? 'Add a note: it is stamped with the current video time' : 'Add a note…'} />
        <button type="submit" className="btn btn--primary btn--sm" disabled={busy || !text.trim()}>
          <i className="fas fa-plus" /> Save note
        </button>
      </form>
      <div className="notes-bar">
        <div className="lms-tabs lms-tabs--small" role="tablist">
          <button type="button" role="tab" aria-selected={scope === 'lesson'} className={scope === 'lesson' ? 'is-active' : ''} onClick={() => setScope('lesson')}>This lesson</button>
          <button type="button" role="tab" aria-selected={scope === 'course'} className={scope === 'course' ? 'is-active' : ''} onClick={() => setScope('course')}>All notes</button>
        </div>
        <input type="search" className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search notes" aria-label="Search notes" />
      </div>
      {!filtered ? <p className="muted">Loading…</p> : filtered.length === 0 ? (
        <p className="muted">{query ? 'No notes match your search.' : 'No notes yet. Notes are private: only you can see them.'}</p>
      ) : (
        <ul className="notes-list">
          {filtered.map((n) => (
            <li key={n.id}>
              <div className="notes-list__head">
                {n.position_seconds != null && (
                  n.lesson.id === lessonId && onSeek
                    ? <button type="button" className="notes-stamp" onClick={() => onSeek(n.position_seconds)} title="Jump to this moment">{clock(n.position_seconds)}</button>
                    : <span className="notes-stamp">{clock(n.position_seconds)}</span>
                )}
                {scope === 'course' && (n.lesson.id === lessonId ? <strong>{n.lesson.title}</strong> : <Link to={`/learn/${slug}/lesson/${n.lesson.id}`}>{n.lesson.title}</Link>)}
              </div>
              {editing?.id === n.id ? (
                <div className="notes-edit">
                  <textarea className="input" rows={3} value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} aria-label="Edit note" />
                  <div>
                    <button type="button" className="btn btn--primary btn--sm" onClick={save} disabled={!editing.body.trim()}>Save</button>
                    <button type="button" className="btn btn--text btn--sm" onClick={() => setEditing(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <p>{n.body}</p>
                  <div className="notes-list__tools">
                    <button type="button" className="qa-link" onClick={() => setEditing({ id: n.id, body: n.body })}>Edit</button>
                    <button type="button" className="qa-link" onClick={() => remove(n.id)}>Delete</button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default NotesPanel;

import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { lmsAPI, parseApiErrors } from '../../services/api';
import '../../styles/groups.css';

/** The course's study groups (in the player): join one, start one, or join a private one with its code. */
export const GroupsPanel = ({ slug }) => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null); // the "start a group" form
  const [code, setCode] = useState('');
  const load = useCallback(() => lmsAPI.courseGroups(slug).then(({ data: d }) => setData(d)).catch(() => setData({ groups: [], can_join: false })), [slug]);
  useEffect(() => {
    load();
  }, [load]);

  const join = async (g) => {
    try {
      await lmsAPI.joinGroup(g.id);
      navigate(`/student/groups/${g.id}`);
    } catch (err) {
      toast.error(parseApiErrors(err).detail || 'You could not join this group.');
    }
  };
  const joinByCode = async (e) => {
    e.preventDefault();
    try {
      const { data: g } = await lmsAPI.joinGroupByCode(code.trim());
      navigate(`/student/groups/${g.id}`);
    } catch (err) {
      toast.error(parseApiErrors(err).code || parseApiErrors(err).detail || 'That code didn’t work.');
    }
  };
  const create = async (e) => {
    e.preventDefault();
    try {
      const { data: g } = await lmsAPI.createGroup(slug, form);
      toast.success('Group started. Invite your classmates!');
      navigate(`/student/groups/${g.id}`);
    } catch (err) {
      const errs = parseApiErrors(err);
      toast.error(errs.name || errs.detail || 'The group could not be started.');
    }
  };

  if (!data) return <p className="muted">Loading…</p>;
  return (
    <div className="sg-panel">
      <p className="muted small">Learn together with others on this course: a board for questions and plans, and everyone’s progress side by side.</p>
      {data.groups.length === 0 && <p className="muted">No groups yet. Start the first one!</p>}
      <ul className="sg-list">
        {data.groups.map((g) => (
          <li key={g.id}>
            <span>
              <strong>{g.name}</strong>{g.is_private && <i className="fas fa-lock sg-lock" title="Private" aria-label="Private" />}
              <small className="muted">{g.members}/{g.max_members} members{g.description ? ` · ${g.description}` : ''}</small>
            </span>
            {g.is_member ? <Link to={`/student/groups/${g.id}`} className="btn btn--outline btn--sm">Open</Link>
              : <button type="button" className="btn btn--primary btn--sm" onClick={() => join(g)} disabled={g.full || !data.can_join}>{g.full ? 'Full' : 'Join'}</button>}
          </li>
        ))}
      </ul>
      {data.can_join && (
        <div className="sg-actions">
          {form ? (
            <form className="sg-new" onSubmit={create}>
              <input className="input" placeholder="Group name, e.g. Weekend coders" aria-label="Group name" value={form.name} maxLength={80} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              <input className="input" placeholder="What it’s for (optional)" aria-label="Description" value={form.description} maxLength={300} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
              <label className="sg-check"><input type="checkbox" checked={form.is_private} onChange={(e) => setForm((f) => ({ ...f, is_private: e.target.checked }))} /> Private (join with an invite code)</label>
              <div className="sg-new__actions">
                <button type="button" className="btn btn--text btn--sm" onClick={() => setForm(null)}>Cancel</button>
                <button type="submit" className="btn btn--primary btn--sm" disabled={!form.name.trim()}>Start the group</button>
              </div>
            </form>
          ) : (
            <button type="button" className="btn btn--outline btn--sm" onClick={() => setForm({ name: '', description: '', is_private: false })}><i className="fas fa-plus" /> Start a group</button>
          )}
          <form className="sg-code" onSubmit={joinByCode}>
            <input className="input" placeholder="Invite code" aria-label="Invite code" value={code} maxLength={12} onChange={(e) => setCode(e.target.value.toUpperCase())} />
            <button type="submit" className="btn btn--outline btn--sm" disabled={!code.trim()}>Join</button>
          </form>
        </div>
      )}
    </div>
  );
};

export default GroupsPanel;

import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { lmsAPI, parseApiErrors } from '../../services/api';
import { assetUrl } from '../../utils/assets';
import { formatDate, formatDateTime } from '../../utils/format';
import PortalLayout from '../../components/layout/PortalLayout';
import { Alert } from '../../components/ui/Form';
import '../../styles/groups.css';

const initial = (name) => (name || '?').slice(0, 1).toUpperCase();
const Face = ({ photo, name }) => (photo ? <img className="sg-face" src={assetUrl(photo)} alt="" /> : <span className="sg-face" aria-hidden="true">{initial(name)}</span>);

/** /student/groups: my study groups. */
export const StudyGroupsPage = () => {
  const [groups, setGroups] = useState(null);
  useEffect(() => {
    lmsAPI.myGroups().then(({ data }) => setGroups(data)).catch(() => setGroups([]));
  }, []);
  return (
    <PortalLayout title="Study groups" subtitle="Learn with others on the same course.">
      {groups && groups.length === 0 && (
        <section className="card panel empty-state">
          <i className="fas fa-people-group" aria-hidden="true" />
          <p>You’re not in a study group yet. Open a course you’re learning and choose the <strong>Study groups</strong> tab to join or start one.</p>
          <Link to="/student/learning" className="btn btn--primary btn--sm">My learning</Link>
        </section>
      )}
      <div className="sg-grid">
        {!groups && <div className="card skeleton skeleton--block" />}
        {groups?.map((g) => (
          <Link key={g.id} to={`/student/groups/${g.id}`} className="card sg-card">
            <strong>{g.name}</strong>
            <small className="muted">{g.course.title}</small>
            <span className="sg-card__meta"><i className="fas fa-user-group" aria-hidden="true" /> {g.members} {g.members === 1 ? 'member' : 'members'}{g.is_owner ? ' · you run it' : ''}</span>
          </Link>
        ))}
      </div>
    </PortalLayout>
  );
};

/** /student/groups/:id: the board and everyone's progress. */
export const StudyGroupPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [g, setG] = useState(null);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const load = useCallback(() => lmsAPI.group(id).then(({ data }) => { setG(data); setError(''); })
    .catch((err) => setError(err.response?.status === 404 ? 'This group doesn’t exist or is private.' : 'The group could not be loaded.')), [id]);
  useEffect(() => {
    load();
  }, [load]);

  const post = async (e) => {
    e.preventDefault();
    try {
      await lmsAPI.groupPost(id, text);
      setText('');
      load();
    } catch (err) {
      toast.error(parseApiErrors(err).body || parseApiErrors(err).detail || 'Your post could not be sent.');
    }
  };
  const act = async (fn, done) => {
    try {
      await fn();
      if (done) done(); else load();
    } catch (err) {
      toast.error(parseApiErrors(err).detail || 'That did not work.');
    }
  };
  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(g.invite_code);
      toast.success('Invite code copied');
    } catch {
      toast.error('Copy it by hand instead.');
    }
  };

  return (
    <PortalLayout title={g?.name || 'Study group'} subtitle={g ? `${g.course.title}${g.description ? ` · ${g.description}` : ''}` : ''}
      actions={g?.is_member && <Link to={`/learn/${g.course.slug}`} className="btn btn--primary btn--sm"><i className="fas fa-circle-play" /> Go to the course</Link>}>
      <Link to="/student/groups" className="back-link"><i className="fas fa-arrow-left" /> All my groups</Link>
      <Alert>{error}</Alert>
      {g && !g.is_member && (
        <section className="card panel">
          <p>{g.members} people learn together here.</p>
          <button type="button" className="btn btn--primary" disabled={g.full} onClick={() => act(() => lmsAPI.joinGroup(g.id))}>{g.full ? 'This group is full' : 'Join the group'}</button>
        </section>
      )}
      {g?.is_member && (
        <div className="sg-layout">
          <section className="card panel">
            <div className="panel__head"><h2 className="h3">Board</h2></div>
            <form className="sg-post" onSubmit={post}>
              <textarea className="input" rows={3} maxLength={2000} placeholder="Ask, share a tip, or plan a study session…" aria-label="Write a post" value={text} onChange={(e) => setText(e.target.value)} />
              <div><button type="submit" className="btn btn--primary btn--sm" disabled={!text.trim()}>Post</button></div>
            </form>
            {g.posts.length === 0 && <p className="muted">No posts yet. Say hello!</p>}
            <ul className="sg-posts">
              {g.posts.map((p) => (
                <li key={p.id} className={p.is_pinned ? 'is-pinned' : ''}>
                  <Face photo={p.photo} name={p.author} />
                  <div>
                    <p className="sg-posts__head"><strong>{p.author}</strong> <small className="muted">{formatDateTime(p.created_at)}</small>{p.is_pinned && <i className="fas fa-thumbtack sg-pin" title="Pinned" />}</p>
                    <p className="sg-posts__body">{p.body}</p>
                    <div className="sg-posts__tools">
                      {g.is_owner && <button type="button" className="link-button" onClick={() => act(() => lmsAPI.pinGroupPost(p.id))}>{p.is_pinned ? 'Unpin' : 'Pin'}</button>}
                      {(p.mine || g.is_owner) && <button type="button" className="link-button" onClick={() => window.confirm('Delete this post?') && act(() => lmsAPI.removeGroupPost(p.id))}>Delete</button>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <aside className="stack-lg">
            <section className="card panel">
              <div className="panel__head"><h2 className="h3">Progress</h2></div>
              <p className="muted small">Members share how far they are through the course.</p>
              <ol className="sg-board">
                {g.members_list.map((m) => (
                  <li key={m.id} className={m.you ? 'is-you' : ''}>
                    <Face photo={m.photo} name={m.name} />
                    <span>
                      <strong>{m.name}{m.you ? ' (you)' : ''}{m.role === 'owner' && <small className="muted"> · owner</small>}</strong>
                      <span className="lms-progress"><span style={{ width: `${m.progress || 0}%` }} /></span>
                      <small className="muted">{m.progress == null ? 'No access right now' : `${m.progress}%`} · joined {formatDate(m.joined_at)}</small>
                    </span>
                    {g.is_owner && !m.you && (
                      <button type="button" className="icon-btn" aria-label={`Remove ${m.name}`} onClick={() => window.confirm(`Remove ${m.name} from the group?`) && act(() => lmsAPI.removeGroupMember(g.id, m.id))}><i className="fas fa-xmark" /></button>
                    )}
                  </li>
                ))}
              </ol>
            </section>
            <section className="card panel sg-invite">
              <h2 className="h3">Invite classmates</h2>
              {g.invite_code ? (
                <>
                  <p className="small">Share this code. They enter it in the course’s <strong>Study groups</strong> tab.</p>
                  <button type="button" className="sg-code-big" onClick={copyCode}>{g.invite_code}</button>
                  {g.is_owner && <button type="button" className="btn btn--text btn--sm" onClick={() => act(() => lmsAPI.updateGroup(g.id, { regenerate_code: true }))}>New code (the old one stops working)</button>}
                </>
              ) : <p className="small muted">This group is private: ask the owner for the invite code.</p>}
              <div className="sg-invite__actions">
                <button type="button" className="btn btn--text btn--sm" onClick={() => window.confirm('Leave this group?') && act(() => lmsAPI.leaveGroup(g.id), () => navigate('/student/groups'))}>Leave the group</button>
                {g.is_owner && <button type="button" className="btn btn--text btn--sm sg-danger" onClick={() => window.confirm('Delete the group for everyone?') && act(() => lmsAPI.deleteGroup(g.id), () => navigate('/student/groups'))}>Delete the group</button>}
              </div>
            </section>
          </aside>
        </div>
      )}
    </PortalLayout>
  );
};

export default StudyGroupsPage;

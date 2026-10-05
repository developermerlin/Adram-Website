import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import PortalLayout from '../../components/layout/PortalLayout';
import CreateUserDialog from '../../components/lms/CreateUserDialog';
import TeamProfileEditor from '../../components/team/TeamProfileEditor';
import { initials } from '../../components/team/teamShared';
import { teamAPI, parseApiErrors } from '../../services/api';
import { assetUrl } from '../../utils/assets';
import { timeAgo } from '../../utils/format';
import '../../styles/team.css';

/** Admin → Team: every team member's portfolio, who can join, and creating team member accounts. */
export const AdminTeamPage = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [creating, setCreating] = useState(false);
  const [adding, setAdding] = useState('');
  const [busy, setBusy] = useState(null);
  const load = useCallback(() => teamAPI.manage().then(({ data: d }) => setData(d)).catch(() => toast.error('The team couldn’t be loaded.')), []);
  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (m, key) => {
    setBusy(m.id);
    try {
      await teamAPI.saveProfile(m.id, { [key]: !m[key] });
      toast.success(key === 'is_published' ? (m.is_published ? `${m.name} is hidden from the Team page.` : `${m.name} is on the Team page.`) : 'Saved.');
      load();
    } catch (err) {
      toast.error(parseApiErrors(err).detail || 'Could not save.');
    } finally {
      setBusy(null);
    }
  };
  const move = async (i, step) => {
    const list = [...data.results];
    [list[i], list[i + step]] = [list[i + step], list[i]];
    setData((d) => ({ ...d, results: list }));
    await teamAPI.reorder(list.map((m) => m.id)).catch(() => toast.error('The new order couldn’t be saved.'));
  };
  const addExisting = async () => {
    if (!adding) return;
    try {
      const { data: p } = await teamAPI.addToTeam(Number(adding));
      toast.success(`${p.name} now has a team profile. Fill it in, then publish it.`);
      navigate(`/admin/team/${p.id}`);
    } catch (err) {
      toast.error(parseApiErrors(err).detail || 'Could not add them to the team.');
    }
  };

  const published = data ? data.results.filter((m) => m.is_published).length : 0;
  return (
    <PortalLayout
      title="Team"
      subtitle="The people on the Team page: their portfolios, CVs and whether people can message them."
      actions={<button type="button" className="btn btn--primary btn--sm" onClick={() => setCreating(true)}><i className="fas fa-user-plus" /> New team member</button>}
    >
      {data && (
        <div className="tma-stats">
          <div><strong>{data.results.length}</strong><span>Profiles</span></div>
          <div><strong>{published}</strong><span>On the Team page</span></div>
          <div><strong>{data.results.length - published}</strong><span>Not published yet</span></div>
          <div><strong>{data.results.filter((m) => m.has_cv).length}</strong><span>With a CV uploaded</span></div>
        </div>
      )}

      {data?.candidates.length > 0 && (
        <section className="card panel tma-add">
          <div>
            <strong>Add someone who already has a staff account</strong>
            <p className="muted small">Administrators, counsellors, instructors and other staff can have a portfolio too. Accounts with the Team member role get one automatically.</p>
          </div>
          <select className="input" value={adding} onChange={(e) => setAdding(e.target.value)} aria-label="Staff account to add">
            <option value="">Choose a staff account…</option>
            {data.candidates.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.role_display}</option>)}
          </select>
          <button type="button" className="btn btn--outline btn--sm" disabled={!adding} onClick={addExisting}><i className="fas fa-plus" /> Add to the team</button>
        </section>
      )}

      {data === null && <div className="card panel"><div className="skeleton skeleton--block" /></div>}
      {data?.results.length === 0 && (
        <section className="card panel tm-missing">
          <i className="fas fa-people-group" aria-hidden="true" />
          <p>No team profiles yet. Create a team member account to get started: their profile is created with it.</p>
          <button type="button" className="btn btn--primary" onClick={() => setCreating(true)}><i className="fas fa-user-plus" /> New team member</button>
        </section>
      )}
      {data?.results.length > 0 && (
        <ul className="tma-list">
          {data.results.map((m, i) => (
            <li key={m.id} className={`card tma-row${m.is_published ? '' : ' is-draft'}`}>
              <div className="tma-row__order">
                <button type="button" className="icon-btn" aria-label={`Move ${m.name} up`} disabled={i === 0} onClick={() => move(i, -1)}><i className="fas fa-arrow-up" /></button>
                <button type="button" className="icon-btn" aria-label={`Move ${m.name} down`} disabled={i === data.results.length - 1} onClick={() => move(i, 1)}><i className="fas fa-arrow-down" /></button>
              </div>
              <div className="tma-row__photo">{m.photo ? <img src={assetUrl(m.photo)} alt="" /> : <span>{initials(m.name)}</span>}</div>
              <div className="tma-row__who">
                <Link to={`/admin/team/${m.id}`}><strong>{m.name}</strong></Link>
                <small>{m.job_title || <em>No job title yet</em>} · {m.role_display} · {m.email}</small>
                <span className="tma-row__chips">
                  <span className={`badge ${m.is_published ? 'badge--green' : 'badge--gray'}`}>{m.is_published ? 'Published' : 'Draft'}</span>
                  {m.featured && <span className="badge badge--blue">Featured</span>}
                  {m.has_cv && <span className="badge badge--outline"><i className="fas fa-file-pdf" /> CV</span>}
                  {!m.allow_chat && <span className="badge badge--outline">Chat off</span>}
                  <small className="muted">Updated {timeAgo(m.updated_at)}</small>
                </span>
              </div>
              <div className="tma-row__actions">
                <button type="button" className="btn btn--outline btn--sm" disabled={busy === m.id} onClick={() => toggle(m, 'is_published')}>
                  <i className={`fas ${m.is_published ? 'fa-eye-slash' : 'fa-eye'}`} /> {m.is_published ? 'Unpublish' : 'Publish'}
                </button>
                <Link to={`/team/${m.slug}`} target="_blank" className="btn btn--text btn--sm" aria-label={`View ${m.name}'s page`}><i className="fas fa-arrow-up-right-from-square" /></Link>
                <Link to={`/admin/team/${m.id}`} className="btn btn--primary btn--sm"><i className="fas fa-pen" /> Edit</Link>
              </div>
            </li>
          ))}
        </ul>
      )}

      {creating && (
        <CreateUserDialog initialRole="TEAM_MEMBER" onClose={() => setCreating(false)}
          onCreated={(u) => { setCreating(false); if (u.team_profile_id) navigate(`/admin/team/${u.team_profile_id}`); else load(); }} />
      )}
    </PortalLayout>
  );
};

/** Admin → Team → one member: the full portfolio editor. */
export const AdminTeamMemberPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const api = useMemo(() => ({
    load: () => teamAPI.profile(id),
    save: (data) => teamAPI.saveProfile(id, data),
    uploadCv: (file) => teamAPI.uploadCv(id, file),
    removeCv: () => teamAPI.removeCv(id),
  }), [id]);
  const remove = async () => {
    if (!window.confirm('Remove this person from the team? Their account stays; only the portfolio is deleted.')) return;
    try {
      await teamAPI.removeProfile(id);
      toast.success('Removed from the team.');
      navigate('/admin/team');
    } catch (err) {
      toast.error(parseApiErrors(err).detail || 'Could not remove them.');
    }
  };
  return (
    <PortalLayout title="Team member" subtitle={<Link to="/admin/team"><i className="fas fa-arrow-left" /> Back to the team</Link>}
      actions={<button type="button" className="btn btn--text btn--sm text-danger" onClick={remove}><i className="fas fa-user-minus" /> Remove from team</button>}>
      <TeamProfileEditor api={api} admin />
    </PortalLayout>
  );
};

/** /team-profile: a team member edits their own portfolio. */
export const MyTeamProfilePage = () => {
  const api = useMemo(() => ({
    load: () => teamAPI.mine(),
    save: (data) => teamAPI.saveMine(data),
    uploadCv: (file) => teamAPI.uploadMyCv(file),
    removeCv: () => teamAPI.removeMyCv(),
  }), []);
  return (
    <PortalLayout title="My portfolio" subtitle="Your page on the ADRAM Team page. An administrator publishes it once it’s ready.">
      <TeamProfileEditor api={api} />
    </PortalLayout>
  );
};

export default AdminTeamPage;

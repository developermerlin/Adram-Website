import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import PortalLayout from '../../components/layout/PortalLayout';
import { useServices } from '../../content/useServices';
import { projectsAPI } from '../../services/api';
import { assetUrl } from '../../utils/assets';
import '../../styles/projects-admin.css';

const FILTERS = [['', 'All'], ['published', 'Published'], ['draft', 'Drafts'], ['featured', 'Featured']];

/** Admin → Projects: the completed projects shown on the Projects page, in the order visitors see them. */
export const AdminProjectsPage = () => {
  const navigate = useNavigate();
  const { services } = useServices();
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('');
  const [q, setQ] = useState('');
  const load = useCallback(() => projectsAPI.manage().then(({ data: d }) => setData(d)).catch(() => setData({ results: [], counts: {} })), []);
  useEffect(() => { load(); }, [load]);

  const serviceName = (id) => services.find((s) => s.id === id)?.title || '';
  const term = q.trim().toLowerCase();
  const all = data?.results || [];
  const rows = all.filter((p) => (!filter || (filter === 'featured' ? p.featured : p.status === filter))
    && (!term || `${p.title} ${p.client} ${p.sector} ${p.summary}`.toLowerCase().includes(term)));
  const ordering = !filter && !term; // moving up and down only makes sense in the full list

  const move = async (index, by) => {
    const ids = all.map((p) => p.id);
    [ids[index], ids[index + by]] = [ids[index + by], ids[index]];
    setData((d) => ({ ...d, results: ids.map((id) => d.results.find((p) => p.id === id)) }));
    try { await projectsAPI.reorder(ids); } catch { toast.error('Could not save the new order.'); load(); }
  };
  const toggle = async (p, patch, message) => {
    try { await projectsAPI.update(p.id, patch); toast.success(message); load(); }
    catch (err) { toast.error(err.response?.data?.detail || 'Could not save.'); }
  };
  const remove = async (p) => {
    if (!window.confirm(`Delete “${p.title}”? This can’t be undone.`)) return;
    await projectsAPI.remove(p.id);
    toast.success('Project deleted.');
    load();
  };

  return (
    <PortalLayout title="Projects" subtitle="Completed work shown on the Projects page, each with its own case study.">
      <div className="pja-head">
        <div className="pja-filters" role="tablist" aria-label="Filter projects">
          {FILTERS.map(([id, label]) => (
            <button key={id || 'all'} type="button" role="tab" aria-selected={filter === id} className={filter === id ? 'is-active' : ''} onClick={() => setFilter(id)}>
              {label}<span>{data?.counts?.[id || 'all'] ?? '·'}</span>
            </button>
          ))}
        </div>
        <div className="pja-head__actions">
          <Link to="/admin/content/projects" className="btn btn--text btn--sm"><i className="fas fa-sliders" /> Page wording</Link>
          <a href="/projects" target="_blank" rel="noreferrer" className="btn btn--outline btn--sm"><i className="fas fa-arrow-up-right-from-square" /> View page</a>
          <button type="button" className="btn btn--primary btn--sm" onClick={() => navigate('/admin/projects/new')}><i className="fas fa-plus" /> New project</button>
        </div>
      </div>

      <div className="card pja-card">
        <div className="pja-search">
          <i className="fas fa-magnifying-glass" aria-hidden="true" />
          <input type="search" className="input" placeholder="Search by title, client or sector…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search projects" />
        </div>
        {!data ? <div className="pja-pad"><div className="skeleton skeleton--block" /></div> : rows.length === 0 ? (
          <div className="pja-empty">
            <i className="fas fa-briefcase" aria-hidden="true" />
            <p>{all.length ? 'No project matches.' : 'No projects yet. Add the first one: a title, a short summary and a picture are enough to start.'}</p>
            {!all.length && <Link to="/admin/projects/new" className="btn btn--primary btn--sm"><i className="fas fa-plus" /> New project</Link>}
          </div>
        ) : (
          <ul className="pja-list">
            {rows.map((p) => {
              const index = all.indexOf(p);
              return (
                <li key={p.id} className="pja-row">
                  <Link to={`/admin/projects/${p.id}`} className="pja-row__main">
                    {p.cover ? <img src={assetUrl(p.cover)} alt="" /> : <span className="pja-row__blank"><i className="fas fa-image" aria-hidden="true" /></span>}
                    <span className="pja-row__text">
                      <strong>{p.title}</strong>
                      <small>{[p.client, serviceName(p.service), p.year].filter(Boolean).join(' · ') || 'No details yet'}</small>
                    </span>
                  </Link>
                  <span className="pja-row__badges">
                    <span className={`badge ${p.status === 'published' ? 'badge--green' : 'badge--gray'}`}>{p.status === 'published' ? 'Published' : 'Draft'}</span>
                    {p.featured && <span className="badge badge--amber"><i className="fas fa-star" aria-hidden="true" /> Featured</span>}
                  </span>
                  <span className="pja-row__tools">
                    {ordering && (
                      <>
                        <button type="button" className="icon-btn" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move ${p.title} up`} title="Move up"><i className="fas fa-arrow-up" /></button>
                        <button type="button" className="icon-btn" disabled={index === all.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${p.title} down`} title="Move down"><i className="fas fa-arrow-down" /></button>
                      </>
                    )}
                    <button type="button" className="icon-btn" onClick={() => toggle(p, { featured: !p.featured }, p.featured ? 'No longer featured.' : 'Featured at the top of the page.')}
                      aria-label={p.featured ? `Stop featuring ${p.title}` : `Feature ${p.title}`} title={p.featured ? 'Stop featuring' : 'Feature'}>
                      <i className={`${p.featured ? 'fas' : 'far'} fa-star`} />
                    </button>
                    <button type="button" className="icon-btn" onClick={() => toggle(p, { status: p.status === 'published' ? 'draft' : 'published' }, p.status === 'published' ? 'Moved to drafts.' : 'Published.')}
                      aria-label={p.status === 'published' ? `Unpublish ${p.title}` : `Publish ${p.title}`} title={p.status === 'published' ? 'Unpublish' : 'Publish'}>
                      <i className={`fas ${p.status === 'published' ? 'fa-eye-slash' : 'fa-paper-plane'}`} />
                    </button>
                    <Link to={`/admin/projects/${p.id}`} className="icon-btn" aria-label={`Edit ${p.title}`} title="Edit"><i className="fas fa-pen" /></Link>
                    <button type="button" className="icon-btn pja-danger" onClick={() => remove(p)} aria-label={`Delete ${p.title}`} title="Delete"><i className="fas fa-trash-can" /></button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {ordering && all.length > 1 && <p className="muted small pja-note">Visitors see the projects in this order. The first featured one is shown large at the top.</p>}
    </PortalLayout>
  );
};

export default AdminProjectsPage;

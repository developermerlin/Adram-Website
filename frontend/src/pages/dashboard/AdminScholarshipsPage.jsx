import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { destinations, FUNDING } from '../../data/scholarships';
import { timeAgo } from '../../utils/format';
import PortalLayout from '../../components/layout/PortalLayout';
import Flag from '../../components/ui/Flag';
import { Alert } from '../../components/ui/Form';
import ConfirmDialog from '../../components/admin/ConfirmDialog';
import { PublishBadge } from '../../components/admin/catalog';
import { DELETE_CONFIRM, useCatalogList } from '../../components/admin/useCatalogAdmin';
import ScholarshipsOverview from '../../components/admin/ScholarshipsOverview';

const TABS = [
  { id: '', label: 'All' },
  { id: 'published', label: 'Published' },
  { id: 'draft', label: 'Drafts' },
];

const matchesTab = (tab) => (s) => !tab || (tab === 'published') === s.is_published;

export const AdminScholarshipsPage = () => {
  const [params, setParams] = useSearchParams();
  const tab = params.get('show') || '';
  const [search, setSearch] = useState('');
  const [country, setCountry] = useState('');
  const [deleting, setDeleting] = useState(null);
  const { items, error, togglePublish, move, remove } = useCatalogList('scholarships');

  const q = search.trim().toLowerCase();
  const visible = (items || []).filter(
    (s) => matchesTab(tab)(s) && (!country || s.country === country) && (!q || `${s.name} ${s.provider} ${s.fields}`.toLowerCase().includes(q)),
  );
  // Reordering only makes sense on the complete list, which is the order visitors see.
  const canReorder = !tab && !country && !q;

  return (
    <PortalLayout
      title="Scholarships"
      subtitle="Listings on the public Scholarships page. Drafts stay hidden until you publish them."
      actions={
        <>
          <Link to="/admin/scholarships/new" className="btn btn--primary btn--sm"><i className="fas fa-plus" /> New scholarship</Link>
          <Link to="/scholarships" className="btn btn--outline btn--sm" target="_blank"><i className="fas fa-arrow-up-right-from-square" /> View page</Link>
        </>
      }
    >
      {/* Refreshes when a listing is added, removed, published or unpublished */}
      <ScholarshipsOverview refreshKey={items ? items.map((s) => `${s.id}:${s.is_published}`).sort().join(',') : ''} />

      <div className="tabs" role="tablist" aria-label="Filter by status">
        {TABS.map((t) => (
          <button key={t.id || 'all'} type="button" role="tab" aria-selected={tab === t.id} className={`tabs__tab${tab === t.id ? ' is-active' : ''}`} onClick={() => setParams(t.id ? { show: t.id } : {}, { replace: true })}>
            {t.label}
            {items && <span className="tabs__count">{items.filter(matchesTab(t.id)).length}</span>}
          </button>
        ))}
      </div>

      <section className="card table-card">
        <div className="table-card__head">
          <div className="table-card__filters">
            <div className="input-icon">
              <i className="fas fa-magnifying-glass" aria-hidden="true" />
              <input type="search" className="input" placeholder="Search name, provider or subject" aria-label="Search scholarships" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select className="input" aria-label="Filter by destination" value={country} onChange={(e) => setCountry(e.target.value)}>
              <option value="">All destinations</option>
              {Object.entries(destinations).map(([code, d]) => <option key={code} value={code}>{d.name}</option>)}
            </select>
          </div>
          <span className="muted small">
            {canReorder ? <><i className="fas fa-arrows-up-down" /> Use the arrows to set the order on the website</> : `${visible.length} shown`}
          </span>
        </div>

        {error && <Alert>{error}</Alert>}

        <div className="table-scroll">
          <table className="table table--catalog">
            <thead>
              <tr>
                {canReorder && <th className="table__order"><span className="sr-only">Order</span></th>}
                <th>Scholarship</th>
                <th>Destination</th>
                <th>Level &amp; funding</th>
                <th>Status</th>
                <th className="col-edited">Last edited</th>
                <th className="table__actions">Actions</th>
              </tr>
            </thead>
            <tbody className={items ? '' : 'is-loading'}>
              {items && visible.length === 0 && (
                <tr>
                  <td colSpan="7" className="table__empty">
                    <i className="fas fa-graduation-cap" /> {items.length ? 'No scholarships match your filters.' : 'No scholarships yet. Add the first one.'}
                  </td>
                </tr>
              )}
              {visible.map((s, i) => (
                <tr key={s.id}>
                  {canReorder && (
                    <td className="table__order">
                      <span className="order-btns">
                        <button type="button" className="icon-btn" aria-label={`Move ${s.name} up`} disabled={i === 0} onClick={() => move(s, -1)}><i className="fas fa-chevron-up" /></button>
                        <button type="button" className="icon-btn" aria-label={`Move ${s.name} down`} disabled={i === visible.length - 1} onClick={() => move(s, 1)}><i className="fas fa-chevron-down" /></button>
                      </span>
                    </td>
                  )}
                  <td>
                    <Link to={`/admin/scholarships/${s.id}`} className="title-cell">
                      <strong>{s.name}</strong>
                      <small>{s.provider}</small>
                    </Link>
                  </td>
                  <td>
                    <span className="flag-cell"><Flag code={s.country} size={22} /> {destinations[s.country]?.name || s.country}</span>
                  </td>
                  <td>
                    <div className="cell-stack">
                      <span>{s.levels.join(', ')}</span>
                      <small>{FUNDING[s.funding]}</small>
                    </div>
                  </td>
                  <td>
                    <span className="badge-row">
                      <PublishBadge published={s.is_published} />
                      {s.members_only && <i className="fas fa-lock restrict-icon" title="Sign-in to view details" aria-label="Sign-in to view details" />}
                      {s.hide_official_link && <i className="fas fa-link-slash restrict-icon" title="Official link hidden" aria-label="Official link hidden" />}
                    </span>
                  </td>
                  <td className="col-edited">
                    <div className="cell-stack">
                      <span>{timeAgo(s.updated_at)}</span>
                      {s.updated_by_name && <small>by {s.updated_by_name}</small>}
                    </div>
                  </td>
                  <td className="table__actions">
                    <span className="action-row">
                      <button type="button" className={`icon-btn${s.is_published ? '' : ' icon-btn--publish'}`} title={s.is_published ? 'Unpublish' : 'Publish'} aria-label={`${s.is_published ? 'Unpublish' : 'Publish'} ${s.name}`} onClick={() => togglePublish(s)}>
                        <i className={`fas ${s.is_published ? 'fa-eye-slash' : 'fa-globe'}`} />
                      </button>
                      <Link to={`/admin/scholarships/${s.id}`} className="icon-btn" title="Edit" aria-label={`Edit ${s.name}`}><i className="fas fa-pen" /></Link>
                      <button type="button" className="icon-btn icon-btn--danger" title="Delete" aria-label={`Delete ${s.name}`} onClick={() => setDeleting(s)}><i className="fas fa-trash-can" /></button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {deleting && (
        <ConfirmDialog
          config={DELETE_CONFIRM('scholarship')}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await remove(deleting);
            setDeleting(null);
          }}
        />
      )}
    </PortalLayout>
  );
};

export default AdminScholarshipsPage;

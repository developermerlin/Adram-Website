import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { adminAPI, parseApiErrors } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { ROLES } from '../../config/roles';
import { formatDate, timeAgo } from '../../utils/format';
import { ACTION_META, CONFIRM } from '../../utils/userStatus';
import PortalLayout from '../../components/layout/PortalLayout';
import CreateUserDialog from '../../components/lms/CreateUserDialog';
import Avatar from '../../components/ui/Avatar';
import { Alert } from '../../components/ui/Form';
import { StatusBadges, UserActions, UserDrawer } from '../../components/admin/UserAdmin';
import ConfirmDialog from '../../components/admin/ConfirmDialog';
import useUserAction from '../../components/admin/useUserAction';
import UsersOverview from '../../components/admin/UsersOverview';

const TABS = [
  { id: '', label: 'All users', stat: 'total' },
  { id: 'pending', label: 'Pending', stat: 'pending' },
  { id: 'approved', label: 'Approved', stat: 'approved' },
  { id: 'rejected', label: 'Rejected', stat: 'rejected' },
  { id: 'suspended', label: 'Disabled', stat: 'suspended' },
];

const BULK = ['approve', 'reject', 'suspend', 'activate'];

export const AdminUsersPage = () => {
  const { user: me } = useAuth();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ results: [], count: 0, next: null, previous: null });
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [bulkConfirm, setBulkConfirm] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [creating, setCreating] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    adminAPI.getStats().then(({ data }) => setStats(data)).catch(() => {});
    return adminAPI
      .getUsers({ status, role, search, page })
      .then(({ data }) => {
        setResult(data);
        setError('');
      })
      .catch(() => setError('Could not load users. Refresh the page to try again.'))
      .finally(() => setLoading(false));
  }, [status, role, search, page]);

  useEffect(() => {
    const t = setTimeout(reload, 250); // debounce the search box
    return () => clearTimeout(t);
  }, [reload]);

  // Statistics refresh after actions that change accounts, not on every search keystroke.
  const [statsVersion, setStatsVersion] = useState(0);
  const [run, dialog] = useUserAction(() => {
    reload();
    setStatsVersion((v) => v + 1);
  });

  const pickTab = (id) => {
    setParams(id ? { status: id } : {}, { replace: true });
    setPage(1);
    setSelected([]);
  };

  const toggle = (id) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const selectable = result.results.filter((u) => u.id !== me?.id).map((u) => u.id);
  const allSelected = selectable.length > 0 && selectable.every((id) => selected.includes(id));

  const runBulk = async (action, reason = '') => {
    try {
      const { data } = await adminAPI.bulkAction(selected, action, reason ? { reason } : {});
      toast.success(`${data.updated} account${data.updated === 1 ? '' : 's'} ${ACTION_META[action].done}.`);
      if (data.skipped.length) toast(`${data.skipped.length} skipped: ${data.skipped[0].reason}`, { icon: 'ℹ️' });
      setSelected([]);
      reload();
      setStatsVersion((v) => v + 1);
    } catch (err) {
      toast.error(parseApiErrors(err).form);
    }
  };

  const removeUser = async () => {
    try {
      await adminAPI.deleteUser(deleting.id);
      toast.success(`${deleting.full_name}’s account was deleted.`);
      setSelected((cur) => cur.filter((id) => id !== deleting.id));
      setDeleting(null);
      if (result.results.length === 1 && page > 1) setPage((p) => p - 1);
      else reload();
      setStatsVersion((v) => v + 1);
    } catch (err) {
      toast.error(parseApiErrors(err).form || 'The account couldn’t be deleted. Try again.');
    }
  };

  const bulk = (action) => (CONFIRM[action] ? setBulkConfirm(action) : runBulk(action));

  return (
    <PortalLayout title="Users" subtitle="Approve new accounts, manage access and change roles." actions={<button type="button" className="btn btn--primary btn--sm" onClick={() => setCreating(true)}><i className="fas fa-user-plus" /> Create user</button>}>
      <UsersOverview
        version={statsVersion}
        onPickStatus={(s) => {
          pickTab(s);
          document.getElementById('users-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
      />

      <div className="tabs" id="users-table" role="tablist" aria-label="Filter by status">
        {TABS.map((t) => (
          <button key={t.id || 'all'} type="button" role="tab" aria-selected={status === t.id} className={`tabs__tab${status === t.id ? ' is-active' : ''}${t.id === 'pending' && stats?.pending ? ' has-alert' : ''}`} onClick={() => pickTab(t.id)}>
            {t.label}
            {stats && <span className="tabs__count">{stats[t.stat]}</span>}
          </button>
        ))}
      </div>

      <section className="card table-card">
        <div className="table-card__head">
          <div className="table-card__filters">
            <div className="input-icon">
              <i className="fas fa-magnifying-glass" aria-hidden="true" />
              <input type="search" className="input" placeholder="Search name, email, phone or country" aria-label="Search users" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </div>
            <select className="input" aria-label="Filter by role" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}>
              <option value="">All roles</option>
              {Object.entries(ROLES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <span className="muted small">{result.count} user{result.count === 1 ? '' : 's'}</span>
        </div>

        {selected.length > 0 && (
          <div className="bulk-bar" role="region" aria-label="Bulk actions">
            <strong>{selected.length} selected</strong>
            {BULK.map((action) => (
              <button key={action} type="button" className={`btn btn--sm ${ACTION_META[action].className}`} onClick={() => bulk(action)}>
                <i className={`fas ${ACTION_META[action].icon}`} /> {ACTION_META[action].label}
              </button>
            ))}
            <button type="button" className="btn btn--text btn--sm" onClick={() => setSelected([])}>Clear</button>
          </div>
        )}

        {error && <Alert>{error}</Alert>}

        <div className="table-scroll">
          <table className="table table--users">
            <thead>
              <tr>
                <th className="table__check">
                  <input type="checkbox" aria-label="Select all on this page" checked={allSelected} onChange={() => setSelected(allSelected ? [] : selectable)} />
                </th>
                <th>User</th>
                <th>Role</th>
                <th>Status</th>
                <th>Activity</th>
                <th className="table__actions">Actions</th>
              </tr>
            </thead>
            <tbody className={loading ? 'is-loading' : ''}>
              {!loading && result.results.length === 0 && (
                <tr>
                  <td colSpan="6" className="table__empty">
                    <i className="fas fa-user-check" /> {status === 'pending' ? 'No accounts are waiting for approval.' : 'No users match your filters.'}
                  </td>
                </tr>
              )}
              {result.results.map((u) => (
                <tr key={u.id} className={selected.includes(u.id) ? 'is-selected' : ''}>
                  <td className="table__check">
                    <input type="checkbox" aria-label={`Select ${u.full_name}`} disabled={u.id === me?.id} checked={selected.includes(u.id)} onChange={() => toggle(u.id)} />
                  </td>
                  <td>
                    <button type="button" className="user-cell user-cell--button" onClick={() => setOpenId(u.id)}>
                      <Avatar person={u} size={36} />
                      <div>
                        <strong>{u.full_name}</strong>
                        <small>{u.email}</small>
                      </div>
                    </button>
                  </td>
                  <td><span className="badge badge--blue">{u.role_display}</span></td>
                  <td><StatusBadges user={u} /></td>
                  <td>
                    <div className="cell-stack">
                      <span>Joined {formatDate(u.created_at)}</span>
                      <small>Last sign-in: {u.last_login ? timeAgo(u.last_login) : 'never'}</small>
                    </div>
                  </td>
                  <td className="table__actions">
                    <span className="action-row">
                      <UserActions user={u} run={run} isSelf={u.id === me?.id} />
                      <button type="button" className="icon-btn" title="View" aria-label={`View ${u.full_name}`} onClick={() => setOpenId(u.id)}>
                        <i className="fas fa-eye" />
                      </button>
                      {u.id !== me?.id && (
                        <button type="button" className="icon-btn icon-btn--danger" title="Delete" aria-label={`Delete ${u.full_name}`} onClick={() => setDeleting(u)}>
                          <i className="fas fa-trash-can" />
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="table-card__foot">
          <span className="muted small">Page {page}</span>
          <div className="pager">
            <button type="button" className="btn btn--outline btn--sm" disabled={!result.previous || loading} onClick={() => setPage((p) => p - 1)}>
              <i className="fas fa-chevron-left" /> Previous
            </button>
            <button type="button" className="btn btn--outline btn--sm" disabled={!result.next || loading} onClick={() => setPage((p) => p + 1)}>
              Next <i className="fas fa-chevron-right" />
            </button>
          </div>
        </div>
      </section>

      {openId && <UserDrawer userId={openId} onClose={() => setOpenId(null)} onChanged={() => reload()} />}
      {dialog}
      {deleting && (
        <ConfirmDialog
          config={{
            title: `Delete ${deleting.full_name}’s account?`,
            text: 'Their account, applications, documents, messages and history are removed permanently. This can’t be undone. To only block access, disable the account instead.',
            confirm: 'Delete permanently',
          }}
          onClose={() => setDeleting(null)}
          onConfirm={removeUser}
        />
      )}
      {bulkConfirm && (
        <ConfirmDialog
          config={CONFIRM[bulkConfirm]}
          count={selected.length}
          onClose={() => setBulkConfirm(null)}
          onConfirm={async (reason) => {
            await runBulk(bulkConfirm, reason);
            setBulkConfirm(null);
          }}
        />
      )}
      {creating && <CreateUserDialog onClose={() => setCreating(false)} onCreated={(u) => { setCreating(false); setSearch(u.email); setPage(1); setOpenId(u.id); }} />}
    </PortalLayout>
  );
};

export default AdminUsersPage;

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { ROLES } from '../../config/roles';
import { formatDate, formatDateTime, timeAgo } from '../../utils/format';
import { ACTION_META, ACTIONS_FOR, STATUS_META, statusOf } from '../../utils/userStatus';
import Avatar from '../ui/Avatar';
import { ActivityList } from '../../pages/dashboard/ActivityPage';
import useUserAction from './useUserAction';
import UserLearningPanel from '../lms/UserLearningPanel';
import UserEditForm from '../lms/UserEditForm';

export const StatusBadges = ({ user }) => {
  const meta = STATUS_META[statusOf(user)];
  return (
    <span className="badge-row">
      <span className={`badge ${meta.badge}`}><i className={`fas ${meta.icon}`} /> {meta.label}</span>
      {!user.is_verified && <span className="badge badge--outline" title="Email not verified yet">Email unverified</span>}
    </span>
  );
};

export const UserActions = ({ user, run, size = 'sm', isSelf }) => {
  if (isSelf) return <span className="muted small">This is you</span>;
  return (
    <span className="action-row">
      {ACTIONS_FOR[statusOf(user)].map((action) => {
        const meta = ACTION_META[action];
        return (
          <button
            key={action}
            type="button"
            className={`btn btn--${size} ${meta.className}${meta.iconOnly ? ' btn--icon-only' : ''}`}
            onClick={() => run(user, action)}
            title={meta.iconOnly ? meta.label : undefined}
            aria-label={meta.iconOnly ? `${meta.label} ${user.full_name}` : undefined}
          >
            <i className={`fas ${meta.icon}`} />{meta.iconOnly ? null : ` ${meta.label}`}
          </button>
        );
      })}
    </span>
  );
};

// Slide-over panel with everything about one user.
export const UserDrawer = ({ userId, onClose, onChanged }) => {
  const { user: me } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = () =>
    adminAPI
      .getUser(userId)
      .then(({ data: d }) => setData(d))
      .catch(() => setError('Could not load this user.'));

  const [run, dialog] = useUserAction((updated) => {
    onChanged?.(updated);
    load();
  });

  useEffect(() => {
    load();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const u = data?.user;
  const isSelf = u && me?.id === u.id;

  return (
    <div className="drawer" role="dialog" aria-modal="true" aria-label="User details">
      <button type="button" className="drawer__backdrop" aria-label="Close" onClick={onClose} />
      <aside className="drawer__panel">
        <div className="drawer__head">
          <h2>User details</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><i className="fas fa-xmark" /></button>
        </div>

        {error && <p className="alert alert--error">{error}</p>}
        {!u && !error && <div className="spinner" />}

        {u && (
          <div className="drawer__body">
            <div className="drawer__profile">
              <Avatar person={u} size={64} />
              <div>
                <h3>{u.full_name}</h3>
                <a href={`mailto:${u.email}`}>{u.email}</a>
                <div className="drawer__badges"><StatusBadges user={u} />{u.is_superuser && <span className="badge badge--blue"><i className="fas fa-crown" /> Super Admin</span>}</div>
              </div>
            </div>

            <div className="drawer__actions">
              <UserActions user={u} run={run} size="sm" isSelf={isSelf} />
            </div>

            {u.role !== 'ADMIN' && (
              <Link to={`/messages?user=${u.id}`} className="btn btn--primary btn--sm btn--block drawer__portal">
                <i className="fas fa-comment-dots" /> Message {u.first_name}
              </Link>
            )}
            {u.role === 'STUDENT' && (
              <Link to={`/admin/students/${u.id}`} className="btn btn--outline btn--sm btn--block drawer__portal">
                <i className="fas fa-id-card" /> Open student portal: applications, notes &amp; activity
              </Link>
            )}

            {u.approval_status === 'REJECTED' && u.rejection_reason && (
              <p className="alert alert--error"><i className="fas fa-circle-info" /> <span>Rejection reason: {u.rejection_reason}</span></p>
            )}

            <dl className="facts-list drawer__facts">
              <div>
                <dt>Role</dt>
                <dd>
                  <select
                    className="input input--sm"
                    value={u.role}
                    disabled={isSelf}
                    aria-label="Change role"
                    onChange={(e) => run(u, 'set_role', { role: e.target.value })}
                  >
                    {Object.entries(ROLES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </dd>
              </div>
              <div><dt>Phone</dt><dd>{u.phone_number || '—'}</dd></div>
              <div><dt>Country</dt><dd>{u.country || '—'}</dd></div>
              <div><dt>Joined</dt><dd>{formatDateTime(u.created_at)}</dd></div>
              <div><dt>Last sign-in</dt><dd>{u.last_login ? timeAgo(u.last_login) : 'Never'}</dd></div>
              {u.approved_at && <div><dt>Approved</dt><dd>{formatDate(u.approved_at)}{u.approved_by_name ? ` by ${u.approved_by_name}` : ''}</dd></div>}
              {data.social_accounts.length > 0 && (
                <div><dt>Linked sign-in</dt><dd>{data.social_accounts.map((s) => s.provider[0].toUpperCase() + s.provider.slice(1)).join(', ')}</dd></div>
              )}
            </dl>

            {['STUDENT', 'INSTRUCTOR'].includes(u.role) && (
              <>
                <h4 className="drawer__subhead">Learning &amp; purchases</h4>
                <UserLearningPanel userId={u.id} />
              </>
            )}

            {(!u.is_superuser || me?.is_superuser) && <UserEditForm key={u.updated_at} user={u} onSaved={() => { load(); onChanged?.(u); }} />}

            <h4 className="drawer__subhead">Recent activity</h4>
            <ActivityList items={data.activity} loading={false} />
          </div>
        )}
      </aside>
      {dialog}
    </div>
  );
};

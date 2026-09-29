import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { authAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import AdminActivity from '../../components/admin/AdminActivity';
import { UserDrawer } from '../../components/admin/UserAdmin';
import MyActivityInsights from '../../components/portal/MyActivityInsights';

const DEVICE_ICONS = { desktop: 'fa-desktop', mobile: 'fa-mobile-screen', tablet: 'fa-tablet-screen-button' };
const DEVICE_LABELS = { desktop: 'Computer', mobile: 'Phone', tablet: 'Tablet' };
import { ACTIVITY_ICONS } from '../../config/roles';
import { formatDateTime, timeAgo } from '../../utils/format';
import PortalLayout from '../../components/layout/PortalLayout';
import { Alert } from '../../components/ui/Form';

export const ActivityList = ({ items, loading, error, compact = false }) => {
  if (loading && items.length === 0) {
    return (
      <ul className="activity" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <li key={i} className="activity__item"><span className="skeleton skeleton--icon" /><span className="skeleton skeleton--line" /></li>
        ))}
      </ul>
    );
  }
  if (error) return <p className="muted">Activity couldn’t be loaded right now.</p>;
  if (items.length === 0) return <p className="muted">No activity recorded yet.</p>;

  return (
    <ul className={`activity${compact ? ' activity--compact' : ''}${loading ? ' is-loading' : ''}`}>
      {items.map((log) => (
        <li key={log.id} className={`activity__item${log.action === 'FAILED_LOGIN' ? ' is-warning' : ''}`}>
          <span className="activity__icon"><i className={`fas ${ACTIVITY_ICONS[log.action] || 'fa-circle-dot'}`} /></span>
          <div className="activity__body">
            <strong>{log.action_display}</strong>
            {!compact && log.description && <span className="muted">{log.description}</span>}
          </div>
          <div className="activity__meta">
            <time dateTime={log.timestamp} title={formatDateTime(log.timestamp)}>{timeAgo(log.timestamp)}</time>
            {!compact && (log.ip_address || (log.device && log.device !== 'unknown')) && (
              <small>
                {log.device && log.device !== 'unknown' && <><i className={`fas ${DEVICE_ICONS[log.device]}`} aria-hidden="true" /> {DEVICE_LABELS[log.device]}</>}
                {log.ip_address && log.device && log.device !== 'unknown' ? ' · ' : ''}
                {log.ip_address && `IP ${log.ip_address}`}
              </small>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
};

// Admins see everyone's activity (with statistics) and can switch to their own; everyone else sees their own.
export const ActivityPage = () => {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [openId, setOpenId] = useState(null);
  const isAdmin = user?.role === 'ADMIN';
  const view = isAdmin && params.get('view') !== 'mine' ? 'all' : 'mine';

  if (!isAdmin) return <MyActivityPage />;

  return (
    <PortalLayout title="Activity log" subtitle="Every sign-in and account change across the portal, with security signals.">
      <div className="tabs" role="tablist" aria-label="Whose activity">
        {[{ id: 'all', label: 'All activity', icon: 'fa-users' }, { id: 'mine', label: 'My activity', icon: 'fa-user' }].map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={view === t.id} className={`tabs__tab${view === t.id ? ' is-active' : ''}`}
            onClick={() => setParams(t.id === 'mine' ? { view: 'mine' } : {}, { replace: true })}>
            <i className={`fas ${t.icon}`} aria-hidden="true" /> {t.label}
          </button>
        ))}
      </div>
      {view === 'all' ? <AdminActivity onOpenUser={setOpenId} /> : <MyActivity />}
      {openId && <UserDrawer userId={openId} onClose={() => setOpenId(null)} onChanged={() => {}} />}
    </PortalLayout>
  );
};

const MyActivityPage = () => (
  <PortalLayout title="Activity log" subtitle="Sign-ins and changes to your account, newest first.">
    <MyActivity />
  </PortalLayout>
);

// The signed-in person's own log.
const MyActivity = () => {
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ loading: true, items: [], count: 0, next: null, previous: null });

  useEffect(() => {
    authAPI
      .getActivityLogs(page)
      .then(({ data }) => setState({ loading: false, items: data.results, count: data.count, next: data.next, previous: data.previous }))
      .catch(() => setState((prev) => ({ ...prev, loading: false, error: true })));
  }, [page]);

  const goTo = (next) => {
    setState((prev) => ({ ...prev, loading: true }));
    setPage(next);
  };

  const hasFailedLogins = state.items.some((log) => log.action === 'FAILED_LOGIN');

  return (
    <>
      <MyActivityInsights />
      {hasFailedLogins && (
        <Alert type="info">
          We recorded failed sign-in attempts on your account. If they weren’t you, change your password from Profile &amp; security.
        </Alert>
      )}
      <section className="card panel">
        <ActivityList {...state} />
        {(state.next || state.previous) && (
          <div className="panel__foot">
            <span className="muted">{state.count} events</span>
            <div className="pager">
              <button type="button" className="btn btn--outline btn--sm" disabled={!state.previous || state.loading} onClick={() => goTo(page - 1)}>
                <i className="fas fa-chevron-left" /> Newer
              </button>
              <button type="button" className="btn btn--outline btn--sm" disabled={!state.next || state.loading} onClick={() => goTo(page + 1)}>
                Older <i className="fas fa-chevron-right" />
              </button>
            </div>
          </div>
        )}
      </section>
    </>
  );
};

export default ActivityPage;

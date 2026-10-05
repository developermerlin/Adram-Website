import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { siteLockAPI } from '../../services/api';

// Pages that stay usable while locked, so an administrator can always sign in and unlock
const OPEN_PAGES = ['/login', '/oauth/callback'];

/**
 * Admin → Lock website. While locked, everyone except administrators sees the website greyed out and cannot click,
 * type or tab into anything (#root is made `inert`); a card explains why. The server refuses their changes too
 * (backend cms/lock.py), so this is the visible half of the lock, not the only one.
 */
const SiteLock = () => {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const [lock, setLock] = useState({ locked: false, message: '' });

  const check = useCallback(() => siteLockAPI.status().then(({ data }) => setLock(data)).catch(() => {}), []);
  useEffect(() => {
    check();
    const timer = setInterval(check, 60000);
    const onVisible = () => document.visibilityState === 'visible' && check();
    window.addEventListener('site:locked', check); // a request was refused because the site is locked
    window.addEventListener('site:lock-changed', check); // the admin just switched it
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener('site:locked', check);
      window.removeEventListener('site:lock-changed', check);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [check]);

  const isAdmin = user?.role === 'ADMIN';
  const onOpenPage = OPEN_PAGES.some((p) => pathname.startsWith(p));
  const blocked = lock.locked && !isAdmin && !onOpenPage;

  useEffect(() => {
    const root = document.getElementById('root');
    if (!root) return undefined;
    root.inert = blocked;
    document.body.classList.toggle('site-locked', blocked);
    return () => {
      root.inert = false;
      document.body.classList.remove('site-locked');
    };
  }, [blocked]);

  if (!lock.locked) return null;

  if (isAdmin) {
    return createPortal(
      <div className="site-lock-admin" role="status">
        <i className="fas fa-lock" aria-hidden="true" />
        <span>The website is locked for visitors.</span>
        <Link to="/admin/settings/lockdown">Manage</Link>
      </div>,
      document.body,
    );
  }

  if (onOpenPage) {
    return createPortal(
      <div className="site-lock-admin site-lock-admin--top" role="status">
        <i className="fas fa-lock" aria-hidden="true" />
        <span>The website is locked. Only administrators can sign in right now.</span>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div className="site-lock" role="alertdialog" aria-modal="true" aria-labelledby="site-lock-title" aria-describedby="site-lock-text">
      <div className="site-lock__card">
        <span className="site-lock__icon" aria-hidden="true"><i className="fas fa-lock" /></span>
        <h2 id="site-lock-title">Website temporarily locked</h2>
        <p id="site-lock-text">{lock.message}</p>
        {user ? (
          <button type="button" className="btn btn--outline btn--sm" onClick={logout}>
            <i className="fas fa-right-from-bracket" aria-hidden="true" /> Sign out
          </button>
        ) : (
          <Link to="/login" className="site-lock__staff"><i className="fas fa-user-shield" aria-hidden="true" /> Administrator sign in</Link>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default SiteLock;

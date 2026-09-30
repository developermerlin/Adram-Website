import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { adminAPI, messagesAPI, portalAPI, staffPortalAPI } from '../../services/api';
import { timeAgo } from '../../utils/format';
import { MESSAGES_CHANGED } from '../../utils/messageEvents';
import { portalNavFor, ROLES } from '../../config/roles';
import Brand from '../ui/Brand';
import Avatar from '../ui/Avatar';
import ThemeMenu from './ThemeMenu';
import CallOverlay from '../chat/CallOverlay';
import NotificationBell from '../lms/NotificationBell';
import { watchIncomingCalls } from '../chat/callStore';
import { SIDEBARS, usePortalPrefs } from './portalPrefs';
import '../../styles/portal.css';
import '../../styles/dashboard-skin.css';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

// Quick jump: type part of a page name, pick it with the arrow keys and Enter. Ctrl+K (⌘K) focuses it.
const QuickSearch = ({ links }) => {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const q = query.trim().toLowerCase();
  const matches = (q ? links.filter((l) => l.label.toLowerCase().includes(q) || l.section.toLowerCase().includes(q)) : links).slice(0, 8);

  const go = (link) => {
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
    navigate(link.to);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') setActive((i) => Math.min(matches.length - 1, i + 1));
    else if (e.key === 'ArrowUp') setActive((i) => Math.max(0, i - 1));
    else if (e.key === 'Enter' && matches[active]) go(matches[active]);
    else if (e.key === 'Escape') inputRef.current?.blur();
    else return;
    e.preventDefault();
  };

  return (
    <div className="topbar__search" role="search">
      <i className="fas fa-magnifying-glass" aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        placeholder="Search pages…"
        aria-label="Search pages"
        role="combobox"
        aria-expanded={open}
        aria-controls="quick-search-list"
        aria-activedescendant={open && matches[active] ? `qs-${active}` : undefined}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setActive(0); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
      />
      <kbd aria-hidden="true">{isMac ? '⌘' : 'Ctrl'} K</kbd>
      {open && (
        <ul className="topbar__results" id="quick-search-list" role="listbox">
          {matches.length === 0 && <li className="topbar__results-empty">No pages match “{query}”</li>}
          {matches.map((l, i) => (
            <li key={l.to} id={`qs-${i}`} role="option" aria-selected={i === active}
              className={i === active ? 'is-active' : ''} onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); go(l); }}>
              <i className={`fas ${l.icon}`} aria-hidden="true" />
              <span>{l.label}</span>
              <small>{l.section}</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// Message icon: unread count and a preview of the latest conversations. Polls every 30 seconds, and
// immediately when the Messages page marks something read (it fires `adram:messages-changed`).
const MESSAGE_POLL_MS = 30000;

const MessagesMenu = ({ isAdmin, onCount }) => {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const ref = useRef(null);
  const { pathname } = useLocation();

  useEffect(() => {
    let alive = true;
    const load = () =>
      messagesAPI.unread().then(({ data: d }) => {
        if (!alive) return;
        setData(d);
        onCount(d.unread);
      }).catch(() => {});
    load();
    const timer = setInterval(load, MESSAGE_POLL_MS);
    window.addEventListener(MESSAGES_CHANGED, load);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener(MESSAGES_CHANGED, load);
    };
  }, [pathname, onCount]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const unread = data?.unread || 0;
  const recent = data?.recent || [];

  return (
    <div className="topbar__notify" ref={ref}>
      <button type="button" className="topbar__icon" aria-label={unread ? `${unread} unread message${unread === 1 ? '' : 's'}` : 'Messages'} aria-expanded={open} title="Messages" onClick={() => setOpen((v) => !v)}>
        <i className="far fa-comment-dots" />
        {unread > 0 && <span className="topbar__dot topbar__dot--msg">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="topbar__menu-pop msg-pop" role="dialog" aria-label="Messages">
          <div className="msg-pop__head">
            <p className="topbar__pop-title">Messages</p>
            {unread > 0 && <span className="msg-pop__count">{unread} unread</span>}
          </div>
          {recent.length === 0 && (
            <p className="topbar__pop-empty">
              <i className="fas fa-circle-check" /> {isAdmin ? 'No conversations yet.' : 'No new messages from the ADRAM team.'}
            </p>
          )}
          <ul className="msg-pop__list">
            {isAdmin
              ? recent.map((c) => (
                  <li key={c.user.id}>
                    <Link to={`/messages?user=${c.user.id}`} onClick={() => setOpen(false)} className={c.unread ? 'is-unread' : ''}>
                      <Avatar person={c.user} size={36} />
                      <span className="msg-pop__text">
                        <span className="msg-pop__top"><strong>{c.user.full_name}</strong><time>{timeAgo(c.at)}</time></span>
                        <small>{c.from_staff ? 'You: ' : ''}{c.body}</small>
                      </span>
                      {c.unread > 0 && <span className="msg-pop__badge">{c.unread}</span>}
                    </Link>
                  </li>
                ))
              : recent.map((m, i) => (
                  <li key={i}>
                    <Link to="/messages" onClick={() => setOpen(false)} className="is-unread">
                      <span className="msg-pop__team" aria-hidden="true"><i className="fas fa-headset" /></span>
                      <span className="msg-pop__text">
                        <span className="msg-pop__top"><strong>{m.sender_name}</strong><time>{timeAgo(m.at)}</time></span>
                        <small>{m.body}</small>
                      </span>
                    </Link>
                  </li>
                ))}
          </ul>
          <Link to="/messages" className="msg-pop__all" onClick={() => setOpen(false)}>
            {isAdmin ? 'Open inbox' : 'Open messages'} <i className="fas fa-arrow-right" />
          </Link>
        </div>
      )}
    </div>
  );
};

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000';

// Shortcuts in the account menu, by role (the full navigation stays in the sidebar).
const accountLinks = (role) =>
  role === 'ADMIN'
    ? [
        { to: '/messages', icon: 'fa-comments', label: 'Messages' },
        { to: '/admin/messages', icon: 'fa-inbox', label: 'Enquiries' },
        { href: `${BACKEND_URL}/admin/`, icon: 'fa-screwdriver-wrench', label: 'Django admin' },
      ]
    : role === 'INSTRUCTOR'
    ? [
        { to: '/instructor/courses', icon: 'fa-chalkboard-user', label: 'My courses' },
        { to: '/instructor/earnings', icon: 'fa-wallet', label: 'Earnings' },
      ]
    : [
        { to: '/student/learning', icon: 'fa-circle-play', label: 'My learning' },
        { to: '/cart', icon: 'fa-cart-shopping', label: 'Cart' },
        { to: '/student/applications', icon: 'fa-list-check', label: 'My applications' },
        { to: '/student/saved', icon: 'fa-bookmark', label: 'Saved scholarships' },
      ];

// Avatar button in the top-right corner with the account menu.
const UserMenu = ({ user, mode, onMode, onLogout }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { pathname } = useLocation();

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Close after navigating.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  const role = ROLES[user?.role] || user?.role;
  const item = (l) => {
    const body = (
      <>
        <i className={`fas ${l.icon}`} aria-hidden="true" />
        <span>{l.label}</span>
        {l.href && <i className="fas fa-arrow-up-right-from-square user-menu__ext" aria-hidden="true" />}
      </>
    );
    return (
      <li key={l.label} role="none">
        {l.href ? (
          <a role="menuitem" href={l.href} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>{body}</a>
        ) : (
          <Link role="menuitem" to={l.to}>{body}</Link>
        )}
      </li>
    );
  };

  return (
    <div className="user-menu" ref={ref}>
      <button
        type="button"
        className="user-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${user?.full_name || 'you'}`}
        onClick={() => setOpen((v) => !v)}
      >
        <Avatar person={user} size={36} />
        <span className="user-menu__who">
          <strong>{user?.first_name || user?.full_name}</strong>
          <small>{role}</small>
        </span>
        <i className="fas fa-chevron-down user-menu__chevron" aria-hidden="true" />
      </button>

      {open && (
        <div className="user-menu__panel">
          <div className="user-menu__head">
            <Avatar person={user} size={46} />
            <div>
              <strong>{user?.full_name}</strong>
              <small>{user?.email}</small>
              <span className="user-menu__role"><i className="fas fa-shield-halved" aria-hidden="true" /> {role}</span>
            </div>
          </div>

          <ul className="user-menu__list" role="menu" aria-label="Account">
            {item({ to: '/profile', icon: 'fa-user-pen', label: 'My profile' })}
            {item({ to: '/profile', icon: 'fa-lock', label: 'Password & security' })}
          </ul>
          <ul className="user-menu__list" role="menu" aria-label="Shortcuts">
            {accountLinks(user?.role).map(item)}
          </ul>

          <div className="user-menu__row">
            <span><i className={`fas ${mode === 'dark' ? 'fa-moon' : 'fa-sun'}`} aria-hidden="true" /> Dark mode</span>
            <button
              type="button"
              role="switch"
              aria-checked={mode === 'dark'}
              aria-label="Dark mode"
              className={`switch${mode === 'dark' ? ' is-on' : ''}`}
              onClick={() => onMode(mode === 'dark' ? 'light' : 'dark')}
            >
              <span />
            </button>
          </div>

          <ul className="user-menu__list" role="menu" aria-label="Session">
            <li role="none">
              <button type="button" role="menuitem" className="user-menu__signout" onClick={onLogout}>
                <i className="fas fa-arrow-right-from-bracket" aria-hidden="true" />
                <span>Sign out</span>
              </button>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
};

export const PortalLayout = ({ title, subtitle, actions, children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [counts, setCounts] = useState({});
  const [prefs, setPrefs, mode] = usePortalPrefs();

  // Sidebar counts, refreshed on each page change: admins see work waiting for them; students see their
  // to-dos and whether they have any training (My training only appears once they've enrolled).
  useEffect(() => {
    const merge = ({ data }) => setCounts((c) => ({ ...c, ...data }));
    if (user?.role === 'ADMIN') {
      adminAPI.getStats().then(merge).catch(() => {});
      staffPortalAPI.summary().then(merge).catch(() => {});
    } else if (user?.role === 'STUDENT') {
      portalAPI.summary().then(merge).catch(() => {});
    }
  }, [user?.role, pathname]);

  // Close the mobile drawer whenever the page changes.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setDrawerOpen(false);
  }

  // Ring when someone calls, on any portal page.
  useEffect(() => (user ? watchIncomingCalls() : undefined), [user]);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && setDrawerOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const nav = portalNavFor(user?.role).map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.requires || counts[item.requires] > 0),
  }));
  const links = nav.flatMap((s) => s.items.filter((i) => !i.external).map((i) => ({ ...i, section: s.heading })));
  // The bell counts everything waiting: work in the sidebar plus unread messages and missed calls
  // (messages also have their own icon, for a quick look at who wrote).
  const waiting = links
    .filter((i) => i.badge && counts[i.badge] > 0)
    .map((i) => ({ ...i, count: counts[i.badge], ...(i.badge === 'messages_unread' ? { label: 'Unread messages & missed calls', icon: 'fa-comment-dots' } : {}) }));
  const setMessageCount = useCallback((n) => setCounts((c) => (c.messages_unread === n ? c : { ...c, messages_unread: n })), []);

  const sidebarStyle = SIDEBARS.find((s) => s.id === prefs.sidebar) || SIDEBARS[0];
  const collapsed = prefs.collapsed;
  // Collapsed, the links show icons only, so the name goes in a tooltip.
  const tip = (label) => (collapsed ? label : undefined);

  return (
    <div
      className={`portal${drawerOpen ? ' drawer-open' : ''}${collapsed ? ' sidebar-collapsed' : ''}`}
      data-mode={mode}
      data-accent={prefs.accent}
      data-sidebar={sidebarStyle.id}
    >
      <aside className="sidebar" id="portal-sidebar" aria-label="Portal navigation">
        <div className="sidebar__brand">
          <Brand light={mode === 'dark' || sidebarStyle.dark} />
        </div>

        <nav className="sidebar__nav">
          {nav.map((section) => {
            const { items } = section;
            if (!items.length) return null;
            return (
              <div key={section.heading} className="sidebar__section">
                <p className="sidebar__heading">{section.heading}</p>
                {items.map((item) =>
                  item.external ? (
                    <Link key={item.to} to={item.to} className="sidebar__link" title={tip(item.label)}>
                      <i className={`fas ${item.icon}`} aria-hidden="true" />
                      <span className="sidebar__label">{item.label}</span>
                      <i className="fas fa-arrow-up-right-from-square sidebar__ext" aria-hidden="true" />
                    </Link>
                  ) : (
                    <NavLink key={item.to} to={item.to} end={item.end} className="sidebar__link" title={tip(item.label)}>
                      <i className={`fas ${item.icon}`} aria-hidden="true" />
                      <span className="sidebar__label">{item.label}</span>
                      {item.badge && counts[item.badge] > 0 && (
                        <span className="sidebar__badge" aria-label={`${counts[item.badge]} waiting`}>{counts[item.badge]}</span>
                      )}
                    </NavLink>
                  ),
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      <button type="button" className="sidebar-backdrop" aria-label="Close menu" tabIndex={-1} onClick={() => setDrawerOpen(false)} />

      <div className="portal__body">
        <header className="topbar">
          <button
            type="button"
            className="topbar__menu"
            aria-label="Open menu"
            aria-controls="portal-sidebar"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
          >
            <i className="fas fa-bars" />
          </button>
          <button
            type="button"
            className="topbar__toggle"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-controls="portal-sidebar"
            aria-expanded={!collapsed}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => setPrefs({ collapsed: !collapsed })}
          >
            <i className={`fas ${collapsed ? 'fa-angles-right' : 'fa-angles-left'}`} />
          </button>
          <div className="topbar__brand">
            <Brand />
          </div>

          <QuickSearch links={links} />

          <div className="topbar__tools">
            <ThemeMenu prefs={prefs} onChange={setPrefs} />
            <MessagesMenu isAdmin={user?.role === 'ADMIN'} onCount={setMessageCount} />
            <NotificationBell waiting={waiting} />
            <UserMenu user={user} mode={mode} onMode={(m) => setPrefs({ mode: m })} onLogout={handleLogout} />
          </div>
        </header>

        <main className="portal__main">
          <div className="portal__head">
            <div>
              <h1>{title}</h1>
              {subtitle && <p className="muted">{subtitle}</p>}
            </div>
            {actions && <div className="portal__actions">{actions}</div>}
          </div>
          {children}
        </main>
      </div>
      <CallOverlay />
    </div>
  );
};

export default PortalLayout;

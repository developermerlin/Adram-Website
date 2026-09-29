import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { dashboardPathFor } from '../../config/roles';
import { site, telHref } from '../../config/site';
import { services } from '../../data/services';
import { useCourses } from '../../data/useCatalog';
import Brand from '../ui/Brand';
import BrandIcon from '../brand/BrandIcon';
import SocialLinks from '../ui/SocialLinks';

const NAV = [
  { to: '/', label: 'Home', end: true },
  {
    to: '/about',
    label: 'About',
    children: [
      { to: '/about', label: 'Company overview', icon: 'building' },
      { to: '/about#mission', label: 'Mission & vision', icon: 'innovation' },
      { to: '/about#values', label: 'Our values', icon: 'quality' },
    ],
  },
  {
    to: '/services',
    label: 'Services',
    children: services.map((s) => ({ to: `/services/${s.id}`, label: s.title, icon: s.brandIcon })),
    footer: { to: '/services', label: 'All services' },
  },
  {
    to: '/courses',
    label: 'Training',
    children: [], // training programmes, filled from the API in SiteHeader
    footer: { to: '/courses', label: 'All programmes' },
  },
  {
    to: '/scholarships',
    label: 'Scholarships',
    children: [
      { to: '/scholarships#finder', label: 'Find a scholarship', icon: 'award' },
      { to: '/scholarships#destinations', label: 'Study destinations', icon: 'globe' },
      { to: '/scholarships#support', label: 'How we help', icon: 'support' },
      { to: '/scholarships#requirements', label: 'Documents & FAQs', icon: 'certificate' },
    ],
    footer: { to: '/scholarships', label: 'All scholarships' },
  },
  { to: '/contact', label: 'Contact' },
];

// Thin bar above the menu with the details people look for first.
const InfoBar = () => (
  <div className="info-bar">
    <div className="container info-bar__inner">
      <ul className="info-bar__list">
        <li><i className="fas fa-location-dot" aria-hidden="true" /> {site.location}</li>
        <li><i className="far fa-clock" aria-hidden="true" /> {site.hours[0].short}: {site.hours[0].time}</li>
      </ul>
      <ul className="info-bar__list">
        <li>
          <a href={telHref(site.phones[0])}><i className="fas fa-phone" aria-hidden="true" /> {site.phones[0]}</a>
        </li>
        <li>
          <a href={`mailto:${site.email}`}><i className="fas fa-envelope" aria-hidden="true" /> {site.email}</a>
        </li>
        <li className="info-bar__socials">
          <SocialLinks size="sm" />
        </li>
      </ul>
    </div>
  </div>
);

// Sign in: an arrow going in through a door.
const SignInIcon = () => (
  <svg className="auth-btn__svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
    <path d="M3 12h11" />
    <path d="m10 8 4 4-4 4" />
  </svg>
);

// Sign up: a person with a plus beside them.
const SignUpIcon = () => (
  <svg className="auth-btn__svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
    <path d="M19 8v6" />
    <path d="M16 11h6" />
  </svg>
);

// One desktop menu item. The dropdown is controlled by state (not CSS :hover), so choosing an item closes it.
const NavItem = ({ item, open, onOpen, onClose }) => {
  const ref = useRef(null);

  if (!item.children) {
    return (
      <div className="nav__item">
        <NavLink to={item.to} end={item.end} className="nav__link" onClick={onClose}>
          {item.label}
        </NavLink>
      </div>
    );
  }

  const choose = () => {
    onClose();
    // Move focus off the menu so it doesn't look "stuck" open for keyboard users either.
    document.activeElement?.blur();
  };

  return (
    <div
      ref={ref}
      className={`nav__item has-menu${open ? ' is-open' : ''}`}
      onMouseEnter={onOpen}
      onMouseLeave={onClose}
      onBlur={(e) => !ref.current?.contains(e.relatedTarget) && onClose()}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <NavLink to={item.to} end={item.end} className="nav__link" onClick={choose}>
        {item.label}
      </NavLink>
      <button
        type="button"
        className="nav__caret"
        aria-expanded={open}
        aria-label={`${item.label} menu`}
        onClick={() => (open ? onClose() : onOpen())}
      >
        <i className="fas fa-chevron-down" aria-hidden="true" />
      </button>
      <div className="nav__dropdown" role="menu">
        {item.children.map((child) => (
          <Link key={child.to} to={child.to} role="menuitem" onClick={choose}>
            <BrandIcon name={child.icon} size={18} />
            <span>{child.label}</span>
          </Link>
        ))}
        {item.footer && (
          <Link to={item.footer.to} role="menuitem" className="nav__dropdown-footer" onClick={choose}>
            {item.footer.label} <i className="fas fa-arrow-right" aria-hidden="true" />
          </Link>
        )}
      </div>
    </div>
  );
};

export const SiteHeader = () => {
  const { isAuthenticated, user } = useAuth();
  const { pathname, hash } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [openItem, setOpenItem] = useState(null);
  const { data: courses } = useCourses();
  const nav = NAV.map((item) =>
    item.to === '/courses' ? { ...item, children: (courses || []).map((p) => ({ to: `/courses#${p.slug}`, label: p.title, icon: p.icon })) } : item,
  );
  const [expanded, setExpanded] = useState(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close every menu whenever the route (or #section) changes.
  const [lastLocation, setLastLocation] = useState(pathname + hash);
  if (lastLocation !== pathname + hash) {
    setLastLocation(pathname + hash);
    setMenuOpen(false);
    setOpenItem(null);
  }

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  const accountActions = isAuthenticated ? (
    <Link to={dashboardPathFor(user?.role)} className="btn btn--primary btn--sm">
      <i className="fas fa-gauge" /> My dashboard
    </Link>
  ) : (
    // Pill buttons: the icon sits in a round chip beside the words. An arrow going in through a door (sign in)
    // and a person with a plus (sign up).
    <>
      <Link to="/login" className="auth-btn">
        <span className="auth-btn__chip"><SignInIcon /></span>
        <span className="auth-btn__label">Sign in</span>
      </Link>
      <Link to="/register" className="auth-btn auth-btn--primary">
        <span className="auth-btn__chip"><SignUpIcon /></span>
        <span className="auth-btn__label">Sign up</span>
      </Link>
    </>
  );

  return (
    <>
      <InfoBar />
      <header className={`site-header${scrolled ? ' is-scrolled' : ''}`}>
        <div className="container site-header__inner">
          <Brand />

          <nav className="nav" aria-label="Main">
            {nav.map((item) => (
              <NavItem
                key={item.to}
                item={item}
                open={openItem === item.to}
                onOpen={() => setOpenItem(item.to)}
                onClose={() => setOpenItem(null)}
              />
            ))}
          </nav>

          <div className="header-actions">{accountActions}</div>

          <button
            type="button"
            className="menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <i className={menuOpen ? 'fas fa-xmark' : 'fas fa-bars'} />
          </button>
        </div>

      </header>

      {/* Outside <header>: its backdrop-filter would trap this fixed panel inside the header box. */}
      <nav id="mobile-nav" className={`mobile-nav${menuOpen ? ' is-open' : ''}`} aria-label="Mobile">
        {nav.map((item) => (
          <div key={item.to} className="mobile-nav__group">
            <div className="mobile-nav__row">
              <NavLink to={item.to} end={item.end} className="mobile-nav__link" onClick={() => setMenuOpen(false)}>
                {item.label}
              </NavLink>
              {item.children && (
                <button
                  type="button"
                  className={`mobile-nav__toggle${expanded === item.to ? ' is-open' : ''}`}
                  aria-expanded={expanded === item.to}
                  aria-label={`Show ${item.label} links`}
                  onClick={() => setExpanded((cur) => (cur === item.to ? null : item.to))}
                >
                  <i className="fas fa-chevron-down" />
                </button>
              )}
            </div>
            {item.children && expanded === item.to && (
              <div className="mobile-nav__sub">
                {item.children.map((child) => (
                  <Link key={child.to} to={child.to} onClick={() => setMenuOpen(false)}>
                    <BrandIcon name={child.icon} size={18} /> {child.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
        <div className="mobile-nav__actions">{accountActions}</div>
        <div className="mobile-nav__contact">
          <a href={telHref(site.phones[0])}><i className="fas fa-phone" /> {site.phones[0]}</a>
          <a href={`mailto:${site.email}`}><i className="fas fa-envelope" /> {site.email}</a>
        </div>
      </nav>
    </>
  );
};

export default SiteHeader;

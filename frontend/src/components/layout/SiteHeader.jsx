import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { dashboardPathFor } from '../../config/roles';
import { telHref } from '../../config/site';
import { fill } from '../../content/merge';
import { usePageContent, useSite } from '../../content/useContent';
import { useServices } from '../../content/useServices';
import { useCourses } from '../../data/useCatalog';
import Brand from '../ui/Brand';
import BrandIcon from '../brand/BrandIcon';
import SocialLinks from '../ui/SocialLinks';
import NotificationBell from '../lms/NotificationBell';
import { useCartCount } from '../lms/cartStore';
import '../../styles/marketplace.css';

// The menu labels, dropdown links and how many items each dropdown lists come from the editable "navigation" content.
const buildNav = (n, services, courses, blog, partners) => {
  const limit = n.limits.dropdown;
  const mf = n.menuFooters;
  const count = (list, few, many) => (list && list.length > limit ? fill(many, { count: list.length }) : few);
  return [
    { to: '/', label: n.labels.home, end: true },
    { to: '/about', label: n.labels.about, children: n.aboutMenu.map((m) => ({ to: m.link, label: m.label, icon: m.icon })) },
    {
      to: '/services',
      label: n.labels.services,
      also: ['/learning'], // the Learning hub lives in this menu, so Services stays highlighted there
      children: [
        ...services.slice(0, limit).map((sv) => ({ to: `/services/${sv.id}`, label: sv.title, icon: sv.brandIcon })),
        { to: '/learning', label: n.labels.learningInServices || 'Learning hub: free notes', icon: 'graduate' },
      ],
      footer: { to: '/services', label: count(services, mf.services, mf.servicesMany) },
    },
    {
      to: '/courses',
      label: n.labels.training,
      children: (courses || []).slice(0, limit).map((p) => ({ to: `/courses/${p.slug}`, label: p.title, icon: p.icon })),
      footer: { to: '/courses', label: count(courses, mf.training, mf.trainingMany) },
    },
    {
      to: '/scholarships',
      label: n.labels.scholarships,
      children: n.scholarshipsMenu.map((m) => ({ to: m.link, label: m.label, icon: m.icon })),
      footer: { to: '/scholarships', label: mf.scholarships },
    },
    ...(partners?.showInMenu ? [{ to: '/partners', label: partners.hero.eyebrow || 'Partners' }] : []),
    ...(blog?.showInMenu ? [{ to: '/blog', label: blog.labels.menu }] : []),
    { to: '/contact', label: n.labels.contact },
  ];
};

// Thin bar above the menu with the details people look for first.
const InfoBar = () => {
  const site = useSite();
  return (
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
};

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
const linkClass = (base, item, pathname) => ({ isActive }) => (
  `${base}${isActive || item.also?.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ? ' active' : ''}`
);

const NavItem = ({ item, open, onOpen, onClose }) => {
  const { pathname } = useLocation();
  const ref = useRef(null);

  if (!item.children) {
    return (
      <div className="nav__item">
        <NavLink to={item.to} end={item.end} className={linkClass('nav__link', item, pathname)} onClick={onClose}>
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
      <NavLink to={item.to} end={item.end} className={linkClass('nav__link', item, pathname)} onClick={choose}>
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
  const site = useSite();
  const { isAuthenticated, user } = useAuth();
  const { pathname, hash } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [openItem, setOpenItem] = useState(null);
  const { data: courses } = useCourses();
  const { services } = useServices();
  const navContent = usePageContent('navigation');
  const blogContent = usePageContent('blog'); // "Blog" in the menu: Site content → Blog page → Menu
  const partnersContent = usePageContent('partners');
  const nav = buildNav(navContent, services, courses, blogContent, partnersContent);
  const [expanded, setExpanded] = useState(null);
  const [scrolled, setScrolled] = useState(false);
  const cartCount = useCartCount();

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

  const toggleRef = useRef(null);
  const panelRef = useRef(null);
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    document.body.classList.toggle('menu-open', menuOpen);
    if (!menuOpen) return undefined;
    // Keyboard: focus the first link once the panel has slid in; Escape closes and returns focus to the button.
    const focusTimer = setTimeout(() => panelRef.current?.querySelector('a, button')?.focus({ preventScroll: true }), 120);
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        toggleRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      document.body.classList.remove('menu-open');
    };
  }, [menuOpen]);

  // Cart and notifications stay in the bar on every screen size (beside the menu button on phones)
  const quick = isAuthenticated && (
    <div className="header-quick">
      {user?.role === 'STUDENT' && (
        <Link to="/cart" className="header-icon" aria-label={cartCount ? `Cart, ${cartCount} courses` : 'Cart'} title="Cart">
          <i className="fas fa-cart-shopping" aria-hidden="true" />
          {cartCount > 0 && <span className="header-icon__count">{cartCount}</span>}
        </Link>
      )}
      <NotificationBell className="header-bell" buttonClass="header-icon" />
    </div>
  );

  const accountActions = isAuthenticated ? (
    <Link to={dashboardPathFor(user?.role)} className="btn btn--primary btn--sm">
      <i className="fas fa-gauge" /> {navContent.labels.dashboard}
    </Link>
  ) : (
    // Pill buttons: the icon sits in a round chip beside the words. An arrow going in through a door (sign in)
    // and a person with a plus (sign up).
    <>
      <Link to="/login" className="auth-btn">
        <span className="auth-btn__chip"><SignInIcon /></span>
        <span className="auth-btn__label">{navContent.labels.signIn}</span>
      </Link>
      <Link to="/register" className="auth-btn auth-btn--primary">
        <span className="auth-btn__chip"><SignUpIcon /></span>
        <span className="auth-btn__label">{navContent.labels.signUp}</span>
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

          {quick}
          <div className="header-actions">{accountActions}</div>

          <button
            ref={toggleRef}
            type="button"
            className={`menu-toggle${menuOpen ? ' is-open' : ''}`}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {/* three lines that turn into a cross */}
            <span className="menu-toggle__bars" aria-hidden="true"><span /><span /><span /></span>
          </button>
        </div>

      </header>

      {/* Outside <header>: its backdrop-filter would trap this fixed panel inside the header box. */}
      <div className={`mobile-nav__backdrop${menuOpen ? ' is-open' : ''}`} aria-hidden="true" onClick={() => setMenuOpen(false)} />
      <nav id="mobile-nav" ref={panelRef} className={`mobile-nav${menuOpen ? ' is-open' : ''}`} aria-label="Mobile" inert={!menuOpen}>
        {nav.map((item, index) => (
          <div key={item.to} className="mobile-nav__group" style={{ '--i': index }}>
            <div className="mobile-nav__row">
              <NavLink to={item.to} end={item.end} className={linkClass('mobile-nav__link', item, pathname)} onClick={() => setMenuOpen(false)}>
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
            {item.children && (
              <div className={`mobile-nav__sub${expanded === item.to ? ' is-open' : ''}`} inert={expanded !== item.to}>
                <div className="mobile-nav__sub-inner">
                  {item.children.map((child) => (
                    <Link key={child.to} to={child.to} onClick={() => setMenuOpen(false)}>
                      <span className="mobile-nav__icon"><BrandIcon name={child.icon} size={17} /></span>
                      <span>{child.label}</span>
                    </Link>
                  ))}
                  {item.footer && (
                    <Link to={item.footer.to} className="mobile-nav__all" onClick={() => setMenuOpen(false)}>
                      {item.footer.label} <i className="fas fa-arrow-right" aria-hidden="true" />
                    </Link>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
        <div className="mobile-nav__foot" style={{ '--i': nav.length }}>
          <div className="mobile-nav__actions">{accountActions}</div>
          <div className="mobile-nav__contact">
            <a href={telHref(site.phones[0])}><i className="fas fa-phone" aria-hidden="true" /> {site.phones[0]}</a>
            <a href={`mailto:${site.email}`}><i className="fas fa-envelope" aria-hidden="true" /> {site.email}</a>
          </div>
        </div>
      </nav>
    </>
  );
};

export default SiteHeader;

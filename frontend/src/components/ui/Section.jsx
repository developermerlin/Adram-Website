import { Link } from 'react-router-dom';
import BrandIcon from '../brand/BrandIcon';

export const SectionHeading = ({ eyebrow, title, children, center = false }) => (
  <div className={`section-heading${center ? ' section-heading--center' : ''}`}>
    {eyebrow && <span className="eyebrow">{eyebrow}</span>}
    <h2>{title}</h2>
    {children && <p>{children}</p>}
  </div>
);

// Inner-page header. Pass an illustration as `art` to show it beside the title on wide screens.
// `crumbs` ([{ to, label }]) gives a deeper breadcrumb; the last one is the current page.
// `background` (optional): a photo shown darkened behind the whole hero.
export const PageHero = ({ eyebrow, title, children, art, crumbs, actions, background }) => (
  <section
    className={`page-hero${art ? ' page-hero--art' : ''}${background ? ' page-hero--photo' : ''}`}
    style={background ? { '--hero-photo': `url("${background}")` } : undefined}
  >
    <div className="container page-hero__inner">
      <div className="page-hero__copy">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to="/">Home</Link>
          {(crumbs || [{ label: eyebrow }]).map((c) => (
            <span key={c.label} className="breadcrumb__item">
              <span aria-hidden="true">/</span>
              {c.to ? <Link to={c.to}>{c.label}</Link> : <span>{c.label}</span>}
            </span>
          ))}
        </nav>
        <h1>{title}</h1>
        {children && <p>{children}</p>}
        {actions && <div className="page-hero__actions">{actions}</div>}
      </div>
      {art && <div className="page-hero__art">{art}</div>}
    </div>
  </section>
);

// Brand icon on a soft tile; `tone="dark"` for navy sections.
export const IconTile = ({ name, tone }) => (
  <span className={`icon-tile${tone ? ` icon-tile--${tone}` : ''}`}>
    <BrandIcon name={name} size={28} />
  </span>
);

export const CtaBand = ({
  title = 'Have a project in mind?',
  text = 'Tell us what you need. We’ll get back to you within one working day with next steps.',
  to = '/contact',
}) => (
  <section className="section">
    <div className="container">
      <div className="cta-band">
        <div style={{ position: 'relative' }}>
          <h2>{title}</h2>
          <p>{text}</p>
        </div>
        <div className="cta-band__actions">
          <Link to={to} className="btn btn--primary">
            <i className="fas fa-envelope" /> Contact us
          </Link>
          <a href="https://wa.me/23276978720" target="_blank" rel="noopener noreferrer" className="btn btn--ghost-light">
            <i className="fab fa-whatsapp" /> WhatsApp
          </a>
        </div>
      </div>
    </div>
  </section>
);

export const Spinner = ({ label = 'Loading…' }) => (
  <div className="spinner-screen" role="status">
    <div>
      <div className="spinner" />
      <p>{label}</p>
    </div>
  </div>
);

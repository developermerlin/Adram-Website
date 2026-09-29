import { Link } from 'react-router-dom';
import { site, telHref, whatsappHref } from '../../config/site';
import Brand from '../ui/Brand';
import SocialLinks from '../ui/SocialLinks';
import { IconTile } from '../ui/Section';
import '../../styles/portal.css';

// Split screen used by sign in, sign up and password reset.
// `panel` sets the left-hand story for each page: { eyebrow, heading, text, points: [{ icon, title, text }] }.
// `switchTo` is the top-right shortcut to the other auth page: { text, to, label }.
export const AuthLayout = ({ title, subtitle, children, footer, panel, switchTo, wide = false }) => (
  <div className="auth">
    <aside className="auth__panel">
      <div className="auth__panel-top">
        <Brand light />
        <Link to="/" className="auth__back">
          <i className="fas fa-arrow-left" /> Back to website
        </Link>
      </div>

      {panel && (
        <div className="auth__panel-copy">
          <span className="auth__eyebrow">{panel.eyebrow}</span>
          <h2>{panel.heading}</h2>
          <p>{panel.text}</p>
          <ul className="auth__features">
            {panel.points.map((p) => (
              <li key={p.title}>
                <IconTile name={p.icon} tone="glow" />
                <div>
                  <strong>{p.title}</strong>
                  <span>{p.text}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="auth__help">
        <p className="auth__help-title">
          <i className="fas fa-headset" /> Need help with your account?
        </p>
        <div className="auth__help-links">
          <a href={telHref(site.phones[0])}><i className="fas fa-phone" /> {site.phones[0]}</a>
          <a href={whatsappHref} target="_blank" rel="noopener noreferrer"><i className="fab fa-whatsapp" /> WhatsApp</a>
          <a href={`mailto:${site.email}`}><i className="fas fa-envelope" /> Email us</a>
        </div>
        <SocialLinks size="sm" />
      </div>
    </aside>

    <main className="auth__main">
      <div className="auth__topbar">
        <div className="auth__mobile-brand">
          <Brand />
        </div>
        {switchTo && (
          <p className="auth__switch">
            {switchTo.text} <Link to={switchTo.to}>{switchTo.label}</Link>
          </p>
        )}
      </div>

      <div className={`auth__card${wide ? ' auth__card--wide' : ''}`}>
        <h1>{title}</h1>
        {subtitle && <p className="auth__subtitle">{subtitle}</p>}
        {children}
      </div>
      {footer && <div className="auth__footer">{footer}</div>}

      {/* The side panel is hidden on phones, so keep the help contacts reachable */}
      <div className="auth__mobile-help">
        <span>Need help?</span>
        <a href={telHref(site.phones[0])}><i className="fas fa-phone" /> Call</a>
        <a href={whatsappHref} target="_blank" rel="noopener noreferrer"><i className="fab fa-whatsapp" /> WhatsApp</a>
        <a href={`mailto:${site.email}`}><i className="fas fa-envelope" /> Email</a>
      </div>

      <p className="auth__legal">
        <i className="fas fa-lock" /> Secure sign-in · Your details are only used for your ADRAM account ·{' '}
        <Link to="/contact">Contact support</Link>
      </p>
    </main>
  </div>
);

export default AuthLayout;

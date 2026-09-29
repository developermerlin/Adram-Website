import { Link } from 'react-router-dom';
import { site, telHref } from '../../config/site';
import { services } from '../../data/services';
import Brand from '../ui/Brand';
import SocialLinks from '../ui/SocialLinks';

const company = [
  { to: '/about', label: 'About us' },
  { to: '/about#mission', label: 'Mission & vision' },
  { to: '/services', label: 'Our services' },
  { to: '/contact', label: 'Contact us' },
  { to: '/about#values', label: 'Our values' },
];

const students = [
  { to: '/courses', label: 'Training programmes' },
  { to: '/scholarships', label: 'Scholarships' },
  { to: '/scholarships#process', label: 'How to apply' },
  { to: '/register', label: 'Create an account' },
  { to: '/login', label: 'Student portal' },
];

const FooterLinks = ({ title, links }) => (
  <div className="footer-col">
    <h4>{title}</h4>
    <ul>
      {links.map((l) => (
        <li key={l.to + l.label}>
          <Link to={l.to}>{l.label}</Link>
        </li>
      ))}
    </ul>
  </div>
);

export const SiteFooter = () => (
  <footer className="site-footer">
    <div className="container">
      <div className="site-footer__grid">
        <div className="site-footer__about">
          <Brand light />
          <p>
            An IT company in {site.location} delivering software, networks and digital systems, plus practical tech
            training and scholarship guidance.
          </p>
          <SocialLinks />
        </div>

        <FooterLinks title="Services" links={services.map((s) => ({ to: `/services/${s.id}`, label: s.title }))} />
        <FooterLinks title="Company" links={company} />
        <FooterLinks title="Students" links={students} />

        <div className="footer-col footer-col--contact">
          <h4>Contact</h4>
          <ul>
            <li className="contact-line">
              <i className="fas fa-location-dot" />
              <span>{site.location}</span>
            </li>
            {site.phones.map((phone) => (
              <li key={phone} className="contact-line">
                <i className="fas fa-phone" />
                <a href={telHref(phone)}>{phone}</a>
              </li>
            ))}
            <li className="contact-line">
              <i className="fas fa-envelope" />
              <a href={`mailto:${site.email}`}>{site.email}</a>
            </li>
            <li className="contact-line">
              <i className="far fa-clock" />
              <span>
                {site.hours.slice(0, 2).map((h) => (
                  <span key={h.days} className="d-block">{h.short}: {h.time}</span>
                ))}
              </span>
            </li>
          </ul>
        </div>
      </div>

      <div className="site-footer__bottom">
        <span>© {new Date().getFullYear()} {site.name}. All rights reserved.</span>
        <nav className="site-footer__legal" aria-label="Footer">
          <Link to="/about">About</Link>
          <Link to="/services">Services</Link>
          <Link to="/contact">Contact</Link>
          <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            Back to top <i className="fas fa-arrow-up" />
          </button>
        </nav>
      </div>
    </div>
  </footer>
);

export default SiteFooter;

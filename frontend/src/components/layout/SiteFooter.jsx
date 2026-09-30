import SmartLink from '../ui/SmartLink';
import { telHref } from '../../config/site';
import { fill } from '../../content/merge';
import { usePageContent, useSite } from '../../content/useContent';
import { useServices } from '../../content/useServices';
import Brand from '../ui/Brand';
import SocialLinks from '../ui/SocialLinks';

// The footer lists only the first few services, then a plain link to the full list.
// `more` (optional): { to, label } adds a "view all" link after the list.
const FooterLinks = ({ title, links, more }) => (
  <div className="footer-col">
    <h4>{title}</h4>
    <ul>
      {links.map((l) => (
        <li key={l.to + l.label}>
          <SmartLink to={l.to}>{l.label}</SmartLink>
        </li>
      ))}
      {more && (
        <li>
          <SmartLink to={more.to} className="footer-col__more">
            {more.label} <i className="fas fa-arrow-right" aria-hidden="true" />
          </SmartLink>
        </li>
      )}
    </ul>
  </div>
);

export const SiteFooter = () => {
  const site = useSite();
  const { services } = useServices();
  const { footerBlurb } = usePageContent('site');
  const { footer: f, limits } = usePageContent('navigation');
  const toLinks = (list) => list.map((l) => ({ to: l.link, label: l.label }));
  return (
  <footer className="site-footer">
    <div className="container">
      <div className="site-footer__grid">
        <div className="site-footer__about">
          <Brand light />
          <p>{fill(footerBlurb, site)}</p>
          <SocialLinks />
        </div>

        <FooterLinks
          title={f.servicesTitle}
          links={services.slice(0, limits.footerServices).map((s) => ({ to: `/services/${s.id}`, label: s.title }))}
          more={{ to: '/services', label: f.servicesMore }}
        />
        <FooterLinks title={f.companyTitle} links={toLinks(f.company)} />
        <FooterLinks title={f.studentsTitle} links={toLinks(f.students)} />

        <div className="footer-col footer-col--contact">
          <h4>{f.contactTitle}</h4>
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
        <span>© {new Date().getFullYear()} {site.name}. {f.rights}</span>
        <nav className="site-footer__legal" aria-label="Footer">
          {f.bottomLinks.map((l) => (
            <SmartLink key={l.link + l.label} to={l.link}>{l.label}</SmartLink>
          ))}
          <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            {f.backToTop} <i className="fas fa-arrow-up" />
          </button>
        </nav>
      </div>
    </div>
  </footer>
  );
};

export default SiteFooter;

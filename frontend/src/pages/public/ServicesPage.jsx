import { Link } from 'react-router-dom';
import { services } from '../../data/services';
import { serviceDetails } from '../../data/serviceDetails';
import { site, telHref } from '../../config/site';
import { CtaBand, IconTile, PageHero } from '../../components/ui/Section';
import { ServiceArt } from '../../components/brand/Illustrations';
import BrandIcon from '../../components/brand/BrandIcon';
import '../../styles/pages.css';

// Photo behind the top of the page (web-sized, from public/transform)
const HERO_PHOTO = '/transform/transform-hero.jpg';

export const ServicesPage = () => (
  <>
    <PageHero
      eyebrow="Services"
      title="IT services for organisations that want to do more"
      background={HERO_PHOTO}
      actions={
        <>
          <Link to="/contact?subject=Help%20choosing%20a%20service" className="btn btn--primary">
            <i className="fas fa-envelope" /> Get a free consultation
          </Link>
          <a href={telHref(site.phones[0])} className="btn btn--ghost-light">
            <i className="fas fa-phone" /> Call us
          </a>
        </>
      }
    >
      {services.length} practice areas, one team. Choose a single service or let us handle the whole journey from plan to support.
    </PageHero>

    <nav className="service-nav" aria-label="Jump to a service">
      <div className="container service-nav__inner">
        {services.map((s) => (
          <a key={s.id} href={`#${s.id}`}>
            <BrandIcon name={s.brandIcon} size={20} /> {s.title}
          </a>
        ))}
      </div>
    </nav>

    <section className="section">
      <div className="container stack-xl">
        {services.map((s, i) => (
          <article key={s.id} id={s.id} className={`spotlight${i % 2 ? ' spotlight--reverse' : ''}`}>
            {s.image ? (
              <Link to={`/services/${s.id}`} className="spotlight__photo" aria-label={`${s.title}: view full details`}>
                <img src={s.image} alt="" loading="lazy" width="1100" height="688" />
                <span className="spotlight__badge">
                  <BrandIcon name={s.brandIcon} size={22} />
                  <span>{String(i + 1).padStart(2, '0')}</span>
                </span>
              </Link>
            ) : (
              <div className="art-frame">
                <ServiceArt id={s.id} label={s.title} />
              </div>
            )}
            <div className="spotlight__copy">
              <div className="spotlight__label">
                <IconTile name={s.brandIcon} />
                <span className="spotlight__num">{String(i + 1).padStart(2, '0')}</span>
              </div>
              <h2>{s.title}</h2>
              {serviceDetails[s.id]?.tagline && <p className="spotlight__tagline">{serviceDetails[s.id].tagline}</p>}
              <p className="lead">{s.summary}</p>
              <h4 className="spotlight__subhead">What’s included</h4>
              <ul className="check-list check-list--2col">
                {s.includes.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <div className="spotlight__actions">
                <Link to={`/services/${s.id}`} className="btn btn--primary">
                  <i className="fas fa-circle-info" /> View full details
                </Link>
                <Link to={`/contact?subject=${encodeURIComponent(`${s.title} enquiry`)}`} className="btn btn--outline">
                  <i className="fas fa-envelope" /> Contact us
                </Link>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>

    <CtaBand title="Not sure which service you need?" text="Describe the problem you’re trying to solve and we’ll recommend the right approach, free of charge." />
  </>
);

export default ServicesPage;

import { Link } from 'react-router-dom';
import { telHref } from '../../config/site';
import { fill } from '../../content/merge';
import { useSite } from '../../content/useContent';
import { useServices } from '../../content/useServices';
import { CtaBand, IconTile, PageHero } from '../../components/ui/Section';
import { ServiceArt } from '../../components/brand/Illustrations';
import BrandIcon from '../../components/brand/BrandIcon';
import { LearningBand } from '../../components/learning/LearningBand';
import { assetUrl } from '../../utils/assets';
import '../../styles/pages.css';

// The header, every service card and the wording come from the editable "services" content.
export const ServicesPage = () => {
  const site = useSite();
  const { services, details, content: c } = useServices();
  const t = (text) => fill(text, { ...site, count: services.length });

  return (
    <>
      <PageHero
        eyebrow={c.hero.eyebrow}
        title={c.hero.title}
        background={c.hero.image || undefined}
        actions={
          <>
            {c.hero.primaryLabel && (
              <Link to="/contact?subject=Help%20choosing%20a%20service" className="btn btn--primary">
                <i className="fas fa-envelope" /> {c.hero.primaryLabel}
              </Link>
            )}
            {c.hero.secondaryLabel && (
              <a href={telHref(site.phones[0])} className="btn btn--ghost-light">
                <i className="fas fa-phone" /> {c.hero.secondaryLabel}
              </a>
            )}
          </>
        }
      >
        {t(c.hero.lead)}
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
                <Link to={`/services/${s.id}`} className="spotlight__photo" aria-label={`${s.title}: ${c.labels.viewDetails}`}>
                  <img src={assetUrl(s.image)} alt="" loading="lazy" width="1100" height="688" />
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
                {details[s.id]?.tagline && <p className="spotlight__tagline">{details[s.id].tagline}</p>}
                <p className="lead">{s.summary}</p>
                {s.includes.length > 0 && (
                  <>
                    <h4 className="spotlight__subhead">{c.labels.included}</h4>
                    <ul className="check-list check-list--2col">
                      {s.includes.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </>
                )}
                <div className="spotlight__actions">
                  <Link to={`/services/${s.id}`} className="btn btn--primary">
                    <i className="fas fa-circle-info" /> {c.labels.viewDetails}
                  </Link>
                  <Link to={`/contact?subject=${encodeURIComponent(`${s.title} enquiry`)}`} className="btn btn--outline">
                    <i className="fas fa-envelope" /> {c.labels.contact}
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <LearningBand />

      <CtaBand title={c.cta.title} text={c.cta.text} />
    </>
  );
};

export default ServicesPage;

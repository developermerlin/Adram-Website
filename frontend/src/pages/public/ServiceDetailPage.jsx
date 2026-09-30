import { Link, useParams } from 'react-router-dom';
import { telHref } from '../../config/site';
import { fill } from '../../content/merge';
import { useSite } from '../../content/useContent';
import { useServices } from '../../content/useServices';
import { CtaBand, IconTile, PageHero } from '../../components/ui/Section';
import { ServiceArt } from '../../components/brand/Illustrations';
import BrandIcon from '../../components/brand/BrandIcon';
import { assetUrl } from '../../utils/assets';
import { NotFoundPage } from './StatusPages';
import '../../styles/pages.css';

const contactLink = (service) => `/contact?subject=${encodeURIComponent(`${service.title} enquiry`)}`;

// A service's page: its text, photos, benefits, process, tools and FAQs all come from the editable "services" content.
export const ServiceDetailPage = () => {
  const site = useSite();
  const { serviceId } = useParams();
  const { services, details: allDetails, content: c } = useServices();
  const service = services.find((s) => s.id === serviceId);
  const details = allDetails[serviceId];

  if (!service || !details) return <NotFoundPage />;

  const L = c.labels;
  const t = (text) => fill(text, { ...site, service: service.title.toLowerCase() });
  const others = services.filter((s) => s.id !== service.id);
  const overview = details.overview || [];
  const idealFor = details.idealFor || [];
  const benefits = details.benefits || [];
  const process = details.process || [];
  const techStack = (details.techStack || []).filter((g) => g.items?.length);
  const faqs = details.faqs || [];
  // The logos shown on the overview photo's badge, in the order listed in the content
  const allTech = techStack.flatMap((g) => g.items);
  const featuredTech = (details.featuredTech || []).map((logo) => allTech.find((tool) => tool.logo === logo)).filter(Boolean);

  return (
    <>
      <PageHero
        title={service.title}
        crumbs={[{ to: '/services', label: 'Services' }, { label: service.title }]}
        background={service.heroImage || undefined}
        art={<div className="art-frame art-frame--dark"><ServiceArt id={service.id} label={service.title} /></div>}
        actions={
          <>
            <Link to={contactLink(service)} className="btn btn--primary">
              <i className="fas fa-envelope" /> {L.contactButton}
            </Link>
            <a href={telHref(site.phones[0])} className="btn btn--ghost-light">
              <i className="fas fa-phone" /> {L.callButton}
            </a>
          </>
        }
      >
        {details.tagline}
      </PageHero>

      <section className="section">
        <div className="container detail-layout">
          <div className="detail-main">
            {/* Overview */}
            <section className="detail-block">
              <span className="eyebrow">{L.overviewEyebrow}</span>
              <h2>{L.overview}</h2>
              {overview.map((p) => (
                <p key={p.slice(0, 24)} className="detail-lead">{p}</p>
              ))}
              {details.overviewImage && (
                <figure className="detail-photo">
                  <img src={assetUrl(details.overviewImage)} alt="" loading="lazy" />
                  {featuredTech.length > 0 && (
                    // A few of the tools we use, as a small glass badge on the photo
                    <figcaption className="detail-photo__badge">
                      <span className="detail-photo__logos">
                        {featuredTech.map((tool) => (
                          <img key={tool.logo} src={`/tech/${tool.logo}.svg`} alt="" title={tool.name} />
                        ))}
                      </span>
                      <span>
                        <strong>{L.badgeTitle}</strong>
                        <small>{L.badgeText}</small>
                      </span>
                    </figcaption>
                  )}
                </figure>
              )}
            </section>

            {/* Ideal for */}
            {idealFor.length > 0 && (
              <section className="detail-block">
                <h3 className="detail-title">{L.idealFor}</h3>
                <ul className="check-list check-list--2col">
                  {idealFor.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
            )}

            {/* Benefits */}
            {benefits.length > 0 && (
              <section className="detail-block">
                <h3 className="detail-title">{L.benefits}</h3>
                <div className="benefit-grid">
                  {benefits.map((b) => (
                    <div key={b.title} className="benefit">
                      <IconTile name={b.icon} />
                      <div>
                        <h4>{b.title}</h4>
                        <p>{b.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Included */}
            {service.includes.length > 0 && (
              <section className="detail-block">
                <h3 className="detail-title">{L.included}</h3>
                <div className="included-grid">
                  {service.includes.map((item) => (
                    <div key={item} className="included">
                      <i className="fas fa-circle-check" aria-hidden="true" />
                      {item}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Process */}
            {process.length > 0 && (
              <section className="detail-block">
                <h3 className="detail-title">{L.process}</h3>
                <ol className="timeline">
                  {process.map((step, i) => (
                    <li key={step.title}>
                      <span className="timeline__num">{i + 1}</span>
                      <div>
                        <h4>{step.title}</h4>
                        <p>{step.text}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {/* Technologies: grouped logos (Frontend, Backend, …) */}
            {techStack.length > 0 && (
              <section className="detail-block">
                <h3 className="detail-title">{L.tools}</h3>
                <div className="tech-stack">
                  {techStack.map((g) => (
                    <div key={g.group} className="tech-group">
                      <h4 className="tech-group__title">
                        <i className={`fas ${g.icon}`} aria-hidden="true" /> {g.group}
                        <span>{g.items.length}</span>
                      </h4>
                      <ul className="tech-grid">
                        {g.items.map((tool) => (
                          <li key={`${tool.logo}-${tool.name}`} className="tech-item">
                            <img src={`/tech/${tool.logo}.svg`} alt="" width="36" height="36" loading="lazy" />
                            <span>{tool.name}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* FAQs */}
            {faqs.length > 0 && (
              <section className="detail-block">
                <h3 className="detail-title">{L.faqs}</h3>
                <div className="faq">
                  {faqs.map((f, i) => (
                    <details key={f.q} open={i === 0}>
                      <summary>
                        {f.q}
                        <i className="fas fa-chevron-down" aria-hidden="true" />
                      </summary>
                      <p>{f.a}</p>
                    </details>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Sidebar */}
          <aside className="detail-aside">
            {others.length > 0 && (
              <div className="aside-card">
                <h3>{L.otherServices}</h3>
                <ul className="aside-links">
                  {others.map((s) => (
                    <li key={s.id}>
                      <Link to={`/services/${s.id}`}>
                        <BrandIcon name={s.brandIcon} size={20} />
                        <span>{s.title}</span>
                        <i className="fas fa-chevron-right" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div
              className={`aside-card aside-card--cta${details.asideImage ? ' aside-card--photo' : ''}`}
              style={details.asideImage ? { '--aside-photo': `url("${assetUrl(details.asideImage)}")` } : undefined}
            >
              <IconTile name={service.brandIcon} tone="glow" />
              <h3>{t(L.asideTitle)}</h3>
              <p>{L.asideText}</p>
              <Link to={contactLink(service)} className="btn btn--primary btn--block">
                <i className="fas fa-envelope" /> {c.labels.contact}
              </Link>
              <ul className="aside-contact">
                <li>
                  <i className="fas fa-phone" aria-hidden="true" />
                  <a href={telHref(site.phones[0])}>{site.phones[0]}</a>
                </li>
                {site.whatsappHref && (
                  <li>
                    <i className="fab fa-whatsapp" aria-hidden="true" />
                    <a href={site.whatsappHref} target="_blank" rel="noopener noreferrer">Chat on WhatsApp</a>
                  </li>
                )}
                <li>
                  <i className="fas fa-envelope" aria-hidden="true" />
                  <a href={`mailto:${site.email}`}>{site.email}</a>
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </section>

      <CtaBand title={t(L.bannerTitle)} text={L.bannerText} to={contactLink(service)} />
    </>
  );
};

export default ServiceDetailPage;

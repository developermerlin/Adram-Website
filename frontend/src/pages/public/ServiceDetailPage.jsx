import { Link, useParams } from 'react-router-dom';
import { services } from '../../data/services';
import { serviceDetails } from '../../data/serviceDetails';
import { site, telHref } from '../../config/site';
import { CtaBand, IconTile, PageHero } from '../../components/ui/Section';
import { ServiceArt } from '../../components/brand/Illustrations';
import BrandIcon from '../../components/brand/BrandIcon';
import { NotFoundPage } from './StatusPages';
import '../../styles/pages.css';

const contactLink =(service) => `/contact?subject=${encodeURIComponent(`${service.title} enquiry`)}`;

export const ServiceDetailPage = () => {
  const { serviceId } = useParams();
  const service = services.find((s) => s.id === serviceId);
  const details = serviceDetails[serviceId];

  if (!service || !details) return <NotFoundPage />;

  const others = services.filter((s) => s.id !== service.id);
  // The logos shown on the overview photo's badge, in the order listed in the data
  const allTech = (details.techStack || []).flatMap((g) => g.items);
  const featuredTech = (details.featuredTech || []).map((logo) => allTech.find(([, l]) => l === logo)).filter(Boolean);

  return (
    <>
      <PageHero
        title={service.title}
        crumbs={[{ to: '/services', label: 'Services' }, { label: service.title }]}
        background={service.heroImage}
        art={<div className="art-frame art-frame--dark"><ServiceArt id={service.id} label={service.title} /></div>}
        actions={
          <>
            <Link to={contactLink(service)} className="btn btn--primary">
              <i className="fas fa-envelope" /> Contact us about this service
            </Link>
            <a href={telHref(site.phones[0])} className="btn btn--ghost-light">
              <i className="fas fa-phone" /> Call us
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
              <span className="eyebrow">Overview</span>
              <h2>What we offer</h2>
              {details.overview.map((p) => (
                <p key={p.slice(0, 24)} className="detail-lead">{p}</p>
              ))}
              {details.overviewImage && (
                <figure className="detail-photo">
                  <img src={details.overviewImage} alt="" loading="lazy" />
                  {details.techStack && (
                    // A few of the tools we use, as a small glass badge on the photo
                    <figcaption className="detail-photo__badge">
                      <span className="detail-photo__logos">
                        {featuredTech.map(([name, logo]) => (
                          <img key={logo} src={`/tech/${logo}.svg`} alt="" title={name} />
                        ))}
                      </span>
                      <span>
                        <strong>Modern, proven technology</strong>
                        <small>Chosen to fit your project and budget</small>
                      </span>
                    </figcaption>
                  )}
                </figure>
              )}
            </section>

            {/* Ideal for */}
            <section className="detail-block">
              <h3 className="detail-title">Who it’s for</h3>
              <ul className="check-list check-list--2col">
                {details.idealFor.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>

            {/* Benefits */}
            <section className="detail-block">
              <h3 className="detail-title">Why it matters</h3>
              <div className="benefit-grid">
                {details.benefits.map((b) => (
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

            {/* Included */}
            <section className="detail-block">
              <h3 className="detail-title">What’s included</h3>
              <div className="included-grid">
                {service.includes.map((item) => (
                  <div key={item} className="included">
                    <i className="fas fa-circle-check" aria-hidden="true" />
                    {item}
                  </div>
                ))}
              </div>
            </section>

            {/* Process */}
            <section className="detail-block">
              <h3 className="detail-title">How we deliver it</h3>
              <ol className="timeline">
                {details.process.map((step, i) => (
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

            {/* Technologies */}
            <section className="detail-block">
              <h3 className="detail-title">Tools & technologies</h3>
              {details.techStack ? (
                // Grouped logos (Frontend, Backend, …)
                <div className="tech-stack">
                  {details.techStack.map((g) => (
                    <div key={g.group} className="tech-group">
                      <h4 className="tech-group__title">
                        <i className={`fas ${g.icon}`} aria-hidden="true" /> {g.group}
                        <span>{g.items.length}</span>
                      </h4>
                      <ul className="tech-grid">
                        {g.items.map(([name, logo]) => (
                          <li key={logo} className="tech-item">
                            <img src={`/tech/${logo}.svg`} alt="" width="36" height="36" loading="lazy" />
                            <span>{name}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="tech-tags">
                  {details.technologies.map((t) => (
                    <span key={t} className="tech-tag">{t}</span>
                  ))}
                </div>
              )}
            </section>

            {/* FAQs */}
            <section className="detail-block">
              <h3 className="detail-title">Frequently asked questions</h3>
              <div className="faq">
                {details.faqs.map((f, i) => (
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
          </div>

          {/* Sidebar */}
          <aside className="detail-aside">
            <div className="aside-card">
              <h3>Other services</h3>
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
            <div
              className={`aside-card aside-card--cta${details.asideImage ? ' aside-card--photo' : ''}`}
              style={details.asideImage ? { '--aside-photo': `url("${details.asideImage}")` } : undefined}
            >
              <IconTile name={service.brandIcon} tone="glow" />
              <h3>Interested in {service.title.toLowerCase()}?</h3>
              <p>Tell us about your project. The first consultation is free and we usually reply within one working day.</p>
              <Link to={contactLink(service)} className="btn btn--primary btn--block">
                <i className="fas fa-envelope" /> Contact us
              </Link>
              <ul className="aside-contact">
                <li>
                  <i className="fas fa-phone" aria-hidden="true" />
                  <a href={telHref(site.phones[0])}>{site.phones[0]}</a>
                </li>
                <li>
                  <i className="fab fa-whatsapp" aria-hidden="true" />
                  <a href="https://wa.me/23276978720" target="_blank" rel="noopener noreferrer">Chat on WhatsApp</a>
                </li>
                <li>
                  <i className="fas fa-envelope" aria-hidden="true" />
                  <a href={`mailto:${site.email}`}>{site.email}</a>
                </li>
              </ul>
            </div>

          </aside>
        </div>
      </section>

      <CtaBand
        title={`Ready to start your ${service.title.toLowerCase()} project?`}
        text="Share a few details and we’ll get back to you with next steps and a clear plan."
        to={contactLink(service)}
      />
    </>
  );
};

export default ServiceDetailPage;

import { Link } from 'react-router-dom';
import { useServices } from '../../content/useServices';
import { useCourses } from '../../data/useCatalog';
import { fill } from '../../content/merge';
import { usePageContent, useSite } from '../../content/useContent';
import { CtaBand, IconTile, SectionHeading } from '../../components/ui/Section';
import SmartLink from '../../components/ui/SmartLink';
import { AboutArt } from '../../components/brand/Illustrations';
import HeroBrand from '../../components/brand/HeroBrand';
import { assetUrl } from '../../utils/assets';
import '../../styles/landing.css';
import { VideoSection } from '../../components/ui/VideoSection';

// All wording, links and photos on this page come from the editable "home" content (see content/defaults.js).
export const LandingPage = () => {
  const { data: programs } = useCourses();
  const site = useSite();
  const { services } = useServices();
  const c = usePageContent('home');
  // {location}, {name} and {count} in the text are filled in automatically
  const t = (text, extra) => fill(text, { ...site, count: services.length, ...extra });

  // Only facts that are true today: counts come from the data; reply time is set in the content.
  const facts = [
    { value: services.length, label: c.about.serviceCountLabel },
    { value: programs ? programs.length : '—', label: c.about.trainingCountLabel },
    { value: c.about.replyValue, label: c.about.replyLabel },
  ];

  return (
    <>
      {/* ---------- Hero ---------- */}
      <section className="home-hero">
        <div className="container home-hero__inner">
          <div className="home-hero__copy">
            <span className="badge-line">
              <i className="fas fa-location-dot" aria-hidden="true" /> {t(c.hero.badge)}
            </span>
            <h1>
              {c.hero.titleStart} <span className="accent">{c.hero.titleAccent}</span>
            </h1>
            <p className="home-hero__lead">{t(c.hero.lead)}</p>
            <div className="home-hero__actions">
              {c.hero.primaryLabel && (
                <SmartLink to={c.hero.primaryLink} className="btn btn--primary btn--lg">
                  <i className="fas fa-paper-plane" /> {c.hero.primaryLabel}
                </SmartLink>
              )}
              {c.hero.secondaryLabel && (
                <SmartLink to={c.hero.secondaryLink} className="btn btn--outline btn--lg">
                  <i className="fas fa-grip" /> {c.hero.secondaryLabel}
                </SmartLink>
              )}
            </div>
            <ul className="home-hero__trust">
              {c.hero.trust.map((item) => (
                <li key={item}><i className="fas fa-circle-check" /> {item}</li>
              ))}
            </ul>
          </div>
          {/* The ADRAM logo scene: tilts towards the pointer and reacts on hover (see HeroBrand) */}
          <HeroBrand />
        </div>
      </section>

      {/* ---------- Highlights ---------- */}
      <section className="highlights">
        <div className="container highlights__grid">
          {c.highlights.map((h) => (
            <SmartLink key={h.title} to={h.link} className="highlight">
              <IconTile name={h.icon} />
              <div>
                <h3>{h.title}</h3>
                <p>{h.text}</p>
              </div>
              <i className="fas fa-chevron-right highlight__arrow" aria-hidden="true" />
            </SmartLink>
          ))}
        </div>
      </section>

      {/* ---------- Services ---------- */}
      <section className="section" id="services">
        <div className="container">
          <div className="section-head">
            <SectionHeading eyebrow={c.services.eyebrow} title={c.services.title}>
              {c.services.intro}
            </SectionHeading>
            <Link to="/services" className="btn btn--outline">
              <i className="fas fa-grip" /> {c.services.headerButton}
            </Link>
          </div>
          <div className="service-grid">
            {services.filter((s) => s.featured).map((s) =>
              s.image ? (
                // Services with a photo: the image on top, the icon overlapping its lower edge
                <Link key={s.id} to={`/services/${s.id}`} className="service-card service-card--media">
                  <span className="service-card__media">
                    <img src={assetUrl(s.image)} alt="" loading="lazy" width="1200" height="800" />
                  </span>
                  <span className="service-card__body">
                    <IconTile name={s.brandIcon} />
                    <h3>{s.title}</h3>
                    <p>{s.summary}</p>
                    <span className="service-card__more">
                      {c.services.cardButton} <i className="fas fa-arrow-right" />
                    </span>
                  </span>
                </Link>
              ) : (
                <Link key={s.id} to={`/services/${s.id}`} className="service-card">
                  <IconTile name={s.brandIcon} />
                  <h3>{s.title}</h3>
                  <p>{s.summary}</p>
                  <span className="service-card__more">
                    {c.services.cardButton} <i className="fas fa-arrow-right" />
                  </span>
                </Link>
              ),
            )}
            <SmartLink to={c.services.helpLink} className="service-card service-card--cta">
              <span className="service-card__cta-icon"><i className="fas fa-comments" /></span>
              <h3>{c.services.helpTitle}</h3>
              <p>{c.services.helpText}</p>
              <span className="service-card__more">
                {c.services.helpButton} <i className="fas fa-arrow-right" />
              </span>
            </SmartLink>
          </div>
          <div className="service-more">
            <Link to="/services" className="btn btn--primary btn--lg">
              {t(c.services.allButton)} <i className="fas fa-arrow-right" />
            </Link>
          </div>
        </div>
      </section>

      {/* ---------- About / why ---------- */}
      <section className="section section--surface">
        <div className="container about-split">
          <div className="art-frame about-split__art">
            <AboutArt />
          </div>
          <div>
            <span className="eyebrow">{c.about.eyebrow}</span>
            <h2>{c.about.title}</h2>
            <p className="muted">{t(c.about.text)}</p>
            <ul className="reason-list">
              {c.about.reasons.map((r) => (
                <li key={r.title}>
                  <IconTile name={r.icon} />
                  <div>
                    <h3>{r.title}</h3>
                    <p>{t(r.text)}</p>
                  </div>
                </li>
              ))}
            </ul>
            <dl className="facts">
              {facts.map((f) => (
                <div key={f.label}>
                  <dt>{f.label}</dt>
                  <dd>{f.value}</dd>
                </div>
              ))}
            </dl>
            {c.about.button && (
              <SmartLink to={c.about.buttonLink} className="btn btn--outline">
                <i className="fas fa-building" /> {c.about.button}
              </SmartLink>
            )}
          </div>
        </div>
      </section>

      <VideoSection video={c.video} />

      {/* ---------- Process ---------- */}
      <section className="section section--dark process">
        <div className="container">
          <SectionHeading eyebrow={c.process.eyebrow} title={c.process.title} center>
            {c.process.intro}
          </SectionHeading>
          <ol className="process__steps">
            {c.process.steps.map((step, i) => (
              <li key={step.title} className="process__step">
                <span className="process__num">0{i + 1}</span>
                <IconTile name={step.icon} tone="glow" />
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------- Sectors ---------- */}
      <section className="section">
        <div className="container">
          <SectionHeading eyebrow={c.sectors.eyebrow} title={c.sectors.title} center>
            {c.sectors.intro}
          </SectionHeading>
          <div className="sectors">
            {c.sectors.items.map((s) => (
              <div key={s.title} className="sector">
                <IconTile name={s.icon} />
                <div>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Training & scholarships ---------- */}
      <section className="section section--surface">
        <div className="container">
          <SectionHeading eyebrow={c.talent.eyebrow} title={c.talent.title} center>
            {c.talent.intro}
          </SectionHeading>
          <div className="talent-grid">
            <article className="talent-card">
              <div className="talent-card__photo">
                <img src={assetUrl(c.talent.training.image)} alt="" loading="lazy" width="1100" height="688" />
                {c.talent.training.tag && (
                  <span className="talent-card__tag">
                    <i className="fas fa-laptop-code" aria-hidden="true" /> {t(c.talent.training.tag, { count: programs ? programs.length : '' })}
                  </span>
                )}
              </div>
              <div className="talent-card__body">
                <span className="eyebrow">{c.talent.training.eyebrow}</span>
                <h3>{c.talent.training.title}</h3>
                <p>{c.talent.training.text}</p>
                <SmartLink to={c.talent.training.link} className="btn btn--primary btn--sm">
                  <i className="fas fa-laptop-code" /> {c.talent.training.button}
                </SmartLink>
              </div>
            </article>
            <article className="talent-card">
              <div className="talent-card__photo">
                <img src={assetUrl(c.talent.scholarships.image)} alt="" loading="lazy" width="1100" height="688" />
                {c.talent.scholarships.tag && (
                  <span className="talent-card__tag">
                    <i className="fas fa-graduation-cap" aria-hidden="true" /> {c.talent.scholarships.tag}
                  </span>
                )}
              </div>
              <div className="talent-card__body">
                <span className="eyebrow">{c.talent.scholarships.eyebrow}</span>
                <h3>{c.talent.scholarships.title}</h3>
                <p>{c.talent.scholarships.text}</p>
                <div className="talent-card__actions">
                  <SmartLink to={c.talent.scholarships.link} className="btn btn--primary btn--sm">
                    <i className="fas fa-graduation-cap" /> {c.talent.scholarships.button}
                  </SmartLink>
                  {c.talent.scholarships.secondaryButton && (
                    <SmartLink to={c.talent.scholarships.secondaryLink} className="btn btn--outline btn--sm">
                      <i className="fas fa-user-plus" /> {c.talent.scholarships.secondaryButton}
                    </SmartLink>
                  )}
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      <CtaBand title={c.cta.title} text={c.cta.text} />
    </>
  );
};

export default LandingPage;

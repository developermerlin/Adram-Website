import { Link } from 'react-router-dom';
import { services } from '../../data/services';
import { useCourses } from '../../data/useCatalog';
import { site } from '../../config/site';
import { CtaBand, IconTile, SectionHeading } from '../../components/ui/Section';
import { AboutArt, ScholarshipArt, TrainingArt } from '../../components/brand/Illustrations';
import '../../styles/landing.css';

const highlights = [
  { icon: 'software', title: 'Software & web', text: 'Websites, apps and management systems.', to: '/services/software-development' },
  { icon: 'network', title: 'Networks & IT support', text: 'Cabling, Wi-Fi, servers and maintenance.', to: '/services/networking' },
  { icon: 'laptop', title: 'Tech training', text: 'Practical courses for people and teams.', to: '/courses' },
  { icon: 'graduate', title: 'Scholarship guidance', text: 'Support for students applying abroad.', to: '/scholarships' },
];

const reasons = [
  { icon: 'location', title: 'Local and reachable', text: `Based in ${site.location}, with support you can meet in person.` },
  { icon: 'layers', title: 'End-to-end delivery', text: 'Networks, software and training from one accountable team.' },
  { icon: 'shield', title: 'Secure and documented', text: 'Work your organisation can own, maintain and grow.' },
];

const steps = [
  { icon: 'discover', title: 'Discover', text: 'We learn your goals, users, budget and constraints.' },
  { icon: 'design', title: 'Design', text: 'A clear plan and prototype you approve before we build.' },
  { icon: 'build', title: 'Build', text: 'Short stages with regular demos, so nothing surprises you.' },
  { icon: 'support', title: 'Support', text: 'Staff training, then maintenance whenever you need it.' },
];

const sectors = [
  { icon: 'graduate', title: 'Education', text: 'School portals, results systems and computer labs.' },
  { icon: 'health', title: 'Healthcare', text: 'Patient records, clinic software and reliable networks.' },
  { icon: 'community', title: 'NGOs & development', text: 'Data collection, reporting and field connectivity.' },
  { icon: 'government', title: 'Public sector', text: 'Digital services and records for institutions.' },
  { icon: 'growth', title: 'Business & retail', text: 'Websites, stock and sales systems, online payments.' },
  { icon: 'finance', title: 'Finance', text: 'Secure systems, dashboards and process automation.' },
];

// Hero logo panel: tilt towards the pointer (up to 10°) and move the light sheen with it.
// Skipped for touch and for people who've asked their device for less motion.
const prefersLessMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const tiltTowards = (e) => {
  if (e.pointerType === 'touch' || prefersLessMotion()) return;
  const el = e.currentTarget;
  const box = el.getBoundingClientRect();
  const x = (e.clientX - box.left) / box.width;   // 0 (left) … 1 (right)
  const y = (e.clientY - box.top) / box.height;   // 0 (top) … 1 (bottom)
  el.style.setProperty('--ry', `${(x - 0.5) * 20}deg`);
  el.style.setProperty('--rx', `${(0.5 - y) * 20}deg`);
  el.style.setProperty('--mx', `${x * 100}%`);
  el.style.setProperty('--my', `${y * 100}%`);
};

const resetTilt = (e) => {
  ['--rx', '--ry', '--mx', '--my'].forEach((name) => e.currentTarget.style.removeProperty(name));
};

export const LandingPage = () => {
  const { data: programs } = useCourses();
  // Only facts that are true today: counts come from the data; reply time matches the contact promise.
  const facts = [
    { value: services.length, label: 'Service areas' },
    { value: programs ? programs.length : '—', label: 'Training tracks' },
    { value: '1 day', label: 'Typical reply time' },
  ];

  return (
    <>
      {/* ---------- Hero ---------- */}
      <section className="home-hero">
        <div className="container home-hero__inner">
          <div className="home-hero__copy">
            <span className="badge-line">
              <i className="fas fa-location-dot" aria-hidden="true" /> IT company in {site.location}
            </span>
            <h1>
              Building solutions for a <span className="accent">better future</span>
            </h1>
            <p className="home-hero__lead">
              We design, build and support the software, networks and digital systems organisations run on, and we train
              the next generation of tech talent.
            </p>
            <div className="home-hero__actions">
              <Link to="/contact?subject=New%20project" className="btn btn--primary btn--lg">
                <i className="fas fa-paper-plane" /> Start a project
              </Link>
              <Link to="/services" className="btn btn--outline btn--lg">
                <i className="fas fa-grip" /> Our services
              </Link>
            </div>
            <ul className="home-hero__trust">
              <li><i className="fas fa-circle-check" /> End-to-end delivery</li>
              <li><i className="fas fa-circle-check" /> Local support team</li>
              <li><i className="fas fa-circle-check" /> Staff training included</li>
            </ul>
          </div>
          {/* The brand mark in a white badge, with rings and a tilted orbit that echo the logo's own ring.
              The panel sits in 3D and tilts towards the pointer; its layers float at different depths. */}
          <div className="hero-brand-scene">
            <div className="hero-brand" onPointerMove={tiltTowards} onPointerLeave={resetTilt}>
              <span className="hero-brand__glow" aria-hidden="true" />
              <span className="hero-brand__ring hero-brand__ring--outer" aria-hidden="true" />
              <span className="hero-brand__ring hero-brand__ring--inner" aria-hidden="true" />
              <span className="hero-brand__orbit" aria-hidden="true" />
              <div className="hero-brand__badge">
                <img src="/brand.png" alt="ADRAM Technologies logo" width="1254" height="1254" />
              </div>
              {/* What we do, as small badges sitting on the outer ring */}
              <div className="hero-brand__satellites">
                {[
                  { icon: 'fa-code', label: 'Software' },
                  { icon: 'fa-network-wired', label: 'Networks' },
                  { icon: 'fa-graduation-cap', label: 'Scholarships' },
                  { icon: 'fa-laptop-code', label: 'Training' },
                ].map((s) => (
                  <span key={s.label} className="hero-brand__satellite" title={s.label}>
                    <i className={`fas ${s.icon}`} aria-hidden="true" />
                  </span>
                ))}
              </div>
              <span className="hero-brand__sheen" aria-hidden="true" />
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Highlights ---------- */}
      <section className="highlights">
        <div className="container highlights__grid">
          {highlights.map((h) => (
            <Link key={h.title} to={h.to} className="highlight">
              <IconTile name={h.icon} />
              <div>
                <h3>{h.title}</h3>
                <p>{h.text}</p>
              </div>
              <i className="fas fa-chevron-right highlight__arrow" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>

      {/* ---------- Services ---------- */}
      <section className="section" id="services">
        <div className="container">
          <div className="section-head">
            <SectionHeading eyebrow="What we do" title="IT services for growing organisations">
              From a single website to a full digital transformation, we plan, build and support it.
            </SectionHeading>
            <Link to="/services" className="btn btn--outline">
              <i className="fas fa-grip" /> View all services
            </Link>
          </div>
          <div className="service-grid">
            {services.filter((s) => s.featured).map((s) =>
              s.image ? (
                // Services with a photo: the image on top, the icon overlapping its lower edge
                <Link key={s.id} to={`/services/${s.id}`} className="service-card service-card--media">
                  <span className="service-card__media">
                    <img src={s.image} alt="" loading="lazy" width="1200" height="800" />
                  </span>
                  <span className="service-card__body">
                    <IconTile name={s.brandIcon} />
                    <h3>{s.title}</h3>
                    <p>{s.summary}</p>
                    <span className="service-card__more">
                      Learn more <i className="fas fa-arrow-right" />
                    </span>
                  </span>
                </Link>
              ) : (
                <Link key={s.id} to={`/services/${s.id}`} className="service-card">
                  <IconTile name={s.brandIcon} />
                  <h3>{s.title}</h3>
                  <p>{s.summary}</p>
                  <span className="service-card__more">
                    Learn more <i className="fas fa-arrow-right" />
                  </span>
                </Link>
              ),
            )}
            <Link to="/contact?subject=Help%20choosing%20a%20service" className="service-card service-card--cta">
              <span className="service-card__cta-icon"><i className="fas fa-comments" /></span>
              <h3>Not sure what you need?</h3>
              <p>Tell us the problem and we’ll recommend the right approach, free of charge.</p>
              <span className="service-card__more">
                Talk to us <i className="fas fa-arrow-right" />
              </span>
            </Link>
          </div>
          <div className="service-more">
            <Link to="/services" className="btn btn--primary btn--lg">
              View all {services.length} services <i className="fas fa-arrow-right" />
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
            <span className="eyebrow">Who we are</span>
            <h2>A technology partner you can rely on</h2>
            <p className="muted">
              ADRAM Technologies is a Sierra Leonean IT company. We understand the realities of working here, from
              connectivity to budgets, and build solutions that fit them.
            </p>
            <ul className="reason-list">
              {reasons.map((r) => (
                <li key={r.title}>
                  <IconTile name={r.icon} />
                  <div>
                    <h3>{r.title}</h3>
                    <p>{r.text}</p>
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
            <Link to="/about" className="btn btn--outline">
              <i className="fas fa-building" /> More about us
            </Link>
          </div>
        </div>
      </section>

      {/* ---------- Process ---------- */}
      <section className="section section--dark process">
        <div className="container">
          <SectionHeading eyebrow="How we work" title="A simple, transparent process" center>
            Four clear steps, so you always know what’s happening and what comes next.
          </SectionHeading>
          <ol className="process__steps">
            {steps.map((step, i) => (
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
          <SectionHeading eyebrow="Who we work with" title="Solutions for every sector" center>
            Organisations across Sierra Leone rely on technology to serve people better.
          </SectionHeading>
          <div className="sectors">
            {sectors.map((s) => (
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
          <SectionHeading eyebrow="Beyond projects" title="Growing tech talent in Sierra Leone" center>
            Hands-on training and guidance towards study opportunities abroad.
          </SectionHeading>
          <div className="talent-grid">
            <article className="talent-card">
              <div className="talent-card__art">
                <TrainingArt />
              </div>
              <div className="talent-card__body">
                <span className="eyebrow">Training & courses</span>
                <h3>Practical skills, taught by practitioners</h3>
                <p>Programming, web and mobile development, software engineering and AI, plus tailored corporate training.</p>
                <Link to="/courses" className="btn btn--primary btn--sm">
                  <i className="fas fa-laptop-code" /> Browse programmes
                </Link>
              </div>
            </article>
            <article className="talent-card">
              <div className="talent-card__art talent-card__art--dark">
                <ScholarshipArt />
              </div>
              <div className="talent-card__body">
                <span className="eyebrow">Scholarships</span>
                <h3>Your path to studying abroad</h3>
                <p>Find suitable international scholarships, prepare strong applications and track them to a decision.</p>
                <div className="talent-card__actions">
                  <Link to="/scholarships" className="btn btn--primary btn--sm">
                    <i className="fas fa-graduation-cap" /> Explore scholarships
                  </Link>
                  <Link to="/register" className="btn btn--outline btn--sm">
                    <i className="fas fa-user-plus" /> Create account
                  </Link>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      <CtaBand />
    </>
  );
};

export default LandingPage;

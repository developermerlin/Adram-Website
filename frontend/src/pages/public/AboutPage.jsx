import { Link } from 'react-router-dom';
import { site } from '../../config/site';
import { CtaBand, IconTile, PageHero, SectionHeading } from '../../components/ui/Section';
import { AboutArt } from '../../components/brand/Illustrations';
import HeroBrand from '../../components/brand/HeroBrand';
import '../../styles/pages.css';

const values = [
  { icon: 'partnership', title: 'Partnership', text: 'We work alongside our clients and students, not just for them.' },
  { icon: 'quality', title: 'Quality', text: 'Secure, well-documented work we’re proud to put our name on.' },
  { icon: 'innovation', title: 'Innovation', text: 'Modern tools and ideas, adapted to local realities.' },
  { icon: 'people', title: 'Empowerment', text: 'Every project and course leaves people more capable than before.' },
];

const pillars = [
  { icon: 'server', title: 'IT services', text: 'Software, web and mobile apps, networks, hardware, AI, data analytics, consultancy, creative design and touch-typing training.', to: '/services' },
  { icon: 'laptop', title: 'Training', text: 'Practical courses for individuals and organisations.', to: '/courses' },
  { icon: 'graduate', title: 'Scholarships', text: 'Guidance for students pursuing study abroad.', to: '/scholarships' },
];

export const AboutPage = () => (
  <>
    <PageHero
      eyebrow="About us"
      title={`${site.name}: ${site.tagline.toLowerCase()}`}
      background="/consultancy/consult-hero.jpg"
      art={<div className="art-frame art-frame--dark"><AboutArt /></div>}
    >
      A technology company in {site.location} helping organisations work smarter and helping people build careers in tech.
    </PageHero>

    <section className="section">
      <div className="container grid grid-2 align-center">
        <div>
          <SectionHeading eyebrow="Who we are" title="A trusted partner in technology, training and educational opportunity" />
          <p className="lead">
            ADRAM Technologies delivers IT solutions for businesses, schools, NGOs and public institutions, from websites
            and custom software to office networks and AI-powered tools.
          </p>
          <p className="muted">
            We also believe technology only works when people can use it. That’s why we train individuals and teams, and
            why we guide young Sierra Leoneans towards international scholarships that open doors to world-class education.
          </p>
        </div>
        <div className="about-brand">
          <HeroBrand variant="flat" />
        </div>
      </div>
      <div className="container about-pillars">
        {pillars.map((p) => (
          <Link key={p.title} to={p.to} className="card card--hover pillar-link">
            <IconTile name={p.icon} />
            <div>
              <h3>{p.title}</h3>
              <p className="muted">{p.text}</p>
            </div>
            <i className="fas fa-arrow-right pillar-link__arrow" />
          </Link>
        ))}
      </div>
    </section>

    <section className="section section--dark" id="mission">
      <div className="container grid grid-2">
        <div className="statement">
          <IconTile name="innovation" tone="dark" />
          <span className="eyebrow">Our mission</span>
          <h2>Make dependable technology and digital skills accessible to everyone we serve.</h2>
          <p>
            We deliver solutions that solve real problems, and we share our knowledge so the people and organisations we
            work with can grow with confidence.
          </p>
        </div>
        <div className="statement">
          <IconTile name="discover" tone="dark" />
          <span className="eyebrow">Our vision</span>
          <h2>A Sierra Leone where every organisation and every young person can thrive in the digital economy.</h2>
          <p>
            We aim to be the region’s most trusted partner for technology, training and educational opportunity.
          </p>
        </div>
      </div>
    </section>

    <section className="section" id="values">
      <div className="container">
        <SectionHeading eyebrow="How we work" title="Our values" center />
        <div className="grid grid-4">
          {values.map((v) => (
            <div key={v.title} className="card card--hover value-card">
              <IconTile name={v.icon} />
              <h3>{v.title}</h3>
              <p className="muted">{v.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>

    <CtaBand title="Let’s build something together" />
  </>
);

export default AboutPage;

import { fill } from '../../content/merge';
import { usePageContent, useSite } from '../../content/useContent';
import { CtaBand, IconTile, PageHero, SectionHeading } from '../../components/ui/Section';
import SmartLink from '../../components/ui/SmartLink';
import { AboutArt } from '../../components/brand/Illustrations';
import HeroBrand from '../../components/brand/HeroBrand';
import '../../styles/pages.css';
import { VideoSection } from '../../components/ui/VideoSection';

// All wording, links and the header photo come from the editable "about" content (see content/defaults.js).
export const AboutPage = () => {
  const site = useSite();
  const c = usePageContent('about');
  const t = (text) => fill(text, site);

  return (
    <>
      <PageHero
        eyebrow={c.hero.eyebrow}
        title={t(c.hero.title)}
        background={c.hero.image || undefined}
        art={<div className="art-frame art-frame--dark"><AboutArt /></div>}
      >
        {t(c.hero.lead)}
      </PageHero>

      <section className="section">
        <div className="container grid grid-2 align-center">
          <div>
            <SectionHeading eyebrow={c.who.eyebrow} title={c.who.title} />
            <p className="lead">{c.who.lead}</p>
            <p className="muted">{c.who.text}</p>
          </div>
          <div className="about-brand">
            <HeroBrand variant="flat" />
          </div>
        </div>
        <div className="container about-pillars">
          {c.pillars.map((p) => (
            <SmartLink key={p.title} to={p.link} className="card card--hover pillar-link">
              <IconTile name={p.icon} />
              <div>
                <h3>{p.title}</h3>
                <p className="muted">{p.text}</p>
              </div>
              <i className="fas fa-arrow-right pillar-link__arrow" />
            </SmartLink>
          ))}
        </div>
      </section>

      <VideoSection video={c.video} surface />

      <section className="section section--dark" id="mission">
        <div className="container grid grid-2">
          {[c.mission, c.vision].map((s) => (
            <div key={s.eyebrow} className="statement">
              <IconTile name={s.icon} tone="dark" />
              <span className="eyebrow">{s.eyebrow}</span>
              <h2>{s.title}</h2>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section" id="values">
        <div className="container">
          <SectionHeading eyebrow={c.values.eyebrow} title={c.values.title} center />
          <div className="grid grid-4">
            {c.values.items.map((v) => (
              <div key={v.title} className="card card--hover value-card">
                <IconTile name={v.icon} />
                <h3>{v.title}</h3>
                <p className="muted">{v.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CtaBand title={c.cta.title} text={c.cta.text} />
    </>
  );
};

export default AboutPage;

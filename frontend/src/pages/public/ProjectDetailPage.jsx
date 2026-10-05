import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { usePageContent, useSite } from '../../content/useContent';
import { useServices } from '../../content/useServices';
import { projectsAPI } from '../../services/api';
import { assetUrl } from '../../utils/assets';
import Markdown from '../../components/blog/Markdown';
import BrandIcon from '../../components/brand/BrandIcon';
import { CtaBand } from '../../components/ui/Section';
import { ProjectCard, ProjectCover } from '../../components/projects/ProjectCard';
import { NotFoundPage } from './StatusPages';
import '../../styles/projects.css';

const monthYear = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : '');

/** Pictures from the project, opened large one at a time (arrow keys move, Escape closes). */
const Gallery = ({ items, title }) => {
  const [open, setOpen] = useState(null);
  useEffect(() => {
    if (open === null) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(null);
      if (e.key === 'ArrowRight') setOpen((i) => (i + 1) % items.length);
      if (e.key === 'ArrowLeft') setOpen((i) => (i - 1 + items.length) % items.length);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, items.length]);
  return (
    <>
      <div className={`pj-gallery pj-gallery--${Math.min(items.length, 3)}`}>
        {items.map((g, i) => (
          <button key={g.src + i} type="button" className="pj-gallery__item" onClick={() => setOpen(i)} aria-label={`Open picture ${i + 1}${g.caption ? `: ${g.caption}` : ''}`}>
            <img src={assetUrl(g.src)} alt={g.caption || `${title}, picture ${i + 1}`} loading="lazy" />
            {g.caption && <span>{g.caption}</span>}
          </button>
        ))}
      </div>
      {open !== null && (
        <div className="pj-lightbox" role="dialog" aria-modal="true" aria-label={items[open].caption || `Picture ${open + 1}`} onClick={() => setOpen(null)}>
          <figure onClick={(e) => e.stopPropagation()}>
            <img src={assetUrl(items[open].src)} alt={items[open].caption || ''} />
            <figcaption>{items[open].caption}<span>{open + 1} / {items.length}</span></figcaption>
          </figure>
          <button type="button" className="pj-lightbox__close" onClick={() => setOpen(null)} aria-label="Close"><i className="fas fa-xmark" /></button>
          {items.length > 1 && (
            <>
              <button type="button" className="pj-lightbox__nav pj-lightbox__nav--prev" aria-label="Previous picture"
                onClick={(e) => { e.stopPropagation(); setOpen((i) => (i - 1 + items.length) % items.length); }}><i className="fas fa-chevron-left" /></button>
              <button type="button" className="pj-lightbox__nav pj-lightbox__nav--next" aria-label="Next picture"
                onClick={(e) => { e.stopPropagation(); setOpen((i) => (i + 1) % items.length); }}><i className="fas fa-chevron-right" /></button>
            </>
          )}
        </div>
      )}
    </>
  );
};

/** /projects/:slug — one project as a case study: the facts, the story, results, pictures and a client quote. */
export const ProjectDetailPage = () => {
  const { slug } = useParams();
  const c = usePageContent('projects');
  const L = c.labels;
  const site = useSite();
  const { services } = useServices();
  // { slug, data }: the loaded project belongs to one address, so moving to another shows the loading state again
  const [loaded, setLoaded] = useState({ slug: null, data: undefined });
  const p = loaded.slug === slug ? loaded.data : undefined;

  useEffect(() => {
    projectsAPI.get(slug).then(({ data }) => setLoaded({ slug, data })).catch(() => setLoaded({ slug, data: null }));
  }, [slug]);

  useEffect(() => {
    if (!p) return undefined;
    const before = document.title;
    document.title = `${p.title} | ${site.name}`;
    return () => { document.title = before; };
  }, [p, site.name]);

  if (p === null) return <NotFoundPage />;
  if (p === undefined) {
    return (
      <div className="container pj-loading" aria-busy="true">
        <div className="skeleton skeleton--block" style={{ height: 280 }} />
      </div>
    );
  }

  const service = services.find((s) => s.id === p.service);
  const serviceOf = Object.fromEntries(services.map((s) => [s.id, s]));
  const facts = [
    ['fa-building', L.client, p.client],
    ['fa-layer-group', L.sector, p.sector],
    ['fa-location-dot', L.location, p.location],
    ['fa-calendar-check', L.completed, monthYear(p.completed_on)],
    ['fa-hourglass-half', L.duration, p.duration],
  ].filter(([, , v]) => v);
  const story = [['challenge', L.challenge, 'fa-circle-question'], ['solution', L.solution, 'fa-screwdriver-wrench'], ['outcome', L.outcome, 'fa-flag-checkered']]
    .filter(([key]) => p[key]?.trim());

  return (
    <>
      {p.draft && (
        <div className="pj-draft" role="note"><i className="fas fa-eye" aria-hidden="true" /> Preview: this project is a draft and only administrators can see it.</div>
      )}
      <section className="pj-hero">
        <div className="container pj-hero__inner">
          <nav className="breadcrumb" aria-label="Breadcrumb">
            <Link to="/">Home</Link>
            <span className="breadcrumb__item"><span aria-hidden="true">/</span><Link to="/projects">{c.hero.eyebrow}</Link></span>
            <span className="breadcrumb__item"><span aria-hidden="true">/</span><span>{p.title}</span></span>
          </nav>
          {service && <Link to={`/services/${service.id}`} className="pj-tag pj-tag--dark"><BrandIcon name={service.brandIcon} size={16} /> {service.title}</Link>}
          <h1>{p.title}</h1>
          <p className="pj-hero__lead">{p.summary}</p>
          {facts.length > 0 && (
            <dl className="pj-facts">
              {facts.map(([icon, label, value]) => (
                <div key={label}>
                  <dt><i className={`fas ${icon}`} aria-hidden="true" /> {label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}
          {p.live_url && (
            <a href={p.live_url} target="_blank" rel="noopener noreferrer" className="btn btn--primary pj-hero__live">
              {L.visit} <i className="fas fa-arrow-up-right-from-square" aria-hidden="true" />
            </a>
          )}
        </div>
      </section>

      <div className="container">
        <ProjectCover project={p} service={service} className="pj-cover--hero" />
      </div>

      {p.results?.length > 0 && (
        <section className="container pj-results" aria-label={L.results}>
          {p.results.map((r) => (
            <div key={r.label} className="pj-result"><strong>{r.value}</strong><span>{r.label}</span></div>
          ))}
        </section>
      )}

      <section className="section pj-body">
        <div className="container pj-body__grid">
          <article className="pj-story">
            {story.map(([key, heading, icon]) => (
              <section key={key} className="pj-story__part">
                <h2><span className="pj-story__icon"><i className={`fas ${icon}`} aria-hidden="true" /></span>{heading}</h2>
                <div className="prose"><Markdown source={p[key]} /></div>
              </section>
            ))}
            {p.gallery?.length > 0 && (
              <section className="pj-story__part">
                <h2><span className="pj-story__icon"><i className="fas fa-images" aria-hidden="true" /></span>{L.gallery}</h2>
                <Gallery items={p.gallery} title={p.title} />
              </section>
            )}
            {p.quote && (
              <figure className="pj-quote">
                <i className="fas fa-quote-left" aria-hidden="true" />
                <blockquote>{p.quote}</blockquote>
                {p.quote_author && <figcaption><strong>{p.quote_author}</strong>{p.quote_role && <span>{p.quote_role}</span>}</figcaption>}
              </figure>
            )}
          </article>

          <aside className="pj-aside">
            <div className="pj-aside__card">
              {p.client_logo && <img className="pj-aside__logo" src={assetUrl(p.client_logo)} alt={p.client || ''} />}
              {p.client && <p className="pj-aside__client">{p.client}</p>}
              {service && (
                <p className="pj-aside__row"><span>{L.service}</span><Link to={`/services/${service.id}`}>{service.title}</Link></p>
              )}
              {p.technologies?.length > 0 && (
                <>
                  <h3>{L.technologies}</h3>
                  <ul className="pj-techs pj-techs--wrap">{p.technologies.map((t) => <li key={t}>{t}</li>)}</ul>
                </>
              )}
              <Link to="/contact?subject=New%20project" className="btn btn--primary pj-aside__cta"><i className="fas fa-paper-plane" /> {c.cta.button}</Link>
              {p.live_url && <a href={p.live_url} target="_blank" rel="noopener noreferrer" className="btn btn--outline pj-aside__cta">{L.visit}</a>}
            </div>
          </aside>
        </div>
      </section>

      {p.related?.length > 0 && (
        <section className="section pj-related">
          <div className="container">
            <div className="pj-related__head">
              <h2>{L.related}</h2>
              <Link to="/projects" className="pj-card__link">{L.back} <i className="fas fa-arrow-right" aria-hidden="true" /></Link>
            </div>
            <div className="pj-grid">
              {p.related.map((r) => <ProjectCard key={r.id} project={r} service={serviceOf[r.service]} labels={L} />)}
            </div>
          </div>
        </section>
      )}

      <CtaBand title={c.cta.title} text={c.cta.text} to="/contact?subject=New%20project" />
    </>
  );
};

export default ProjectDetailPage;

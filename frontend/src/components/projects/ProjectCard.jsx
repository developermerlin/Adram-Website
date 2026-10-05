import { Link } from 'react-router-dom';
import BrandIcon from '../brand/BrandIcon';
import { assetUrl } from '../../utils/assets';

/** The picture on a project card or case study; without one, a branded panel with the service's icon. */
export const ProjectCover = ({ project, service, className = '' }) => (
  <div className={`pj-cover ${className}`}>
    {project.cover
      ? <img src={assetUrl(project.cover)} alt={project.cover_alt || ''} loading="lazy" />
      : <span className="pj-cover__blank" aria-hidden="true"><BrandIcon name={service?.brandIcon || 'briefcase'} size={56} /></span>}
  </div>
);

/** One project in the grid (or, with `wide`, the featured one). */
export const ProjectCard = ({ project, service, labels, wide = false }) => (
  <article className={`pj-card${wide ? ' pj-card--wide' : ''}`}>
    <Link to={`/projects/${project.slug}`} className="pj-card__media" tabIndex={-1} aria-hidden="true">
      <ProjectCover project={project} service={service} />
      {service && <span className="pj-tag pj-tag--on-image">{service.title}</span>}
    </Link>
    <div className="pj-card__body">
      {wide && <span className="pj-featured"><i className="fas fa-star" aria-hidden="true" /> {labels.featured}</span>}
      <h3 className="pj-card__title"><Link to={`/projects/${project.slug}`}>{project.title}</Link></h3>
      {(project.client || project.year) && (
        <p className="pj-card__meta">
          {project.client && <span><i className="fas fa-building" aria-hidden="true" /> {project.client}</span>}
          {project.location && <span><i className="fas fa-location-dot" aria-hidden="true" /> {project.location}</span>}
          {project.year && <span><i className="far fa-calendar" aria-hidden="true" /> {project.year}</span>}
        </p>
      )}
      <p className="pj-card__summary">{project.summary}</p>
      {wide && project.results?.length > 0 && (
        <dl className="pj-card__results">
          {project.results.map((r) => (
            <div key={r.label}><dt>{r.value}</dt><dd>{r.label}</dd></div>
          ))}
        </dl>
      )}
      <div className="pj-card__foot">
        {project.technologies?.length > 0 && (
          <ul className="pj-techs" aria-label="Technologies">
            {project.technologies.slice(0, wide ? 5 : 3).map((t) => <li key={t}>{t}</li>)}
            {!wide && project.technologies.length > 3 && <li className="pj-techs__more">+{project.technologies.length - 3}</li>}
          </ul>
        )}
        <Link to={`/projects/${project.slug}`} className="pj-card__link">
          {labels.viewCase} <i className="fas fa-arrow-right" aria-hidden="true" />
          <span className="sr-only">: {project.title}</span>
        </Link>
      </div>
    </div>
  </article>
);

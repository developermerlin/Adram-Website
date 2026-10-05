import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePageContent } from '../../content/useContent';
import { useServices } from '../../content/useServices';
import { projectsAPI } from '../../services/api';
import BrandIcon from '../../components/brand/BrandIcon';
import { ProjectCard } from '../../components/projects/ProjectCard';
import { CtaBand, PageHero } from '../../components/ui/Section';
import { ServiceArt } from '../../components/brand/Illustrations';
import '../../styles/projects.css';

/** /projects — completed work, filtered by service, with a featured case study at the top. */
export const ProjectsPage = () => {
  const c = usePageContent('projects');
  const L = c.labels;
  const { services } = useServices();
  const [projects, setProjects] = useState(null);
  const [service, setService] = useState('all');
  const [q, setQ] = useState('');

  useEffect(() => {
    projectsAPI.list().then(({ data }) => setProjects(data.results)).catch(() => setProjects([]));
  }, []);

  const serviceOf = useMemo(() => Object.fromEntries(services.map((s) => [s.id, s])), [services]);
  const used = useMemo(() => services.filter((s) => (projects || []).some((p) => p.service === s.id)), [services, projects]);
  const term = q.trim().toLowerCase();
  const shown = (projects || []).filter((p) => (service === 'all' || p.service === service)
    && (!term || [p.title, p.summary, p.client, p.sector, p.location, ...(p.technologies || [])].join(' ').toLowerCase().includes(term)));
  const featured = service === 'all' && !term ? shown.find((p) => p.featured) : null;
  const rest = featured ? shown.filter((p) => p !== featured) : shown;
  const count = (key) => new Set((projects || []).map((p) => p[key]).filter(Boolean)).size;
  const stats = projects?.length ? [
    [projects.length, L.statProjects],
    [count('client'), L.statClients],
    [count('sector'), L.statSectors],
    [count('service'), L.statServices],
  ].filter(([n]) => n > 0) : [];

  return (
    <>
      <PageHero
        eyebrow={c.hero.eyebrow}
        title={c.hero.title}
        crumbs={[{ to: '/about', label: 'About' }, { label: c.hero.eyebrow }]}
        art={<ServiceArt />}
        actions={(
          <>
            <Link to="/contact?subject=New%20project" className="btn btn--primary"><i className="fas fa-paper-plane" /> {c.hero.primaryLabel}</Link>
            <Link to="/services" className="btn btn--ghost-light">{c.hero.secondaryLabel}</Link>
          </>
        )}
      >
        {c.hero.lead}
      </PageHero>

      {stats.length > 0 && (
        <div className="container">
          <dl className="pj-stats">
            {stats.map(([n, label]) => (
              <div key={label}><dt>{n}</dt><dd>{label}</dd></div>
            ))}
          </dl>
        </div>
      )}

      <section className="section pj-section">
        <div className="container">
          {projects === null ? (
            <div className="pj-grid" aria-busy="true">
              {[0, 1, 2].map((i) => <div key={i} className="pj-card pj-card--skeleton"><div className="skeleton skeleton--block" /></div>)}
            </div>
          ) : projects.length === 0 ? (
            <div className="pj-empty">
              <span className="pj-empty__icon"><BrandIcon name="briefcase" size={40} /></span>
              <p>{L.empty}</p>
              <Link to="/contact" className="btn btn--primary">{c.cta.button}</Link>
            </div>
          ) : (
            <>
              <div className="pj-toolbar">
                {used.length > 1 && (
                  <div className="pj-filters" role="group" aria-label="Filter by service">
                    <button type="button" className={service === 'all' ? 'is-active' : ''} aria-pressed={service === 'all'} onClick={() => setService('all')}>
                      {L.all} <span>{projects.length}</span>
                    </button>
                    {used.map((s) => (
                      <button key={s.id} type="button" className={service === s.id ? 'is-active' : ''} aria-pressed={service === s.id} onClick={() => setService(s.id)}>
                        {s.title} <span>{projects.filter((p) => p.service === s.id).length}</span>
                      </button>
                    ))}
                  </div>
                )}
                <label className="pj-search">
                  <i className="fas fa-magnifying-glass" aria-hidden="true" />
                  <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={L.search} aria-label={L.search} />
                </label>
              </div>

              {featured && <ProjectCard project={featured} service={serviceOf[featured.service]} labels={L} wide />}

              {rest.length > 0 ? (
                <div className="pj-grid">
                  {rest.map((p) => <ProjectCard key={p.id} project={p} service={serviceOf[p.service]} labels={L} />)}
                </div>
              ) : !featured && <p className="pj-none">{L.noResults}</p>}
            </>
          )}
        </div>
      </section>

      <CtaBand title={c.cta.title} text={c.cta.text} to="/contact?subject=New%20project" />
    </>
  );
};

export default ProjectsPage;

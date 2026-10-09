import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { destinations, FUNDING, LEVELS } from '../../data/scholarships';
import { usePageContent } from '../../content/useContent';
import { assetUrl } from '../../utils/assets';
import { useScholarships } from '../../data/useCatalog';
import { OfficialLink } from '../../components/ui/ScholarshipActions';
import { DeadlineBadge } from '../../components/ui/KeyDates';
import { CtaBand, IconTile, PageHero, SectionHeading } from '../../components/ui/Section';
import Flag from '../../components/ui/Flag';
import '../../styles/pages.css';
import { VideoSection } from '../../components/ui/VideoSection';

const ScholarshipCard = ({ s }) => (
  <article className="sch-card">
    <div className="sch-card__top">
      <span className="sch-card__country">
        <Flag code={s.country} size={26} /> {s.country_name}
      </span>
      <span className={`badge ${s.funding === 'full' ? 'badge--green' : 'badge--amber'}`}>{FUNDING[s.funding]}</span>
    </div>
    <h3>
      <Link to={`/scholarships/${s.slug}`}>{s.name}</Link>
    </h3>
    <p className="sch-card__provider">{s.provider}</p>
    <DeadlineBadge scholarship={s} />
    <div className="sch-card__levels">
      {s.levels.map((l) => (
        <span key={l} className="level-tag">
          <i className="fas fa-graduation-cap" aria-hidden="true" /> {l}
        </span>
      ))}
    </div>
    <ul className="sch-card__covers">
      {s.covers.slice(0, 3).map((c) => (
        <li key={c}><i className="fas fa-check" aria-hidden="true" /> {c}</li>
      ))}
    </ul>
    <div className="sch-card__foot">
      <Link to={`/scholarships/${s.slug}`} className="btn btn--primary btn--sm">
        <i className="fas fa-circle-info" /> View details
      </Link>
      <OfficialLink scholarship={s} className="sch-card__official">
        Official site {s.url && <i className="fas fa-arrow-up-right-from-square" />}
      </OfficialLink>
    </div>
  </article>
);

// Placeholder cards while the list loads, so the page doesn't jump.
const CardSkeletons = () => (
  <div className="sch-grid" aria-busy="true">
    {[0, 1, 2].map((i) => (
      <div key={i} className="sch-card sch-card--loading">
        <span className="skeleton skeleton--line" />
        <span className="skeleton skeleton--line" />
        <span className="skeleton skeleton--block" />
      </div>
    ))}
  </div>
);

export const ScholarshipsPage = () => {
  const c = usePageContent('scholarships');
  const [params, setParams] = useSearchParams();
  const { data, loading, error } = useScholarships();
  const scholarships = useMemo(() => data || [], [data]);
  const filters = {
    q: params.get('q') || '',
    country: params.get('country') || '',
    level: params.get('level') || '',
    full: params.get('full') === '1',
  };

  // Filters live in the URL, so a filtered list can be shared or bookmarked.
  const setFilter = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true, preventScrollReset: true });
  };

  const results = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return scholarships.filter(
      (s) =>
        (!filters.country || s.country === filters.country) &&
        (!filters.level || s.levels.includes(filters.level)) &&
        (!filters.full || s.funding === 'full') &&
        (!q || `${s.name} ${s.provider} ${s.country_name} ${s.fields}`.toLowerCase().includes(q)),
    );
  }, [scholarships, filters.q, filters.country, filters.level, filters.full]);

  const countryCounts = scholarships.reduce((acc, s) => ({ ...acc, [s.country]: (acc[s.country] || 0) + 1 }), {});
  const filtered = filters.q || filters.country || filters.level || filters.full;

  const pickDestination = (code) => {
    const next = new URLSearchParams();
    next.set('country', code);
    setParams(next, { replace: true, preventScrollReset: true });
    document.getElementById('finder')?.scrollIntoView({ behavior: 'smooth' });
  };

  const stats = [
    { icon: 'award', value: data ? scholarships.length : '—', label: c.stats.listed },
    { icon: 'globe', value: data ? Object.keys(countryCounts).length : '—', label: c.stats.destinations },
    { icon: 'finance', value: data ? scholarships.filter((s) => s.funding === 'full').length : '—', label: c.stats.funded },
    { icon: 'graduate', value: `${LEVELS.length} levels`, label: c.stats.levels },
  ];

  return (
    <>
      <PageHero
        eyebrow={c.hero.eyebrow}
        title={c.hero.title}
        background={c.hero.image || undefined}
        actions={
          <>
            <a href="#finder" className="btn btn--primary">
              <i className="fas fa-magnifying-glass" /> {c.hero.primaryLabel}
            </a>
            <Link to="/contact?subject=Scholarship%20consultation" className="btn btn--ghost-light">
              <i className="fas fa-comments" /> {c.hero.secondaryLabel}
            </Link>
          </>
        }
      >
        {c.hero.lead}
      </PageHero>

      {/* Headline figures (counted from the list, so they stay accurate) */}
      <section className="contact-methods sch-stats">
        <div className="container contact-methods__grid">
          {stats.map((s) => (
            <div key={s.label} className="contact-method sch-stat">
              <IconTile name={s.icon} />
              <div>
                <strong>{s.value}</strong>
                <span>{s.label}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Finder ---------- */}
      <section className="section" id="finder">
        <div className="container">
          <div className="section-head">
            <SectionHeading eyebrow={c.finder.eyebrow} title={c.finder.title}>
              {c.finder.intro}
            </SectionHeading>
          </div>

          <div className="finder-bar">
            <div className="input-icon finder-bar__search">
              <i className="fas fa-magnifying-glass" aria-hidden="true" />
              <input
                type="search"
                className="input"
                placeholder="Search by name, country or subject"
                aria-label="Search scholarships"
                value={filters.q}
                onChange={(e) => setFilter('q', e.target.value)}
              />
            </div>
            <select className="input" aria-label="Destination" value={filters.country} onChange={(e) => setFilter('country', e.target.value)}>
              <option value="">All destinations</option>
              {Object.entries(destinations).map(([code, d]) => (
                <option key={code} value={code}>{d.name}</option>
              ))}
            </select>
            <div className="segmented finder-bar__levels" role="group" aria-label="Level of study">
              {['', ...LEVELS].map((l) => (
                <button key={l || 'all'} type="button" className={filters.level === l ? 'is-active' : ''} aria-pressed={filters.level === l} onClick={() => setFilter('level', l)}>
                  {l || 'All levels'}
                </button>
              ))}
            </div>
            <label className="toggle">
              <input type="checkbox" checked={filters.full} onChange={(e) => setFilter('full', e.target.checked ? '1' : '')} />
              <span className="toggle__track" aria-hidden="true" />
              Fully funded only
            </label>
          </div>

          <div className="finder-meta">
            <span aria-live="polite">
              {data ? (
                <>
                  Showing <strong>{results.length}</strong> of {scholarships.length} scholarships
                  {filters.country && <> in <strong>{destinations[filters.country]?.name}</strong></>}
                </>
              ) : (
                'Loading scholarships…'
              )}
            </span>
            {filtered && (
              <button type="button" className="btn btn--text btn--sm" onClick={() => setParams({}, { replace: true, preventScrollReset: true })}>
                <i className="fas fa-xmark" /> Clear filters
              </button>
            )}
          </div>

          {loading && <CardSkeletons />}
          {error && (
            <div className="finder-empty">
              <IconTile name="globe" />
              <h3>Scholarships couldn’t be loaded</h3>
              <p>Please check your connection and refresh the page, or ask a counsellor directly.</p>
              <Link to="/contact?subject=Scholarship%20consultation" className="btn btn--outline btn--sm">
                <i className="fas fa-comments" /> Ask a counsellor
              </Link>
            </div>
          )}
          {data && (results.length ? (
            <div className="sch-grid">
              {results.map((s) => (
                <ScholarshipCard key={s.slug} s={s} />
              ))}
            </div>
          ) : (
            <div className="finder-empty">
              <IconTile name="globe" />
              <h3>No scholarships match those filters</h3>
              <p>Try another destination or level, or ask a counsellor about other opportunities.</p>
              <Link to="/contact?subject=Scholarship%20consultation" className="btn btn--outline btn--sm">
                <i className="fas fa-comments" /> Ask a counsellor
              </Link>
            </div>
          ))}

          <p className="sch-disclaimer">
            <i className="fas fa-circle-info" aria-hidden="true" /> {c.finder.disclaimer}
          </p>
        </div>
      </section>

      {/* ---------- Destinations ---------- */}
      <section className="section section--surface" id="destinations">
        <div className="container">
          <SectionHeading eyebrow={c.destinations.eyebrow} title={c.destinations.title} center>
            {c.destinations.intro}
          </SectionHeading>
          <div className="dest-grid">
            {Object.entries(destinations).map(([code, d]) => (
              <button key={code} type="button" className="dest-card" onClick={() => pickDestination(code)}>
                <Flag code={code} size={44} label={d.name} />
                <span className="dest-card__text">
                  <strong>{d.name}</strong>
                  <small>
                    {countryCounts[code] || 0} {countryCounts[code] === 1 ? 'scholarship' : 'scholarships'}
                  </small>
                </span>
                <i className="fas fa-arrow-right dest-card__arrow" aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- How ADRAM helps + process ---------- */}
      <section className="section" id="support">
        <div className="container sch-help">
          <div>
            <span className="eyebrow">{c.help.eyebrow}</span>
            <h2>{c.help.title}</h2>
            <p className="muted">{c.help.intro}</p>
            {c.help.image && (
              <figure className="sch-photo">
                <img src={assetUrl(c.help.image)} alt="" loading="lazy" width="1100" height="619" />
                {c.help.caption && (
                  <figcaption>
                    <i className="fas fa-graduation-cap" aria-hidden="true" /> {c.help.caption}
                  </figcaption>
                )}
              </figure>
            )}
            <div className="sch-help__grid">
              {c.help.items.map((s) => (
                <div key={s.title} className="benefit">
                  <IconTile name={s.icon} />
                  <div>
                    <h4>{s.title}</h4>
                    <p>{s.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="sch-process" id="process">
            <h3>
              <i className="fas fa-route" aria-hidden="true" /> {c.journey.title}
            </h3>
            <ol className="timeline timeline--light">
              {c.journey.steps.map((s, i) => (
                <li key={s.title}>
                  <span className="timeline__num">{i + 1}</span>
                  <div>
                    <h4>{s.title}</h4>
                    <p>{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="sch-process__actions">
              <Link to="/register" className="btn btn--primary">
                <i className="fas fa-user-plus" /> {c.journey.createLabel}
              </Link>
              <Link to="/login" className="btn btn--ghost-light">
                <i className="fas fa-right-to-bracket" /> {c.journey.signInLabel}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <VideoSection video={c.video} />

      {/* ---------- Documents + FAQ ---------- */}
      <section className="section section--surface" id="requirements">
        <div className="container sch-docs">
          <div className="aside-card sch-docs__card">
            {c.docs.image && <img className="sch-docs__img" src={assetUrl(c.docs.image)} alt="" loading="lazy" width="900" height="563" />}
            <IconTile name="certificate" />
            <h3>{c.docs.title}</h3>
            <p className="muted">{c.docs.intro}</p>
            <ul className="check-list">
              {c.docs.items.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </div>
          <div>
            <span className="eyebrow">{c.faqs.eyebrow}</span>
            <h2>{c.faqs.title}</h2>
            <div className="faq">
              {c.faqs.items.map((f, i) => (
                <details key={f.q} open={i === 0}>
                  <summary>
                    {f.q}
                    <i className="fas fa-chevron-down" aria-hidden="true" />
                  </summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      <CtaBand title={c.cta.title} text={c.cta.text} to="/contact?subject=Scholarship%20consultation" />
    </>
  );
};

export default ScholarshipsPage;

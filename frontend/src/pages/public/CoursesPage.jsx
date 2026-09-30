import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { telHref } from '../../config/site';
import { fill } from '../../content/merge';
import { usePageContent, useSite } from '../../content/useContent';
import { lmsAPI } from '../../services/api';
import { CtaBand, IconTile, PageHero, SectionHeading } from '../../components/ui/Section';
import { TrainingArt } from '../../components/brand/Illustrations';
import BrandIcon from '../../components/brand/BrandIcon';
import CourseCard from '../../components/lms/CourseCard';
import Stars from '../../components/lms/Stars';
import useWishlist from '../../components/lms/useWishlist';
import { levelLabel } from '../../components/lms/courseUtils';
import '../../styles/pages.css';
import '../../styles/lms.css';
import '../../styles/marketplace.css';

const SORTS = [
  ['popular', 'Most popular'],
  ['newest', 'Newest'],
  ['rating', 'Highest rated'],
  ['price_low', 'Price: low to high'],
  ['price_high', 'Price: high to low'],
];
const RATINGS = [['4.5', '4.5 & up'], ['4', '4.0 & up'], ['3.5', '3.5 & up'], ['3', '3.0 & up']];
const DURATIONS = [['short', 'Under 2 hours'], ['medium', '2 to 6 hours'], ['long', 'Over 6 hours']];
const PRICES = [['', 'All prices'], ['free', 'Free'], ['paid', 'Paid'], ['discounted', 'On sale']];
const FILTER_KEYS = ['q', 'category', 'subcategory', 'level', 'language', 'price', 'rating', 'duration', 'instructor', 'sort', 'page'];
const ROWS = [
  ['recommended', 'Recommended for you'],
  ['popular', 'Most popular'],
  ['newest', 'Newly added'],
  ['top_rated', 'Highest rated'],
  ['discounted', 'On sale now'],
  ['free', 'Free courses'],
];

/** A row of courses that scrolls sideways (popular, new, top rated…). */
const CourseRow = ({ title, courses, wish }) => {
  const ref = useRef(null);
  const [edges, setEdges] = useState({ start: true, end: (courses?.length || 0) <= 4 });
  const update = () => {
    const el = ref.current;
    if (el) setEdges({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 });
  };
  const scroll = (dir) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.9, behavior: 'smooth' });
  if (!courses?.length) return null;
  return (
    <section className="cf-row" aria-label={title}>
      <div className="cf-row__head"><h3>{title}</h3></div>
      <div className="cf-row__viewport">
        {!edges.start && <button type="button" className="cf-row__arrow cf-row__arrow--prev" onClick={() => scroll(-1)} aria-label={`Scroll ${title} back`}><i className="fas fa-chevron-left" /></button>}
        <div className="cf-row__track" ref={ref} onScroll={update} onPointerEnter={update}>
          {courses.map((course) => <div key={course.slug} className="cf-row__item"><CourseCard course={course} wish={wish} /></div>)}
        </div>
        {!edges.end && <button type="button" className="cf-row__arrow cf-row__arrow--next" onClick={() => scroll(1)} aria-label={`Scroll ${title} forward`}><i className="fas fa-chevron-right" /></button>}
      </div>
    </section>
  );
};

const FilterGroup = ({ title, children }) => (
  <fieldset className="cf-group">
    <legend>{title}</legend>
    {children}
  </fieldset>
);

/**
 * Finding a course: search, categories, filters (level, language, price, rating, duration, instructor) and sorting,
 * all kept in the address bar so a search can be shared. With nothing chosen it also shows rows of popular, new,
 * top-rated, free and discounted courses.
 */
const CourseFinder = ({ allLabel, onTotal }) => {
  const [params, setParams] = useSearchParams();
  const wish = useWishlist();
  const [facets, setFacets] = useState(null);
  const [rows, setRows] = useState(null);
  const [result, setResult] = useState({ key: null, data: null, error: false });
  const [draft, setDraft] = useState(params.get('q') || '');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const query = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) || '']).filter(([, v]) => v));
  const key = JSON.stringify(query);
  const filtering = FILTER_KEYS.some((k) => k !== 'sort' && k !== 'page' && query[k]);

  useEffect(() => {
    let live = true;
    lmsAPI.facets().then(({ data }) => {
      if (!live) return;
      setFacets(data);
      onTotal?.(data.total);
    }).catch(() => live && setFacets({ categories: [], levels: [], languages: [], instructors: [], price: {}, durations: {}, total: 0 }));
    lmsAPI.homeRows().then(({ data }) => live && setRows(data)).catch(() => live && setRows({}));
    return () => {
      live = false;
    };
  }, [onTotal]);

  useEffect(() => {
    let live = true;
    lmsAPI.catalog({ ...JSON.parse(key), page_size: 12 })
      .then(({ data }) => live && setResult({ key, data, error: false }))
      .catch(() => live && setResult({ key, data: null, error: true }));
    return () => {
      live = false;
    };
  }, [key]);

  const update = (changes) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!('page' in changes)) next.delete('page');
    setParams(next, { replace: true });
  };
  const toggleList = (k, value) => {
    const list = (params.get(k) || '').split(',').filter(Boolean);
    update({ [k]: (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]).join(',') });
  };
  const clearAll = () => {
    setDraft('');
    setParams(new URLSearchParams(), { replace: true });
  };
  const search = (e) => {
    e.preventDefault();
    update({ q: draft.trim() });
  };

  const loading = result.key !== key;
  const data = result.data;
  const category = facets?.categories.find((c) => c.slug === query.category);
  const levels = (query.level || '').split(',').filter(Boolean);
  const languages = (query.language || '').split(',').filter(Boolean);
  const activeChips = [
    query.q && ['q', `“${query.q}”`],
    category && ['category', category.name],
    query.subcategory && ['subcategory', category?.children.find((s) => s.slug === query.subcategory)?.name || query.subcategory],
    ...levels.map((l) => ['level', levelLabel(l), l]),
    ...languages.map((l) => ['language', l, l]),
    query.price && ['price', PRICES.find(([v]) => v === query.price)?.[1]],
    query.rating && ['rating', `${query.rating}★ & up`],
    query.duration && ['duration', DURATIONS.find(([v]) => v === query.duration)?.[1]],
    query.instructor && ['instructor', facets?.instructors.find((i) => String(i.id) === query.instructor)?.name || 'Instructor'],
  ].filter(Boolean);

  const filters = (
    <div className="cf-filters">
      {facets?.categories.some((c) => c.count) && (
        <FilterGroup title="Category">
          <label className="cf-option"><input type="radio" name="cf-category" checked={!query.category} onChange={() => update({ category: '', subcategory: '' })} /> {allLabel}</label>
          {facets.categories.filter((c) => c.count).map((c) => (
            <div key={c.slug}>
              <label className="cf-option">
                <input type="radio" name="cf-category" checked={query.category === c.slug} onChange={() => update({ category: c.slug, subcategory: '' })} /> {c.name} <small>({c.count})</small>
              </label>
              {query.category === c.slug && c.children.filter((s) => s.count).map((s) => (
                <label key={s.slug} className="cf-option cf-option--sub">
                  <input type="checkbox" checked={query.subcategory === s.slug} onChange={() => update({ subcategory: query.subcategory === s.slug ? '' : s.slug })} /> {s.name} <small>({s.count})</small>
                </label>
              ))}
            </div>
          ))}
        </FilterGroup>
      )}
      <FilterGroup title="Rating">
        {RATINGS.map(([value, label]) => (
          <label key={value} className="cf-option">
            <input type="radio" name="cf-rating" checked={query.rating === value} onChange={() => update({ rating: query.rating === value ? '' : value })} />
            <Stars value={Number(value)} size={12} /> {label}
          </label>
        ))}
        {query.rating && <button type="button" className="link-arrow cf-clear" onClick={() => update({ rating: '' })}>Any rating</button>}
      </FilterGroup>
      <FilterGroup title="Price">
        {PRICES.map(([value, label]) => (
          <label key={value || 'all'} className="cf-option">
            <input type="radio" name="cf-price" checked={(query.price || '') === value} onChange={() => update({ price: value })} /> {label}
            {value && facets?.price?.[value] != null && <small>({facets.price[value]})</small>}
          </label>
        ))}
      </FilterGroup>
      <FilterGroup title="Level">
        {(facets?.levels || []).filter((l) => l.count).map((l) => (
          <label key={l.value} className="cf-option">
            <input type="checkbox" checked={levels.includes(l.value)} onChange={() => toggleList('level', l.value)} /> {l.label} <small>({l.count})</small>
          </label>
        ))}
      </FilterGroup>
      <FilterGroup title="Video duration">
        {DURATIONS.map(([value, label]) => (
          <label key={value} className="cf-option">
            <input type="checkbox" checked={query.duration === value} onChange={() => update({ duration: query.duration === value ? '' : value })} /> {label}
            {facets?.durations?.[value] != null && <small>({facets.durations[value]})</small>}
          </label>
        ))}
      </FilterGroup>
      {facets?.languages.length > 1 && (
        <FilterGroup title="Language">
          {facets.languages.map((l) => (
            <label key={l.value} className="cf-option">
              <input type="checkbox" checked={languages.includes(l.value)} onChange={() => toggleList('language', l.value)} /> {l.value} <small>({l.count})</small>
            </label>
          ))}
        </FilterGroup>
      )}
      {facets?.instructors.length > 0 && (
        <FilterGroup title="Instructor">
          <select className="input" aria-label="Instructor" value={query.instructor || ''} onChange={(e) => update({ instructor: e.target.value })}>
            <option value="">Any instructor</option>
            {facets.instructors.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.count})</option>)}
          </select>
        </FilterGroup>
      )}
    </div>
  );

  return (
    <div className="cf">
      <form className="cf-search" onSubmit={search} role="search">
        <i className="fas fa-magnifying-glass" aria-hidden="true" />
        <input type="search" className="input" placeholder="Search for anything: a skill, a tool, an instructor…" aria-label="Search courses"
          value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button type="submit" className="btn btn--primary">Search</button>
      </form>

      {facets?.categories.some((c) => c.count) && (
        <div className="cf-cats" role="group" aria-label="Categories">
          <button type="button" className={`cf-cat${!query.category ? ' is-active' : ''}`} aria-pressed={!query.category} onClick={() => update({ category: '', subcategory: '' })}>{allLabel}</button>
          {facets.categories.filter((c) => c.count).map((c) => (
            <button key={c.slug} type="button" className={`cf-cat${query.category === c.slug ? ' is-active' : ''}`} aria-pressed={query.category === c.slug}
              onClick={() => update({ category: query.category === c.slug ? '' : c.slug, subcategory: '' })}>
              {c.icon && <BrandIcon name={c.icon} size={16} />} {c.name}
            </button>
          ))}
        </div>
      )}

      {!filtering && rows && (
        <div className="cf-rows">
          {ROWS.map(([k, title]) => <CourseRow key={k} title={title} courses={rows[k]} wish={wish} />)}
        </div>
      )}

      <div className="cf-layout">
        <aside className={`cf-side${filtersOpen ? ' is-open' : ''}`} aria-label="Filters">
          <div className="cf-side__head">
            <h3>Filter</h3>
            <button type="button" className="cf-side__close" onClick={() => setFiltersOpen(false)} aria-label="Close filters"><i className="fas fa-xmark" /></button>
          </div>
          {facets ? filters : <div className="skeleton skeleton--block" />}
          <div className="cf-side__foot">
            <button type="button" className="btn btn--outline btn--sm" onClick={clearAll}>Clear all</button>
            <button type="button" className="btn btn--primary btn--sm" onClick={() => setFiltersOpen(false)}>Show {data?.count ?? ''} results</button>
          </div>
        </aside>
        <button type="button" className="cf-backdrop" tabIndex={-1} aria-hidden="true" onClick={() => setFiltersOpen(false)} />

        <div className="cf-main">
          <div className="cf-bar">
            <button type="button" className="btn btn--outline btn--sm cf-filter-btn" onClick={() => setFiltersOpen(true)} aria-expanded={filtersOpen}>
              <i className="fas fa-sliders" /> Filters{activeChips.length ? ` (${activeChips.length})` : ''}
            </button>
            <p className="cat-count" aria-live="polite">
              {data ? `${data.count} ${data.count === 1 ? 'course' : 'courses'}` : 'Loading…'}{query.q && ` for “${query.q}”`}
            </p>
            <label className="cf-sort">
              <span>Sort by</span>
              <select className="input" value={query.sort || (query.q ? 'relevance' : 'popular')} onChange={(e) => update({ sort: e.target.value })}>
                {query.q && <option value="relevance">Most relevant</option>}
                {SORTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>
          {activeChips.length > 0 && (
            <div className="cf-active">
              {activeChips.map(([k, label, value]) => (
                <button key={`${k}${value || ''}`} type="button" className="cf-chip" onClick={() => {
                  if (k === 'q') setDraft('');
                  if (value && (k === 'level' || k === 'language')) toggleList(k, value);
                  else update({ [k]: '', ...(k === 'category' ? { subcategory: '' } : {}) });
                }}>
                  {label} <i className="fas fa-xmark" aria-hidden="true" /><span className="sr-only">Remove filter</span>
                </button>
              ))}
              <button type="button" className="link-arrow" onClick={clearAll}>Clear all</button>
            </div>
          )}

          {result.error && <p className="muted">Courses couldn’t be loaded right now. Please refresh the page or contact us for details.</p>}
          {loading && !data && (
            <div className="cc-grid" aria-busy="true">
              {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="cc cc--loading"><span className="skeleton skeleton--block" /></div>)}
            </div>
          )}
          {data && data.count === 0 && (
            <div className="finder-empty">
              <IconTile name="laptop" />
              <h3>No courses match that</h3>
              <p>Try a different word, or remove some filters.</p>
              <button type="button" className="btn btn--outline btn--sm" onClick={clearAll}>Show all courses</button>
            </div>
          )}
          {data && (
            <div className={`cc-grid${loading ? ' is-loading' : ''}`}>
              {data.results.map((course) => <CourseCard key={course.slug} course={course} wish={wish} />)}
            </div>
          )}
          {data && data.pages > 1 && (
            <nav className="cf-pages" aria-label="Pages">
              <button type="button" className="btn btn--outline btn--sm" disabled={data.page <= 1} onClick={() => update({ page: String(data.page - 1) })}><i className="fas fa-chevron-left" /> Previous</button>
              <span>Page {data.page} of {data.pages}</span>
              <button type="button" className="btn btn--outline btn--sm" disabled={data.page >= data.pages} onClick={() => update({ page: String(data.page + 1) })}>Next <i className="fas fa-chevron-right" /></button>
            </nav>
          )}
        </div>
      </div>
    </div>
  );
};

// The Training page: the course marketplace. Search, categories, filters and rows of popular courses; each card opens
// the course's own page, where students read about it and enrol. The wording, photos and the sections below the
// catalogue come from the editable "courses" content.
export const CoursesPage = () => {
  const site = useSite();
  const c = usePageContent('courses');
  const [total, setTotal] = useState(null);
  const t = (text) => fill(text, { ...site, count: total ?? '…' });

  return (
    <>
      <PageHero
        eyebrow={c.hero.eyebrow}
        title={c.hero.title}
        background={c.hero.image || undefined}
        art={<div className="art-frame art-frame--dark"><TrainingArt /></div>}
        actions={
          <>
            {c.hero.primaryLabel && (
              <a href="#programmes" className="btn btn--primary">
                <i className="fas fa-graduation-cap" /> {c.hero.primaryLabel}
              </a>
            )}
            {c.hero.secondaryLabel && (
              <a href={telHref(site.phones[0])} className="btn btn--ghost-light">
                <i className="fas fa-phone" /> {c.hero.secondaryLabel}
              </a>
            )}
          </>
        }
      >
        {c.hero.lead}
      </PageHero>

      <section className="section" id="programmes">
        <div className="container">
          <SectionHeading eyebrow={c.programmes.eyebrow} title={c.programmes.title}>
            {c.programmes.intro}
          </SectionHeading>

          <CourseFinder allLabel={c.programmes.allLabel} onTotal={setTotal} />
        </div>
      </section>

      {c.stats.length > 0 && (
        <section className="train-stats" aria-label="Training at a glance">
          <div className="container train-stats__inner" style={{ gridTemplateColumns: `repeat(${Math.min(c.stats.length, 4)}, 1fr)` }}>
            {c.stats.map((s) => (
              <div key={s.label}><strong>{t(s.value)}</strong><span>{s.label}</span></div>
            ))}
          </div>
        </section>
      )}

      {c.reasons.items.length > 0 && (
        <section className="section section--surface">
          <div className="container">
            <SectionHeading eyebrow={c.reasons.eyebrow} title={c.reasons.title} center />
            <div className="grid grid-4">
              {c.reasons.items.map((r) => (
                <div key={r.title} className="card card--hover">
                  <IconTile name={r.icon} />
                  <h3>{r.title}</h3>
                  <p className="muted">{r.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {c.how.steps.length > 0 && (
        <section className="section">
          <div className="container train-how">
            <SectionHeading eyebrow={c.how.eyebrow} title={c.how.title}>
              {c.how.intro}
            </SectionHeading>
            <ol className="timeline">
              {c.how.steps.map((step, i) => (
                <li key={step.title}>
                  <span className="timeline__num">{i + 1}</span>
                  <div>
                    <h4>{step.title}</h4>
                    <p>{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {c.formats.items.length > 0 && (
        <section className="section section--surface">
          <div className="container">
            <SectionHeading eyebrow={c.formats.eyebrow} title={c.formats.title} center />
            <div className="grid grid-3">
              {c.formats.items.map((f) => (
                <div key={f.title} className="card">
                  <IconTile name={f.icon} />
                  <h3>{f.title}</h3>
                  <p className="muted">{f.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {c.faqs.items.length > 0 && (
        <section className="section">
          <div className="container train-faq">
            <SectionHeading eyebrow={c.faqs.eyebrow} title={c.faqs.title} />
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
        </section>
      )}

      <CtaBand title={c.cta.title} text={c.cta.text} />
    </>
  );
};

export default CoursesPage;

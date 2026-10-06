import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { blogAPI } from '../../services/api';
import { usePageContent } from '../../content/useContent';
import { assetUrl } from '../../utils/assets';
import PostCard from '../../components/blog/PostCard';
import BlogNewsletter from '../../components/blog/BlogNewsletter';
import '../../styles/blog.css';

/** /blog — the featured article, category filters, search and the article grid. */
export const BlogPage = () => {
  const { hero, labels } = usePageContent('blog');
  const [params, setParams] = useSearchParams();
  const category = params.get('category') || '';
  const q = params.get('q') || '';
  const [query, setQuery] = useState(q);
  const [categories, setCategories] = useState([]);
  const [data, setData] = useState(null); // {featured, results, page, pages, count}
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    blogAPI.categories().then(({ data: d }) => setCategories(d)).catch(() => {});
  }, []);

  useEffect(() => {
    let live = true;
    blogAPI.posts({ category: category || undefined, q: q || undefined })
      .then(({ data: d }) => live && setData(d))
      .catch(() => live && setData({ featured: null, results: [], page: 1, pages: 1, count: 0 }));
    return () => {
      live = false;
    };
  }, [category, q]);

  const setFilter = (next) => {
    const merged = { category, q, ...next };
    setParams(Object.fromEntries(Object.entries(merged).filter(([, v]) => v)), { replace: true });
  };
  const search = (e) => {
    e.preventDefault();
    setFilter({ q: query.trim() });
  };
  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const { data: d } = await blogAPI.posts({ category: category || undefined, q: q || undefined, page: data.page + 1 });
      setData((cur) => ({ ...d, featured: cur.featured, results: [...cur.results, ...d.results] }));
    } finally {
      setLoadingMore(false);
    }
  };

  const filtered = Boolean(category || q);
  const empty = data && !data.featured && data.results.length === 0;
  const showHero = Boolean(data?.featured) && data.results.length >= 3;
  const gridPosts = data ? (showHero || !data.featured ? data.results : [data.featured, ...data.results]) : [];
  return (
    <div className="blog">
      <header className={`blog-head${hero.image ? ' blog-head--photo' : ''}`}>
        <div className="blog-head__banner" style={hero.image ? { '--hero-photo': `url("${assetUrl(hero.image)}")` } : undefined}>
          <div className="container blog-head__inner">
            <div>
              {hero.eyebrow && <p className="blog-head__eyebrow">{hero.eyebrow}</p>}
              <h1>{hero.title}</h1>
              {hero.lead && <p className="blog-head__lead">{hero.lead}</p>}
            </div>
            <form className="blog-search" role="search" onSubmit={search}>
              <i className="fas fa-magnifying-glass" aria-hidden="true" />
              <label htmlFor="blog-search" className="sr-only">{labels.search}</label>
              <input id="blog-search" type="search" placeholder={labels.search} value={query} onChange={(e) => setQuery(e.target.value)} />
            </form>
          </div>
        </div>
        {categories.length > 0 && (
          <nav className="container blog-tabs" aria-label="Categories">
            <button type="button" className={`blog-tab${!category ? ' is-active' : ''}`} aria-pressed={!category} onClick={() => setFilter({ category: '' })}>{labels.allPosts}</button>
            {categories.map((c) => (
              <button key={c.slug} type="button" className={`blog-tab${category === c.slug ? ' is-active' : ''}`} aria-pressed={category === c.slug}
                onClick={() => setFilter({ category: c.slug })}>{c.name}</button>
            ))}
          </nav>
        )}
      </header>

      <div className="container blog-body">
        {!data && <div className="blog-skeleton" aria-label="Loading articles">{[0, 1, 2].map((i) => <span key={i} />)}</div>}
        {empty && (
          <div className="blog-empty">
            <i className="fas fa-newspaper" aria-hidden="true" />
            <p>{filtered ? labels.noResults : labels.empty}</p>
            {filtered && <button type="button" className="btn btn--outline btn--sm" onClick={() => { setQuery(''); setFilter({ category: '', q: '' }); }}>{labels.allPosts}</button>}
          </div>
        )}
        {q && data && !empty && <p className="blog-results">{data.count} result{data.count === 1 ? '' : 's'} for “{q}”</p>}
        {/* The wide "featured" card only when there are enough other articles to follow it; otherwise every
            article is a regular card, so one or two posts never turn into a page-wide banner */}
        {showHero && <PostCard post={data.featured} featured label={labels.featured} />}
        {gridPosts.length > 0 && (
          <>
            <div className="blog-section-head">
              <h2>{filtered ? 'Articles' : 'Latest articles'}</h2>
              <span>{data.count || gridPosts.length} article{(data.count || gridPosts.length) === 1 ? '' : 's'}</span>
            </div>
            <div className="blog-grid">
              {gridPosts.map((post) => <PostCard key={post.id} post={post} />)}
            </div>
          </>
        )}
        {data && data.page < data.pages && (
          <div className="blog-more">
            <button type="button" className="btn btn--outline" onClick={loadMore} disabled={loadingMore}>
              {loadingMore && <span className="btn-spinner" />} {labels.loadMore}
            </button>
          </div>
        )}
        <BlogNewsletter title={labels.newsletterTitle} text={labels.newsletterText} />
      </div>
    </div>
  );
};

export default BlogPage;

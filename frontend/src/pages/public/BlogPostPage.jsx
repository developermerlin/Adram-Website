import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { blogAPI } from '../../services/api';
import { usePageContent, useSite } from '../../content/useContent';
import { outline, parseBlocks } from '../../utils/markdown';
import { assetUrl } from '../../utils/assets';
import { formatDate } from '../../utils/format';
import Markdown from '../../components/blog/Markdown';
import PostCard from '../../components/blog/PostCard';
import { Spinner } from '../../components/ui/Section';
import { NotFoundPage } from './StatusPages';
import '../../styles/blog.css';

/** The thin bar at the top that fills as the reader scrolls through the article. */
const ReadingProgress = () => {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const article = document.querySelector('.post-article');
      if (!article) return;
      const { top, height } = article.getBoundingClientRect();
      setProgress(Math.min(1, Math.max(0, -top / Math.max(1, height - window.innerHeight))));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return <div className="post-progress" style={{ transform: `scaleX(${progress})` }} aria-hidden="true" />;
};

const Share = ({ title, label, vertical = false }) => {
  const url = window.location.href;
  const enc = encodeURIComponent;
  const links = [
    ['LinkedIn', 'fab fa-linkedin-in', `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`],
    ['X', 'fab fa-x-twitter', `https://twitter.com/intent/tweet?url=${enc(url)}&text=${enc(title)}`],
    ['Facebook', 'fab fa-facebook-f', `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`],
    ['WhatsApp', 'fab fa-whatsapp', `https://wa.me/?text=${enc(`${title} ${url}`)}`],
  ];
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy the link');
    }
  };
  const native = typeof navigator !== 'undefined' && navigator.share;
  return (
    <div className={`post-share${vertical ? ' post-share--vertical' : ''}`} aria-label={label}>
      <span className="post-share__label">{label}</span>
      {native && !vertical && (
        <button type="button" className="post-share__btn post-share__native" onClick={() => navigator.share({ title, url }).catch(() => {})} aria-label="Share" title="Share">
          <i className="fas fa-share-nodes" aria-hidden="true" />
        </button>
      )}
      {links.map(([name, icon, href]) => (
        <a key={name} href={href} target="_blank" rel="noopener noreferrer" className="post-share__btn" aria-label={`Share on ${name}`} title={`Share on ${name}`}>
          <i className={icon} aria-hidden="true" />
        </a>
      ))}
      <button type="button" className="post-share__btn" onClick={copy} aria-label="Copy link" title="Copy link"><i className="fas fa-link" aria-hidden="true" /></button>
    </div>
  );
};

const TEXT_SIZES = ['sm', 'md', 'lg'];
const readSize = () => {
  try { return TEXT_SIZES.includes(localStorage.getItem('blog-text')) ? localStorage.getItem('blog-text') : 'md'; } catch { return 'md'; }
};

/** Reader tools beside the article: text size and print. */
const ReaderTools = ({ size, setSize }) => (
  <div className="post-tools" role="group" aria-label="Reading options">
    <span className="post-share__label">Text</span>
    {TEXT_SIZES.map((s) => (
      <button key={s} type="button" className={`post-tools__size post-tools__size--${s}${size === s ? ' is-active' : ''}`} aria-pressed={size === s}
        aria-label={{ sm: 'Smaller text', md: 'Normal text', lg: 'Larger text' }[s]} onClick={() => setSize(s)}>A</button>
    ))}
    <button type="button" className="post-share__btn" onClick={() => window.print()} aria-label="Print this article" title="Print or save as PDF">
      <i className="fas fa-print" aria-hidden="true" />
    </button>
  </div>
);

/** "Was this article helpful?" One vote per reader; they can change it. */
const Helpful = ({ slug, initial }) => {
  const key = `blog-helpful-${slug}`;
  const [vote, setVote] = useState(() => {
    try { const v = localStorage.getItem(key); return v === null ? null : v === '1'; } catch { return null; }
  });
  const [counts, setCounts] = useState(initial || { yes: 0, no: 0 });
  const send = async (helpful) => {
    if (vote === helpful) return;
    setVote(helpful);
    try {
      const { data } = await blogAPI.feedback(slug, helpful);
      setCounts({ yes: data.yes, no: data.no });
      try { localStorage.setItem(key, helpful ? '1' : '0'); } catch { /* private mode */ }
    } catch {
      setVote(null);
      toast.error('Your answer couldn’t be saved. Please try again.');
    }
  };
  const total = counts.yes + counts.no;
  return (
    <section className="post-helpful" aria-label="Feedback">
      <p className="post-helpful__q">{vote === null ? 'Was this article helpful?' : 'Thanks for your feedback.'}</p>
      <div className="post-helpful__btns">
        <button type="button" className={`post-helpful__btn${vote === true ? ' is-on' : ''}`} aria-pressed={vote === true} onClick={() => send(true)}>
          <i className="far fa-thumbs-up" aria-hidden="true" /> Yes
        </button>
        <button type="button" className={`post-helpful__btn${vote === false ? ' is-on' : ''}`} aria-pressed={vote === false} onClick={() => send(false)}>
          <i className="far fa-thumbs-down" aria-hidden="true" /> No
        </button>
      </div>
      {total > 0 && <p className="post-helpful__count">{Math.round((counts.yes / total) * 100)}% of {total} reader{total === 1 ? '' : 's'} found this helpful</p>}
    </section>
  );
};

/** Search engines: the article as structured data (headline, dates, author, picture). */
const ArticleSchema = ({ post, siteName }) => {
  const data = {
    '@context': 'https://schema.org', '@type': 'BlogPosting', headline: post.title, description: post.excerpt || undefined,
    datePublished: post.published_at, dateModified: post.updated_at, author: { '@type': 'Person', name: post.author.name },
    publisher: { '@type': 'Organization', name: siteName }, image: post.cover ? new URL(assetUrl(post.cover), window.location.origin).href : undefined,
    mainEntityOfPage: window.location.href,
  };
  return <script type="application/ld+json">{JSON.stringify(data)}</script>;
};

/** "On this page": the article's sections, with the one being read highlighted. */
const Contents = ({ items, label }) => {
  const [active, setActive] = useState(items[0]?.id);
  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter(Boolean);
    const watch = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setActive(visible[0].target.id);
    }, { rootMargin: '-90px 0px -65% 0px' });
    els.forEach((el) => watch.observe(el));
    return () => watch.disconnect();
  }, [items]);
  return (
    <nav className="post-toc" aria-label={label}>
      <p className="post-toc__title">{label}</p>
      <ol>
        {items.map((i) => (
          <li key={i.id}><a href={`#${i.id}`} className={active === i.id ? 'is-active' : ''}>{i.text}</a></li>
        ))}
      </ol>
    </nav>
  );
};

/** /blog/:slug — one article. */
export const BlogPostPage = () => {
  const { slug } = useParams();
  const { labels } = usePageContent('blog');
  const site = useSite();
  const [state, setState] = useState({ slug: null, post: null, missing: false }); // `slug`: which article this is
  const [size, setSizeState] = useState(readSize);
  const setSize = (s) => { setSizeState(s); try { localStorage.setItem('blog-text', s); } catch { /* private mode */ } };

  useEffect(() => {
    let live = true;
    blogAPI.post(slug).then(({ data }) => live && setState({ slug, post: data, missing: false }))
      .catch(() => live && setState({ slug, post: null, missing: true }));
    return () => {
      live = false;
    };
  }, [slug]);

  const current = state.slug === slug; // while another article loads, show the spinner, not the old one
  const post = current ? state.post : null;
  const missing = current && state.missing;
  const blocks = useMemo(() => (post ? parseBlocks(post.body) : []), [post]);
  const toc = useMemo(() => outline(blocks), [blocks]);

  useEffect(() => {
    if (!post) return undefined;
    const before = document.title;
    document.title = `${post.seo_title || post.title} | ${site.name}`;
    const tag = document.querySelector('meta[name="description"]');
    const oldDescription = tag?.content;
    if (tag) tag.content = post.seo_description || post.excerpt || oldDescription;
    return () => {
      document.title = before;
      if (tag && oldDescription !== undefined) tag.content = oldDescription;
    };
  }, [post, site.name]);

  if (missing) return <NotFoundPage />;
  if (!post) return <Spinner label="Loading article…" />;
  // "Updated" only when it was edited a day or more after publishing
  const updated = post.updated_at && new Date(post.updated_at) - new Date(post.published_at) > 86400000;

  const first = post.author.name.split(' ')[0];
  return (
    <div className="post post--v3">
      <ReadingProgress />
      <ArticleSchema post={post} siteName={site.name} />

      <header className="pv-head">
        <nav className="pv-crumbs" aria-label="Breadcrumb">
          <Link to="/blog">Blog</Link>
          {post.category && <><span aria-hidden="true">/</span><Link to={`/blog?category=${post.category.slug}`}>{post.category.name}</Link></>}
        </nav>
        <h1>{post.title}</h1>
        {post.excerpt && <p className="pv-dek">{post.excerpt}</p>}
        <div className="pv-meta">
          {post.author.avatar
            ? <img src={assetUrl(post.author.avatar)} alt="" className="pv-meta__avatar" />
            : <span className="pv-meta__avatar pv-meta__avatar--initial" aria-hidden="true">{post.author.name.charAt(0)}</span>}
          <span className="pv-meta__name">{post.author.name}</span>
          <span className="pv-meta__dot" aria-hidden="true" />
          <time dateTime={post.published_at}>{formatDate(post.published_at)}</time>
          <span className="pv-meta__dot" aria-hidden="true" />
          <span>{post.reading_minutes} min read</span>
          {post.views > 0 && <><span className="pv-meta__dot" aria-hidden="true" /><span>{post.views.toLocaleString()} view{post.views === 1 ? '' : 's'}</span></>}
        </div>
        {updated && <p className="pv-updated">Updated {formatDate(post.updated_at)}</p>}
      </header>

      {post.cover && (
        <figure className="pv-cover">
          <img src={assetUrl(post.cover)} alt={post.cover_alt || ''} />
        </figure>
      )}

      <div className="pv-body">
        <aside className="pv-rail" aria-label={labels.share}>
          <div className="pv-rail__inner"><Share title={post.title} label={labels.share} vertical /></div>
        </aside>
        {toc.length >= 2 && (
          <aside className="pv-toc"><div className="pv-rail__inner"><Contents items={toc} label={labels.onThisPage} /></div></aside>
        )}

        <div className="pv-toolbar">
          <div className="pv-toolbar__share"><Share title={post.title} label={labels.share} /></div>
          <ReaderTools size={size} setSize={setSize} />
        </div>

        {toc.length >= 2 && (
          <details className="post-toc-mobile">
            <summary><i className="fas fa-list" aria-hidden="true" /> {labels.onThisPage}</summary>
            <ol>{toc.map((i) => <li key={i.id}><a href={`#${i.id}`}>{i.text}</a></li>)}</ol>
          </details>
        )}

        <article className={`post-article prose prose--${size}`}>
          <Markdown blocks={blocks} />
        </article>

        {post.tags.length > 0 && (
          <ul className="post-tags" aria-label="Tags">
            {post.tags.map((t) => <li key={t}><Link to={`/blog?q=${encodeURIComponent(t)}`}>#{t}</Link></li>)}
          </ul>
        )}

        <Helpful slug={post.slug} initial={post.helpful} />

        <aside className="pv-author">
          {post.author.avatar
            ? <img src={assetUrl(post.author.avatar)} alt="" />
            : <span className="pv-author__initial" aria-hidden="true">{post.author.name.charAt(0)}</span>}
          <div>
            <p className="pv-author__label">{labels.writtenBy}</p>
            <p className="pv-author__name">{post.author.name}</p>
            {post.author.title && <p className="pv-author__title">{post.author.title}</p>}
            <Link to={`/blog?q=${encodeURIComponent(post.author.name)}`} className="pv-author__more">More from {first} <i className="fas fa-arrow-right" aria-hidden="true" /></Link>
          </div>
        </aside>

        {(post.older || post.newer) && (
          <nav className="post-pager" aria-label="More articles">
            {post.older ? <Link to={`/blog/${post.older.slug}`} className="post-pager__link"><span><i className="fas fa-arrow-left" aria-hidden="true" /> Previous</span>{post.older.title}</Link> : <span />}
            {post.newer && <Link to={`/blog/${post.newer.slug}`} className="post-pager__link post-pager__link--next"><span>Next <i className="fas fa-arrow-right" aria-hidden="true" /></span>{post.newer.title}</Link>}
          </nav>
        )}
      </div>

      {post.related.length > 0 && (
        <section className="post-related">
          <div className="container">
            <div className="blog-section-head"><h2>{labels.related}</h2><Link to="/blog">All articles</Link></div>
            <div className="blog-grid">{post.related.map((r) => <PostCard key={r.id} post={r} />)}</div>
          </div>
        </section>
      )}
      <div className="container post-back"><Link to="/blog" className="btn btn--outline"><i className="fas fa-arrow-left" /> Back to all articles</Link></div>
    </div>
  );
};

export default BlogPostPage;

import { Link } from 'react-router-dom';
import { assetUrl } from '../../utils/assets';
import { formatDate } from '../../utils/format';

/** The picture of a post, or a calm branded placeholder when it has none. */
export const Cover = ({ post, className = '' }) => (
  post.cover
    ? <img className={`blog-cover ${className}`} src={assetUrl(post.cover)} alt={post.cover_alt || ''} loading="lazy" />
    : (
      <span className={`blog-cover blog-cover--empty ${className}`} aria-hidden="true">
        <i className="fas fa-pen-nib" />
      </span>
    )
);

export const Byline = ({ post, compact = false }) => (
  <div className={`blog-byline${compact ? ' blog-byline--compact' : ''}`}>
    {post.author.avatar
      ? <img src={assetUrl(post.author.avatar)} alt="" className="blog-byline__avatar" />
      : <span className="blog-byline__avatar blog-byline__avatar--initial" aria-hidden="true">{post.author.name.charAt(0)}</span>}
    <span className="blog-byline__text">
      <span className="blog-byline__name">{post.author.name}</span>
      <span className="blog-byline__meta">
        <time dateTime={post.published_at}>{formatDate(post.published_at)}</time> · {post.reading_minutes} min read
      </span>
    </span>
  </div>
);

/** One article in the blog grid. `featured` is the large card at the top of the blog page. */
export const PostCard = ({ post, featured = false, label }) => (
  <article className={`blog-card${featured ? ' blog-card--featured' : ''}`}>
    <Link to={`/blog/${post.slug}`} className="blog-card__media" tabIndex={-1} aria-hidden="true">
      <Cover post={post} />
    </Link>
    <div className="blog-card__body">
      <p className="blog-card__eyebrow">
        {featured && label && <span className="blog-card__flag">{label}</span>}
        {post.category && <span>{post.category.name}</span>}
      </p>
      <h3 className="blog-card__title"><Link to={`/blog/${post.slug}`}>{post.title}</Link></h3>
      {post.excerpt && <p className="blog-card__excerpt">{post.excerpt}</p>}
      <div className="blog-card__foot">
        <Byline post={post} compact />
        <Link to={`/blog/${post.slug}`} className="blog-card__read" aria-label={`Read ${post.title}`}>Read <i className="fas fa-arrow-right" aria-hidden="true" /></Link>
      </div>
    </div>
  </article>
);

export default PostCard;

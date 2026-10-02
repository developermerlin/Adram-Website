import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { lmsAPI } from '../../services/api';
import { assetUrl } from '../../utils/assets';
import { formatDuration } from '../../utils/lms';
import PremiumMark from './PremiumMark';
import Stars from './Stars';

const fmt = new Intl.NumberFormat();
const plural = (n, one, many) => `${fmt.format(n)} ${n === 1 ? one : many}`;

/** Clips long content to `height` pixels with a fade and a "Show more" button, like Udemy's course page. */
export const ShowMore = ({ height = 280, children, className = '' }) => {
  const inner = useRef(null);
  const [tall, setTall] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const node = inner.current;
    if (!node || typeof ResizeObserver === 'undefined') return undefined;
    const watch = new ResizeObserver(() => setTall(node.scrollHeight > height + 48));
    watch.observe(node);
    return () => watch.disconnect();
  }, [height]);
  const clipped = tall && !open;
  return (
    <div className={`cd-more${clipped ? ' is-clipped' : ''} ${className}`}>
      <div ref={inner} className="cd-more__inner" style={clipped ? { maxHeight: height } : undefined}>{children}</div>
      {tall && (
        <button type="button" className="cd-more__toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? 'Show less' : 'Show more'} <i className={`fas fa-chevron-${open ? 'up' : 'down'}`} aria-hidden="true" />
        </button>
      )}
    </div>
  );
};

/** "French [Auto], Krio [Auto], 23 more": the first two caption languages, then the rest on request. */
export const Captions = ({ languages }) => {
  const [all, setAll] = useState(false);
  if (!languages?.length) return null;
  const shown = all ? languages : languages.slice(0, 2);
  const rest = languages.length - shown.length;
  return (
    <li className="cd-captions">
      <i className="far fa-closed-captioning" aria-hidden="true" />
      <span>
        {shown.join(', ')}
        {rest > 0 && <>, <button type="button" className="cd-captions__more" onClick={() => setAll(true)}>{rest} more</button></>}
      </span>
    </li>
  );
};

/** The white bar under the title of a Premium course: the badge, the admin's note, the rating and the learners. */
export const PremiumBar = ({ note, stats }) => (
  <div className="cd-pbar">
    <div className="cd-pbar__badge">
      <span className="cd-pbar__tile"><PremiumMark size={26} className="cd-pbar__mark" /><b>Premium</b></span>
      {note && <p>{note}</p>}
    </div>
    <a href="#reviews" className="cd-pbar__stat">
      {stats.rating_count > 0 ? (
        <>
          <strong>{Number(stats.rating_average).toFixed(1)}</strong>
          <Stars value={stats.rating_average} size={12} />
          <small>{plural(stats.rating_count, 'rating', 'ratings')}</small>
        </>
      ) : (
        <><strong>New</strong><small>No ratings yet</small></>
      )}
    </a>
    <div className="cd-pbar__stat">
      <i className="fas fa-user-group" aria-hidden="true" />
      <strong>{fmt.format(stats.student_count || 0)}</strong>
      <small>{stats.student_count === 1 ? 'learner' : 'learners'}</small>
    </div>
  </div>
);

/** Topic chips under "What you'll learn": the course's topics, its subcategory and category. */
export const RelatedTopics = ({ course }) => {
  const chips = [
    ...(course.topic_links || []).map((t) => ({ label: t.name, to: `/topics/${t.slug}` })),
    course.subcategory && course.category && { label: course.subcategory.name, to: `/courses?category=${course.category.slug}&subcategory=${course.subcategory.slug}` },
    course.category && { label: course.category.name, to: `/courses?category=${course.category.slug}` },
  ].filter(Boolean);
  if (!chips.length) return null;
  return (
    <section className="cd-section">
      <h2>Explore related topics</h2>
      <div className="cd-topics">{chips.map((c) => <Link key={c.label} to={c.to} className="cd-topic">{c.label}</Link>)}</div>
    </section>
  );
};

const ICONS = [
  [/mobile|phone|tv|device|computer/i, 'fa-mobile-screen'],
  [/caption|subtitle/i, 'fa-closed-captioning'],
  [/certificate/i, 'fa-trophy'],
  [/download|resource/i, 'fa-download'],
  [/article|reading/i, 'fa-newspaper'],
  [/exercise|coding|practi[cs]e/i, 'fa-code'],
  [/lifetime|forever|access/i, 'fa-infinity'],
  [/audio|podcast/i, 'fa-headphones'],
  [/support|question|mentor/i, 'fa-comments'],
];
const iconFor = (text) => ICONS.find(([re]) => re.test(text))?.[1] || 'fa-circle-check';

/** "This course includes": lines worked out from the lessons, then the admin's own lines. */
export const CourseIncludes = ({ course, totals, lessons }) => {
  const articles = lessons.filter((l) => l.kind === 'text').length;
  const downloads = (totals.documents || 0) + (totals.resources || 0);
  const extras = course.includes?.length ? course.includes : ['Learn on your phone or computer', 'Certificate of completion'];
  const rows = [
    totals.seconds > 0 && ['fa-circle-play', `${formatDuration(totals.seconds)} on-demand video`],
    articles > 0 && ['fa-newspaper', plural(articles, 'article', 'articles')],
    totals.quizzes > 0 && ['fa-circle-question', plural(totals.quizzes, 'quiz', 'quizzes')],
    totals.assignments > 0 && ['fa-file-pen', plural(totals.assignments, 'assignment', 'assignments')],
    downloads > 0 && ['fa-download', plural(downloads, 'downloadable resource', 'downloadable resources')],
    ...extras.map((text) => [iconFor(text), text]),
  ].filter(Boolean);
  return (
    <section className="cd-section">
      <h2>This course includes:</h2>
      <ul className="cd-incl">{rows.map(([icon, text]) => <li key={text}><i className={`fas ${icon}`} aria-hidden="true" /> {text}</li>)}</ul>
    </section>
  );
};

/** The admin's highlighted box, like Udemy's "Coding Exercises". */
export const FeatureBox = ({ feature }) => {
  if (!feature?.title) return null;
  const internal = feature.link_url?.startsWith('/');
  return (
    <section className={`cd-feature${feature.image ? '' : ' cd-feature--text'}`}>
      <div className="cd-feature__text">
        <h2>{feature.title}</h2>
        {feature.text && <p>{feature.text}</p>}
        {feature.link_url && (internal
          ? <Link to={feature.link_url}>{feature.link_label || 'Learn more'}</Link>
          : <a href={feature.link_url} target="_blank" rel="noopener noreferrer">{feature.link_label || 'Learn more'}</a>)}
      </div>
      {feature.image && <img src={assetUrl(feature.image)} alt="" loading="lazy" />}
    </section>
  );
};

/**
 * The video at the top of the buy box, ready to play: the course trailer if it has one, otherwise a video lesson
 * this person may watch (where they left off, else a free preview, else the first video). `children` is the
 * picture, shown while the video loads or when there is nothing to play. Watching here doesn't move their place.
 */
export const CourseVideo = ({ course, lessons, resumeId, poster, children }) => {
  const videos = lessons.filter((l) => l.kind === 'video' && !l.locked);
  const pick = videos.find((l) => l.id === resumeId) || videos.find((l) => l.is_preview) || videos[0] || null;
  const pickId = course.promo_embed_url ? null : pick?.id;
  const [video, setVideo] = useState(null);
  useEffect(() => {
    if (!pickId) return undefined;
    let live = true;
    lmsAPI.lesson(pickId, { peek: 1 }).then(({ data }) => live && data.video && setVideo({ ...data.video, id: pickId })).catch(() => {});
    return () => {
      live = false;
    };
  }, [pickId]);

  if (course.promo_embed_url) {
    return <iframe src={course.promo_embed_url} title={`${course.title} trailer`} allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen />;
  }
  if (!video || video.id !== pickId) return children;
  const label = pick.id === resumeId ? 'Continue' : pick.is_preview && !resumeId ? 'Free preview' : 'Lesson';
  return (
    <>
      {video.type === 'embed'
        ? <iframe src={video.url} title={pick.title} allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
        : <video src={video.url} poster={poster} controls preload="metadata" playsInline controlsList="nodownload" />}
      <span className="cd-card__caption"><i className="fas fa-circle-play" aria-hidden="true" /> {label}: {pick.title}</span>
    </>
  );
};

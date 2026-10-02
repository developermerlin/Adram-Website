import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { instructorName, levelLabel } from './courseUtils';

const fmt = new Intl.NumberFormat();
// The trailer plays silently in the preview, like Udemy's (the course page has the full player)
const muted = (url) => {
  const join = url.includes('?') ? '&' : '?';
  return url.includes('vimeo') ? `${url}${join}autoplay=1&muted=1&background=1` : `${url}${join}autoplay=1&mute=1&controls=0&playsinline=1`;
};

const WIDTH = 340;
const GAP = 14;
const OPEN_DELAY = 350;
const CLOSE_DELAY = 150;
const canHover = () => typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (min-width: 1024px)').matches;

const updatedLabel = (date) => (date ? new Date(date).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : '');
const lengthLabel = (seconds) => {
  const hours = Math.round((seconds || 0) / 360) / 10;
  if (hours >= 1) return `${hours} total hours`;
  const minutes = Math.round((seconds || 0) / 60);
  return minutes ? `${minutes} min total` : '';
};

/**
 * Udemy's hover preview: a box beside a course card with the updated date, length, level, subtitle, the first
 * "What you'll learn" points and the card's buy button and heart. Desktop mouse only; drawn in a portal so the
 * sideways-scrolling rows don't clip it. `children` is the card; `action` and `heart` come from the card.
 */
const CoursePopover = ({ course, action, heart, children }) => {
  const anchor = useRef(null);
  const timer = useRef(0);
  const [place, setPlace] = useState(null);

  const clear = () => window.clearTimeout(timer.current);
  const close = useCallback(() => { clear(); timer.current = window.setTimeout(() => setPlace(null), CLOSE_DELAY); }, []);
  const open = () => {
    if (!canHover()) return;
    clear();
    timer.current = window.setTimeout(() => {
      const box = anchor.current?.getBoundingClientRect();
      if (!box) return;
      const right = box.right + GAP + WIDTH <= window.innerWidth - 8;
      const left = right ? box.right + GAP : Math.max(8, box.left - GAP - WIDTH);
      setPlace({ left, top: Math.max(8, box.top), side: right ? 'right' : 'left' });
    }, OPEN_DELAY);
  };

  useEffect(() => {
    if (!place) return undefined;
    const hide = () => setPlace(null);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => { window.removeEventListener('scroll', hide, true); window.removeEventListener('resize', hide); };
  }, [place]);
  useEffect(() => clear, []);

  const facts = [lengthLabel(course.stats?.total_seconds), course.level && levelLabel(course.level)]
    .filter(Boolean);
  const points = (course.learn_points || []).slice(0, 3);
  const stats = course.stats || {};

  return (
    <div ref={anchor} className="uc-anchor" onPointerEnter={open} onPointerLeave={close}>
      {children}
      {place && createPortal(
        <div className={`uc-pop uc-pop--${place.side}`} style={{ left: place.left, top: place.top, width: WIDTH }}
          onPointerEnter={clear} onPointerLeave={close} role="dialog" aria-label={course.title}>
          {course.promo_embed_url && (
            <div className="uc-pop__trailer">
              <iframe src={muted(course.promo_embed_url)} title={`${course.title} trailer`} allow="autoplay; encrypted-media" tabIndex={-1} />
            </div>
          )}
          <h4 className="uc-pop__title">{course.title}</h4>
          <p className="uc-pop__by">By {instructorName(course)}</p>
          {(stats.rating_count > 0 || stats.student_count > 0) && (
            <p className="uc-pop__rating">
              {stats.rating_count > 0 && <><b>{Number(stats.rating_average).toFixed(1)}</b> <i className="fas fa-star" aria-hidden="true" /> ({fmt.format(stats.rating_count)} {stats.rating_count === 1 ? 'rating' : 'ratings'})</>}
              {stats.rating_count > 0 && stats.student_count > 0 && ' · '}
              {stats.student_count > 0 && `${fmt.format(stats.student_count)} ${stats.student_count === 1 ? 'student' : 'students'}`}
            </p>
          )}
          {course.updated_at && <p className="uc-pop__updated">Updated <b>{updatedLabel(course.updated_at)}</b></p>}
          {facts.length > 0 && <p className="uc-pop__facts">{facts.join(' · ')}</p>}
          {(course.subtitle || course.summary) && <p className="uc-pop__sub">{course.subtitle || course.summary}</p>}
          {points.length > 0 && (
            <ul className="uc-pop__learn">
              {points.map((p) => <li key={p}><i className="fas fa-check" aria-hidden="true" />{p}</li>)}
            </ul>
          )}
          <div className="uc-pop__buy">{action}{heart}</div>
        </div>,
        document.body,
      )}
    </div>
  );
};

export default CoursePopover;

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { parseApiErrors, shopAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { assetUrl } from '../../utils/assets';
import BrandIcon from '../brand/BrandIcon';
import { cartChanged } from './cartStore';
import CoursePopover from './CoursePopover';
import PremiumMark from './PremiumMark';
import { useLibrary } from './libraryStore';
import { HIGHLIGHT_LABELS, instructorName, isPaid, onSale, salePrice, shortMoney, useCourseImage } from './courseUtils';
import '../../styles/marketplace.css';

const fmt = new Intl.NumberFormat();

/**
 * A course in the catalogue, like a Udemy card: picture with the Premium badge and a heart, title, instructor,
 * the Bestseller-style label, type and rating, the number of ratings, the price and "Add to cart".
 * The badges come from the course (set by administrators). `preview` draws it without links or actions (course editor).
 */
export const CourseCard = ({ course, progress, wish, preview = false }) => {
  const imageOf = useCourseImage();
  const image = imageOf(course);
  const { user } = useAuth();
  const library = useLibrary();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const { stats = {} } = course;
  const saved = wish?.has(course.slug);
  const to = `/courses/${course.slug}`;
  const paid = isPaid(course);

  const addToCart = async () => {
    setBusy(true);
    try {
      await shopAPI.addToCart(course.slug);
      cartChanged();
      toast.success('Added to your cart');
    } catch (err) {
      toast.error(parseApiErrors(err).form || 'This course could not be added to your cart.');
    } finally {
      setBusy(false);
    }
  };

  let action;
  if (preview) action = <span className="uc__btn">{paid ? 'Add to cart' : 'Enroll now'}</span>;
  else if (library.owned.includes(course.slug)) action = <Link to={to} className="uc__btn uc__btn--done">Go to course</Link>;
  else if (library.teaching.includes(course.slug) || (user && user.role !== 'STUDENT')) action = <Link to={to} className="uc__btn">View course</Link>;
  else if (!paid) action = <Link to={to} className="uc__btn">Enroll now</Link>;
  else if (library.cart.includes(course.slug)) action = <Link to="/cart" className="uc__btn uc__btn--done">Go to cart</Link>;
  else if (!user) action = <button type="button" className="uc__btn" onClick={() => navigate('/login', { state: { from: to } })}>Add to cart</button>;
  else action = <button type="button" className="uc__btn" onClick={addToCart} disabled={busy}>{busy ? <span className="btn-spinner" /> : null}Add to cart</button>;

  let heart = null;
  if (wish && !preview) {
    heart = (
      <button type="button" className={`uc__heart${saved ? ' is-on' : ''}`} onClick={() => wish.toggle(course.slug)} aria-pressed={!!saved} aria-label={saved ? 'Remove from wishlist' : 'Add to wishlist'}>
        <i className={`${saved ? 'fas' : 'far'} fa-heart`} aria-hidden="true" />
      </button>
    );
  } else if (!user && !preview) {
    heart = (
      <button type="button" className="uc__heart" onClick={() => navigate('/login', { state: { from: to } })} aria-label="Sign in to save this course">
        <i className="far fa-heart" aria-hidden="true" />
      </button>
    );
  }

  const title = preview ? <span>{course.title || 'Course title'}</span> : <Link to={to} className="uc__link">{course.title}</Link>;

  const card = (
    <article className={`uc${preview ? ' uc--preview' : ''}`}>
      <div className="uc__media">
        {image ? <img src={assetUrl(image)} alt="" loading="lazy" width="640" height="360" /> : <span className="uc__fallback"><BrandIcon name={course.icon} size={46} /></span>}
        {course.is_premium && <span className="uc__premium"><PremiumMark /> Premium</span>}
        {heart}
        {preview && <span className="uc__heart" aria-hidden="true"><i className="far fa-heart" /></span>}
      </div>

      <h3 className="uc__title">{title}</h3>
      <p className="uc__by">{instructorName(course)}</p>
      {(stats.student_count > 0 || course.language || course.caption_count > 0) && (
        <p className="uc__meta">
          {stats.student_count > 0 && <span><i className="fas fa-user-group" aria-hidden="true" /> {fmt.format(stats.student_count)} {stats.student_count === 1 ? 'student' : 'students'}</span>}
          {course.language && <span><i className="fas fa-globe" aria-hidden="true" /> {course.language}</span>}
          {course.caption_count > 0 && <span title={`Subtitles in ${course.caption_count} language${course.caption_count === 1 ? '' : 's'}`}><i className="far fa-closed-captioning" aria-hidden="true" /> CC</span>}
        </p>
      )}

      <div className="uc__bottom">
        <div className="uc__chips">
          {course.highlight && <span className={`uc__hl uc__hl--${course.highlight}`}>{HIGHLIGHT_LABELS[course.highlight]}</span>}
          {!course.highlight && course.trending && <span className="uc__hl uc__hl--trending" title="Popular this week"><i className="fas fa-arrow-trend-up" aria-hidden="true" /> Trending</span>}
          <span className="uc__chip">{course.format_label || 'Course'}</span>
          {stats.rating_count > 0
            ? <span className="uc__chip"><i className="fas fa-star" aria-hidden="true" /> {Number(stats.rating_average).toFixed(1)}</span>
            : <span className="uc__chip">New</span>}
          {stats.rating_count > 0 && <span className="uc__chip">{fmt.format(stats.rating_count)} {stats.rating_count === 1 ? 'rating' : 'ratings'}</span>}
        </div>

        {progress ? (
          <div className="uc__progress">
            <span className="lms-progress"><span style={{ width: `${progress.percent}%` }} /></span>
            <small>{progress.percent}% complete</small>
          </div>
        ) : (
          <div className="uc__foot">
            <div className="uc__price">
              {paid ? <strong>{shortMoney(salePrice(course), course.currency)}</strong> : <strong className="uc__free">Free</strong>}
              {paid && onSale(course) && <s>{shortMoney(course.price, course.currency)}</s>}
            </div>
            {action}
          </div>
        )}
      </div>
    </article>
  );

  if (preview || progress) return card;
  return <CoursePopover course={course} action={action} heart={heart}>{card}</CoursePopover>;
};

export default CourseCard;

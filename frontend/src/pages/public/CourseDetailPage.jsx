import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { lmsAPI, parseApiErrors, shopAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useSite } from '../../content/useContent';
import { Alert } from '../../components/ui/Form';
import { Spinner } from '../../components/ui/Section';
import Curriculum from '../../components/lms/Curriculum';
import { Captions, CourseIncludes, CourseVideo, FeatureBox, PremiumBar, RelatedTopics, ShowMore } from '../../components/lms/CoursePageParts';
import CourseCard from '../../components/lms/CourseCard';
import Price, { SaleCountdown } from '../../components/lms/Price';
import { HIGHLIGHT_LABELS, instructorName, isPaid, levelLabel, money, salePrice, useCourseImage } from '../../components/lms/courseUtils';
import Stars, { StarInput } from '../../components/lms/Stars';
import useWishlist from '../../components/lms/useWishlist';
import GiftDialog from '../../components/lms/GiftDialog';
import BundleOffer from '../../components/lms/BundleOffer';
import PremiumOptions, { BlockedNotice } from '../../components/lms/PremiumOptions';
import { cartChanged } from '../../components/lms/cartStore';
import { assetUrl } from '../../utils/assets';
import { formatDate } from '../../utils/format';
import { formatDuration, paragraphs } from '../../utils/lms';
import { NotFoundPage } from './StatusPages';
import '../../styles/lms.css';
import '../../styles/marketplace.css';

const monthYear = (date) => new Date(date).toLocaleDateString('en-US', { month: 'numeric', year: 'numeric' });

const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

const REVIEWS_SHOWN = 6;

const REPORT_REASONS = [
  ['inappropriate', 'Inappropriate content'],
  ['misleading', 'Misleading or wrong'],
  ['copyright', 'Copyright problem'],
  ['spam', 'Spam or advertising'],
  ['abuse', 'Harassment or hate'],
  ['other', 'Something else'],
];

// ------------------------------------------------------------------ reporting

/** "Report" link that opens a small form, for a course or a review. */
const ReportButton = ({ target, id, label = 'Report' }) => {
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('inappropriate');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  if (!isAuthenticated) return null;

  const send = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await lmsAPI.report({ target_type: target, target_id: id, reason, details });
      toast.success(data.detail || 'Thanks. Our team will review your report.');
      setOpen(false);
      setDetails('');
    } catch (err) {
      toast.error(parseApiErrors(err).form || 'Your report could not be sent.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="cd-report">
      <button type="button" className="cd-report__link" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <i className="far fa-flag" aria-hidden="true" /> {label}
      </button>
      {open && (
        <form className="cd-report__form" onSubmit={send}>
          <label htmlFor={`rr-${target}-${id}`}>What’s wrong?</label>
          <select id={`rr-${target}-${id}`} className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
            {REPORT_REASONS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
          <textarea className="input" rows={2} maxLength={2000} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Add details (optional)" aria-label="Details" />
          <div className="cd-report__actions">
            <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>Send report</button>
            <button type="button" className="btn btn--text btn--sm" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}
    </span>
  );
};

// ------------------------------------------------------------------ reviews

const Reviews = ({ slug, data, onChange }) => {
  const [rating, setRating] = useState(data.my_review?.rating || 0);
  const [comment, setComment] = useState(data.my_review?.comment || '');
  const [editing, setEditing] = useState(!data.my_review);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState(0);
  const [all, setAll] = useState(false);
  const { summary } = data;
  const matching = filter ? data.reviews.filter((r) => r.rating === filter) : data.reviews;
  const shown = all ? matching : matching.slice(0, REVIEWS_SHOWN);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data: next } = await lmsAPI.saveReview(slug, { rating, comment });
      onChange(next);
      setEditing(false);
      toast.success('Thanks for your review!');
    } catch (err) {
      setError(parseApiErrors(err).rating || parseApiErrors(err).form || 'Your review could not be saved.');
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    const { data: next } = await lmsAPI.deleteReview(slug);
    onChange(next);
    setRating(0);
    setComment('');
    setEditing(true);
  };

  return (
    <section className="cd-section" id="reviews">
      <h2>Student feedback</h2>
      {summary.count === 0 ? (
        <p className="muted">No reviews yet.{data.can_review ? ' Be the first to share what you thought.' : ''}</p>
      ) : (
        <div className="cd-rating">
          <div className="cd-rating__score">
            <strong>{summary.average.toFixed(1)}</strong>
            <Stars value={summary.average} size={16} />
            <small>Course rating · {summary.count} {summary.count === 1 ? 'review' : 'reviews'}</small>
          </div>
          <ul className="cd-rating__bars" aria-label="Rating breakdown (choose a row to filter)">
            {[5, 4, 3, 2, 1].map((star) => {
              const n = summary.distribution[String(star)];
              return (
                <li key={star}>
                  <button type="button" className={`cd-rating__row${filter === star ? ' is-active' : ''}`} onClick={() => setFilter(filter === star ? 0 : star)} aria-pressed={filter === star} disabled={!n}>
                    <span className="cd-rating__bar"><span style={{ width: `${summary.count ? (100 * n) / summary.count : 0}%` }} /></span>
                    <span>{star} {star === 1 ? 'star' : 'stars'}</span>
                    <small>{summary.count ? Math.round((100 * n) / summary.count) : 0}%</small>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {data.can_review && (
        <div className="cd-review-form">
          {editing ? (
            <form onSubmit={submit}>
              <h3>{data.my_review ? 'Edit your review' : 'Rate this course'}</h3>
              <StarInput value={rating} onChange={setRating} />
              <textarea className="input" rows={3} maxLength={1500} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Tell others what you thought (optional)" aria-label="Your review" />
              <Alert>{error}</Alert>
              <div className="cd-review-form__actions">
                <button type="submit" className="btn btn--primary btn--sm" disabled={busy || !rating}>{busy ? <span className="btn-spinner" /> : null} Save review</button>
                {data.my_review && <button type="button" className="btn btn--text btn--sm" onClick={() => setEditing(false)}>Cancel</button>}
              </div>
            </form>
          ) : (
            <p className="muted">
              You rated this course <strong>{data.my_review.rating} {data.my_review.rating === 1 ? 'star' : 'stars'}</strong>.{' '}
              <button type="button" className="link-arrow" onClick={() => setEditing(true)}>Edit</button> ·{' '}
              <button type="button" className="link-arrow" onClick={remove}>Delete</button>
            </p>
          )}
        </div>
      )}

      {filter > 0 && (
        <p className="muted small">Showing {filter}-star reviews. <button type="button" className="link-arrow" onClick={() => setFilter(0)}>Show all</button></p>
      )}
      {shown.length > 0 && (
        <ul className="cd-reviews">
          {shown.map((r) => (
            <li key={r.id}>
              <span className="cd-avatar" aria-hidden="true">{initials(r.name)}</span>
              <div>
                <strong>{r.name}</strong>
                <span className="cd-reviews__meta"><Stars value={r.rating} size={12} /> <small>{formatDate(r.created_at)}</small></span>
                {r.comment && <p>{r.comment}</p>}
                {!r.mine && <ReportButton target="review" id={r.id} />}
              </div>
            </li>
          ))}
        </ul>
      )}
      {matching.length > shown.length && (
        <button type="button" className="btn btn--outline cd-reviews__all" onClick={() => setAll(true)}>Show all {matching.length} reviews</button>
      )}
    </section>
  );
};

// ------------------------------------------------------------------ announcements

const Announcements = ({ slug }) => {
  const [items, setItems] = useState([]);
  useEffect(() => {
    let live = true;
    lmsAPI.announcements(slug).then(({ data }) => live && setItems(data)).catch(() => {});
    return () => {
      live = false;
    };
  }, [slug]);
  if (!items.length) return null;
  return (
    <section className="cd-section" id="announcements">
      <h2>Announcements</h2>
      <ul className="cd-announce">
        {items.slice(0, 5).map((a) => (
          <li key={a.id}>
            <strong>{a.title}</strong>
            <small className="muted">{a.author} · {formatDate(a.created_at)}</small>
            {paragraphs(a.body).map((p) => <p key={p.slice(0, 40)}>{p}</p>)}
          </li>
        ))}
      </ul>
    </section>
  );
};

// ------------------------------------------------------------------ the page

const Detail = ({ slug }) => {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const site = useSite();
  const imageOf = useCourseImage();
  const [state, setState] = useState({ outline: null, error: false });
  const [reviews, setReviews] = useState(null);
  const [related, setRelated] = useState([]);
  const [alsoTaken, setAlsoTaken] = useState([]);
  const [inCart, setInCart] = useState(false);
  const [busy, setBusy] = useState('');
  const [expandAll, setExpandAll] = useState(false);
  const wish = useWishlist();
  const isStudent = user?.role === 'STUDENT';

  const load = useCallback(() => lmsAPI.outline(slug).then(({ data }) => setState({ outline: data, error: false })).catch(() => setState({ outline: null, error: true })), [slug]);
  const loadReviews = useCallback(() => lmsAPI.reviews(slug).then(({ data }) => setReviews(data)).catch(() => setReviews(null)), [slug]);
  useEffect(() => {
    load();
    loadReviews();
    let live = true;
    lmsAPI.related(slug).then(({ data }) => live && setRelated(data)).catch(() => {});
    lmsAPI.alsoTaken(slug).then(({ data }) => live && setAlsoTaken(data)).catch(() => {});
    lmsAPI.viewed(slug).catch(() => {});  // counts the visit, and feeds "recommended for you"
    return () => {
      live = false;
    };
  }, [slug, load, loadReviews]);
  useEffect(() => {
    if (!isStudent) return undefined;
    let live = true;
    shopAPI.cart().then(({ data }) => live && setInCart(data.items.some((i) => i.course.slug === slug))).catch(() => {});
    return () => {
      live = false;
    };
  }, [isStudent, slug]);

  const { outline, error } = state;
  const [gifting, setGifting] = useState(false);
  if (error) return <NotFoundPage />;
  if (!outline) return <Spinner label="Loading course…" />;

  const course = outline.course;
  const stats = course.stats;
  const image = imageOf(course);
  const learn = course.learn_points.length ? course.learn_points : course.topics.map((t) => `Learn ${t}`);
  const enrolled = outline.enrolled;
  const requested = outline.enrollment_status === 'requested';
  const declined = outline.enrollment_status === 'declined';
  const asked = outline.enrollment_request; // {requested_at, decided_at, note, start_date} while waiting or after a decline
  const byApproval = course.enrollment_mode === 'approval';
  const progress = outline.progress;
  const teacher = course.instructor || {};
  const teacherName = instructorName(course) || site.name;
  const lessonsOf = outline.sections.flatMap((s) => s.lessons);
  const totals = outline.totals;
  const firstPreview = lessonsOf.find((l) => l.is_preview);
  const paid = isPaid(course);
  const order = outline.open_order;
  const manager = outline.can_manage;
  const teaches = user?.role === 'INSTRUCTOR' && teacher.id === user.id;
  const signIn = `/login`;

  const enroll = async () => {
    setBusy('enroll');
    try {
      const { data } = await lmsAPI.enroll(slug);
      if (data.status === 'active') {
        toast.success('You’re enrolled! Enjoy the course.');
        const fresh = await lmsAPI.outline(slug);
        const first = fresh.data.progress?.resume_id || fresh.data.sections[0]?.lessons[0]?.id;
        if (first) navigate(`/learn/${slug}/lesson/${first}`);
        else await load();
      } else {
        toast.success('Enrollment requested. ADRAM will confirm your place.');
        await load();
      }
    } catch (err) {
      toast.error(parseApiErrors(err).form || 'You could not be enrolled. Please try again.');
    } finally {
      setBusy('');
    }
  };
  const addToCart = async () => {
    setBusy('cart');
    try {
      await shopAPI.addToCart(slug);
      setInCart(true);
      cartChanged();
      toast.success('Added to your cart');
    } catch (err) {
      toast.error(parseApiErrors(err).form || 'This course could not be added to your cart.');
    } finally {
      setBusy('');
    }
  };
  const buyNow = async () => {
    setBusy('buy');
    try {
      const { data } = await shopAPI.buyNow(slug);
      cartChanged();
      navigate(data.status === 'successful' ? '/student/learning' : `/orders/${data.id}`);
    } catch (err) {
      toast.error(parseApiErrors(err).form || 'Your order could not be started.');
      setBusy('');
    }
  };
  const share = async () => {
    const url = window.location.href.split('#')[0];
    try {
      if (navigator.share) await navigator.share({ title: course.title, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success('Link copied');
      }
    } catch {
      /* the person closed the share sheet */
    }
  };

  // The wishlist heart: a square button beside the main button, as on Udemy
  const canWish = !enrolled && !manager && (Boolean(wish) || !isAuthenticated);
  const heart = canWish && (wish ? (
    <button type="button" className={`cd-heart${wish.has(slug) ? ' is-on' : ''}`} onClick={() => wish.toggle(slug)} aria-pressed={wish.has(slug)} aria-label={wish.has(slug) ? 'Remove from wishlist' : 'Add to wishlist'}>
      <i className={`${wish.has(slug) ? 'fas' : 'far'} fa-heart`} aria-hidden="true" />
    </button>
  ) : (
    <Link to="/login" state={{ from: `/courses/${slug}` }} className="cd-heart" aria-label="Sign in to save this course"><i className="far fa-heart" aria-hidden="true" /></Link>
  ));
  let action;
  if (enrolled) {
    action = (
      <>
        {progress && progress.total > 0 && (
          <div className="cd-card__progress">
            <div className="lms-progress"><span style={{ width: `${progress.percent}%` }} /></div>
            <small>{progress.percent}% complete · {progress.completed} of {progress.total} lessons</small>
          </div>
        )}
        {outline.has_content && (
          <Link to={`/learn/${slug}/lesson/${progress.resume_id}`} className="btn btn--primary btn--block btn--lg"><i className="fas fa-circle-play" /> {progress.completed || progress.last_lesson_id ? 'Continue learning' : 'Start learning'}</Link>
        )}
        {outline.certificate_code && <Link to={`/certificate/${outline.certificate_code}`} className="btn btn--outline btn--block"><i className="fas fa-certificate" /> View my certificate</Link>}
        {!outline.has_content && <p className="muted small">You’re enrolled. The lessons are being prepared.</p>}
      </>
    );
  } else if (manager) {
    action = (
      <>
        <Link to={teaches ? `/instructor/courses/${slug}/curriculum` : `/admin/courses/${slug}/content`} className="btn btn--primary btn--block btn--lg"><i className="fas fa-pen-ruler" /> Edit course content</Link>
        {lessonsOf[0] && <Link to={`/learn/${slug}/lesson/${lessonsOf[0].id}`} className="btn btn--outline btn--block"><i className="fas fa-circle-play" /> Preview as a student</Link>}
        {!course.is_published && <p className="cd-card__note">This course isn’t published yet. Only you and the ADRAM team can see this page.</p>}
      </>
    );
  } else if (outline.blocked) {
    action = <BlockedNotice blocked={outline.blocked} />;
  } else if (order) {
    action = (
      <>
        <Link to={`/orders/${order.id}`} className="btn btn--primary btn--block btn--lg"><i className="fas fa-credit-card" /> {order.status === 'processing' ? 'View your order' : 'Complete your payment'}</Link>
        <p className="cd-card__note">{order.status === 'processing' ? 'ADRAM is checking your payment. The lessons unlock as soon as it’s confirmed.' : `Order ${order.number} is waiting for payment.`}</p>
      </>
    );
  } else if (requested) {
    action = (
      <>
        <button type="button" className="btn btn--outline btn--block btn--lg" disabled><i className="fas fa-hourglass-half" /> Waiting for confirmation</button>
        <p className="cd-card__note">
          You asked to join{asked?.requested_at ? ` on ${formatDate(asked.requested_at)}` : ''}. ADRAM will confirm your place and tell you in your
          portal and by email. The lessons unlock as soon as it’s confirmed.
        </p>
      </>
    );
  } else if (paid) {
    action = (
      <>
        <div className="cd-buyrow">
          {!isAuthenticated ? (
            <Link to={signIn} state={{ from: `/courses/${slug}` }} className="btn btn--primary btn--block btn--lg">Add to cart</Link>
          ) : inCart ? (
            <Link to="/cart" className="btn btn--primary btn--block btn--lg">Go to cart</Link>
          ) : (
            <button type="button" className="btn btn--primary btn--block btn--lg" onClick={addToCart} disabled={!isStudent || !!busy}>{busy === 'cart' && <span className="btn-spinner" />} Add to cart</button>
          )}
          {heart}
        </div>
        {isAuthenticated && isStudent && (
          <button type="button" className="btn btn--outline btn--block btn--lg" onClick={buyNow} disabled={!!busy}>{busy === 'buy' && <span className="btn-spinner" />} Buy now</button>
        )}
        {isAuthenticated && !isStudent && <p className="cd-card__note">Sign in with a student account to buy courses.</p>}
      </>
    );
  } else {
    action = (
      <>
      {declined && (
        <div className="cd-declined" role="status">
          <strong><i className="fas fa-circle-info" /> Your last request wasn’t accepted</strong>
          {asked?.note && <p>“{asked.note}”</p>}
          <small>You can ask again below.</small>
        </div>
      )}
      <div className="cd-buyrow">
        {isAuthenticated ? (
          <button type="button" className="btn btn--primary btn--block btn--lg" onClick={enroll} disabled={!!busy || !isStudent}>
            {busy === 'enroll' && <span className="btn-spinner" />} {declined ? 'Ask again' : byApproval ? 'Request to enroll' : 'Enroll now'}
          </button>
        ) : (
          <Link to={`/join?next=${encodeURIComponent(`/courses/${slug}`)}`} className="btn btn--primary btn--block btn--lg">{byApproval ? 'Request to enroll' : 'Enroll now'}</Link>
        )}
        {heart}
      </div>
      </>
    );
  }

  return (
    <div className={`cd${course.is_premium ? ' cd--premium' : ''}`}>
      <div className="cd-band" aria-hidden="true" />
      <div className="container cd-grid">
        <header className="cd-head">
          <nav className="breadcrumb" aria-label="Breadcrumb">
            <Link to="/">Home</Link>
            <span className="breadcrumb__item"><span aria-hidden="true">/</span><Link to="/courses">Training</Link></span>
            {course.category && <span className="breadcrumb__item"><span aria-hidden="true">/</span><Link to={`/courses?category=${course.category.slug}`}>{course.category.name}</Link></span>}
            {course.subcategory && course.category && (
              <span className="breadcrumb__item"><span aria-hidden="true">/</span><Link to={`/courses?category=${course.category.slug}&subcategory=${course.subcategory.slug}`}>{course.subcategory.name}</Link></span>
            )}
          </nav>
          <h1>{course.title}</h1>
          <p className="cd-head__summary">{course.subtitle || course.summary}</p>
          {(course.highlight || !course.is_premium) && (
            <div className="cd-head__meta">
              {course.highlight && <span className={`uc__hl uc__hl--${course.highlight}`}>{HIGHLIGHT_LABELS[course.highlight]}</span>}
              {!course.is_premium && (stats.rating_count > 0 ? (
                <a href="#reviews" className="cd-head__rating"><b>{stats.rating_average.toFixed(1)}</b> <Stars value={stats.rating_average} size={13} /> <span>({stats.rating_count.toLocaleString()} {stats.rating_count === 1 ? 'rating' : 'ratings'})</span></a>
              ) : (
                <span className="cc__new">New</span>
              ))}
              {!course.is_premium && stats.student_count > 0 && <span>{stats.student_count.toLocaleString()} {stats.student_count === 1 ? 'student' : 'students'}</span>}
            </div>
          )}
          <p className="cd-head__by">
            Created by {teacher.id ? <Link to={`/instructors/${teacher.id}`} className="cd-head__teacher">{teacherName}</Link> : <strong>{teacherName}</strong>}
          </p>
          <ul className="cd-head__facts">
            {course.updated_at && <li><i className="fas fa-circle-exclamation" aria-hidden="true" /> Last updated {monthYear(course.updated_at)}</li>}
            <li><i className="fas fa-signal" aria-hidden="true" /> {levelLabel(course.level)}</li>
            {course.language && <li><i className="fas fa-globe" aria-hidden="true" /> {course.language}</li>}
            <Captions languages={course.caption_languages} />
            {!totals.seconds && course.duration && <li><i className="far fa-clock" aria-hidden="true" /> {course.duration}</li>}
            {course.next_intake && <li><i className="fas fa-calendar-days" aria-hidden="true" /> Next intake {formatDate(`${course.next_intake}T00:00`)}</li>}
          </ul>
          {course.is_premium && <PremiumBar note={course.premium_note} stats={stats} />}
        </header>

        <aside className="cd-aside">
          <div className="cd-card">
            <div className="cd-card__media">
              <CourseVideo course={course} lessons={lessonsOf} resumeId={enrolled ? progress?.resume_id : null} poster={image ? assetUrl(image) : undefined}>
                {image ? <img src={assetUrl(image)} alt="" /> : <span className="cd-card__media-fallback"><i className="fas fa-graduation-cap" aria-hidden="true" /></span>}
              </CourseVideo>
            </div>
            <div className="cd-card__body">
              {!enrolled && !outline.blocked && <p className="cd-card__price"><Price course={course} /></p>}
              {!enrolled && !outline.blocked && <SaleCountdown course={course} />}
              {action}
              {paid && isAuthenticated && isStudent && (
                <button type="button" className="btn btn--text btn--block" onClick={() => setGifting(true)}><i className="fas fa-gift" /> Buy as a gift</button>
              )}
              {!enrolled && !manager && !order && !outline.blocked && (
                <PremiumOptions slug={slug} outline={outline} signedIn={isAuthenticated} student={isStudent} onEnrolled={load} />
              )}
              {paid && <BundleOffer slug={slug} />}
              {!enrolled && firstPreview && <Link to={`/learn/${slug}/lesson/${firstPreview.id}`} className="btn btn--text btn--block"><i className="fas fa-eye" /> Watch a free preview</Link>}
              {!enrolled && !manager && !outline.blocked && (
                <p className="cd-card__note">
                  {paid ? 'Pay by mobile money and upload your receipt. Lessons unlock as soon as ADRAM confirms it.'
                    : course.enrollment_mode === 'open' ? 'Get instant access to every lesson as soon as you enrol.' : requested ? '' : 'ADRAM confirms each place. You’ll be told in your portal and by email.'}
                </p>
              )}
              <div className="cd-card__tools">
                <button type="button" className="btn btn--text btn--sm" onClick={share}><i className="fas fa-share-nodes" /> Share</button>
                {!manager && <ReportButton target="course" id={course.id} label="Report" />}
              </div>
            </div>
          </div>
        </aside>

        <div className="cd-body">
          {learn.length > 0 && (
            <section className="cd-box">
              <h2>What you’ll learn</h2>
              <ShowMore height={250}>
                <ul className="cd-learn">
                  {learn.map((point) => <li key={point}><i className="fas fa-check" aria-hidden="true" /> {point}</li>)}
                </ul>
              </ShowMore>
            </section>
          )}

          <RelatedTopics course={course} />
          <CourseIncludes course={course} totals={totals} lessons={lessonsOf} />
          <FeatureBox feature={course.feature} />

          {(enrolled || manager) && <Announcements slug={slug} />}

          <section className="cd-section" id="curriculum">
            <h2>Course content</h2>
            {outline.has_content ? (
              <>
                <div className="cd-content-bar">
                  <p className="muted cd-section__sub">
                    {outline.sections.length} {outline.sections.length === 1 ? 'section' : 'sections'} • {totals.lessons} {totals.lessons === 1 ? 'lesson' : 'lessons'}
                    {formatDuration(totals.seconds) && ` • ${formatDuration(totals.seconds)} total length`}
                  </p>
                  {outline.sections.length > 1 && (
                    <button type="button" className="cd-expand" onClick={() => setExpandAll((v) => !v)} aria-pressed={expandAll}>
                      {expandAll ? 'Collapse all sections' : 'Expand all sections'}
                    </button>
                  )}
                </div>
                <div className="cd-curriculum">
                  <Curriculum key={expandAll ? 'all' : 'first'} slug={slug} sections={outline.sections} doneIds={progress?.done_ids} expandAll={expandAll} open={(l) => enrolled || manager || l.is_preview} />
                </div>
              </>
            ) : (
              <p className="muted">The lessons for this course are being prepared. Check back soon.</p>
            )}
          </section>

          {course.requirements.length > 0 && (
            <section className="cd-section">
              <h2>Requirements</h2>
              <ul className="cd-list">{course.requirements.map((r) => <li key={r}>{r}</li>)}</ul>
            </section>
          )}

          {(course.description || course.topics.length > 0) && (
            <section className="cd-section">
              <h2>Description</h2>
              <ShowMore height={320}>
                <div className="cd-text">{paragraphs(course.description).map((p) => <p key={p.slice(0, 40)}>{p}</p>)}</div>
              </ShowMore>
              {!course.description && <p className="muted">{course.summary}</p>}
              {course.topics.length > 0 && <div className="program-card__topics">{course.topics.map((t) => <span key={t} className="tag">{t}</span>)}</div>}
            </section>
          )}

          {course.audience.length > 0 && (
            <section className="cd-section">
              <h2>Who this course is for</h2>
              <ul className="cd-list">{course.audience.map((a) => <li key={a}>{a}</li>)}</ul>
            </section>
          )}

          {course.faqs?.length > 0 && (
            <section className="cd-section" id="faq">
              <h2>Frequently asked questions</h2>
              <div className="faq cd-faq">
                {course.faqs.map((f, i) => (
                  <details key={f.question} open={i === 0}>
                    <summary>{f.question}<i className="fas fa-chevron-down" aria-hidden="true" /></summary>
                    <p>{f.answer}</p>
                  </details>
                ))}
              </div>
            </section>
          )}

          <section className="cd-section">
            <h2>Instructor</h2>
            <div className="cd-instructor">
              {teacher.photo || course.instructor_photo ? <img src={assetUrl(teacher.photo || course.instructor_photo)} alt="" /> : <span className="cd-avatar cd-avatar--lg" aria-hidden="true">{initials(teacherName)}</span>}
              <div>
                {teacher.id ? <Link to={`/instructors/${teacher.id}`} className="cd-instructor__name">{teacherName}</Link> : <strong>{teacherName}</strong>}
                {(teacher.title || course.instructor_title) && <span className="muted">{teacher.title || course.instructor_title}</span>}
                {course.instructor_bio && <p>{course.instructor_bio}</p>}
                {teacher.id && <Link to={`/instructors/${teacher.id}`} className="link-arrow">View profile <i className="fas fa-arrow-right" /></Link>}
              </div>
            </div>
          </section>

          {reviews && <Reviews key={reviews.my_review?.id || 'new'} slug={slug} data={reviews} onChange={(next) => { setReviews(next); load(); }} />}
        </div>
      </div>

      {alsoTaken.length > 0 && (
        <section className="container cd-related">
          <h2>Students also took</h2>
          <p className="muted">Courses popular with people who learn this one.</p>
          <div className="cc-grid">
            {alsoTaken.map((c) => <CourseCard key={c.slug} course={c} wish={wish} />)}
          </div>
        </section>
      )}
      {related.filter((c) => !alsoTaken.some((a) => a.slug === c.slug)).length > 0 && (
        <section className="container cd-related">
          <h2>Similar courses</h2>
          <div className="cc-grid">
            {related.filter((c) => !alsoTaken.some((a) => a.slug === c.slug)).slice(0, 4).map((c) => <CourseCard key={c.slug} course={c} wish={wish} />)}
          </div>
        </section>
      )}

      {/* Phones: the price and the main button stay in reach at the bottom of the screen */}
      {!enrolled && !manager && (
        <div className="cd-buybar">
          <Price course={course} />
          {paid && isStudent && !order ? (
            inCart ? <Link to="/cart" className="btn btn--primary btn--sm">Go to cart</Link>
              : <button type="button" className="btn btn--primary btn--sm" onClick={addToCart} disabled={!!busy}>Add to cart</button>
          ) : (
            <a href="#top" className="btn btn--primary btn--sm" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
              {order ? 'View order' : paid ? 'Buy' : 'Enroll'}
            </a>
          )}
        </div>
      )}
      {gifting && <GiftDialog target={{ course: slug }} title={course.title} price={money(salePrice(course), course.currency)} onClose={() => setGifting(false)} />}
    </div>
  );
};

export const CourseDetailPage = () => {
  const { slug } = useParams();
  return <Detail key={slug} slug={slug} />;
};

export default CourseDetailPage;

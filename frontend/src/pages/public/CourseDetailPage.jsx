import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { lmsAPI, parseApiErrors, portalAPI, shopAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useSite } from '../../content/useContent';
import { Alert } from '../../components/ui/Form';
import { Spinner } from '../../components/ui/Section';
import Curriculum from '../../components/lms/Curriculum';
import CourseCard from '../../components/lms/CourseCard';
import Price from '../../components/lms/Price';
import { HIGHLIGHT_LABELS, instructorName, isPaid, levelLabel, useCourseImage } from '../../components/lms/courseUtils';
import Stars, { StarInput } from '../../components/lms/Stars';
import useWishlist from '../../components/lms/useWishlist';
import { cartChanged } from '../../components/lms/cartStore';
import { assetUrl } from '../../utils/assets';
import { formatDate } from '../../utils/format';
import { formatDuration, paragraphs } from '../../utils/lms';
import { NotFoundPage } from './StatusPages';
import '../../styles/lms.css';
import '../../styles/marketplace.css';

const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

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
  const { summary } = data;
  const shown = filter ? data.reviews.filter((r) => r.rating === filter) : data.reviews;

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
  const [inCart, setInCart] = useState(false);
  const [busy, setBusy] = useState('');
  const [playing, setPlaying] = useState(false);
  const wish = useWishlist();
  const isStudent = user?.role === 'STUDENT';

  const load = useCallback(() => lmsAPI.outline(slug).then(({ data }) => setState({ outline: data, error: false })).catch(() => setState({ outline: null, error: true })), [slug]);
  const loadReviews = useCallback(() => lmsAPI.reviews(slug).then(({ data }) => setReviews(data)).catch(() => setReviews(null)), [slug]);
  useEffect(() => {
    load();
    loadReviews();
    let live = true;
    lmsAPI.related(slug).then(({ data }) => live && setRelated(data)).catch(() => {});
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
  if (error) return <NotFoundPage />;
  if (!outline) return <Spinner label="Loading course…" />;

  const course = outline.course;
  const stats = course.stats;
  const image = imageOf(course);
  const learn = course.learn_points.length ? course.learn_points : course.topics.map((t) => `Learn ${t}`);
  const enrolled = outline.enrolled;
  const requested = outline.enrollment_status === 'requested';
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
      const { data } = await portalAPI.enroll(slug);
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
          <Link to={`/learn/${slug}/lesson/${progress.resume_id}`} className="btn btn--primary btn--block btn--lg"><i className="fas fa-circle-play" /> {progress.completed ? 'Continue learning' : 'Start learning'}</Link>
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
        <button type="button" className="btn btn--outline btn--block btn--lg" disabled><i className="fas fa-hourglass-half" /> Enrollment requested</button>
        <p className="cd-card__note">ADRAM has your request and will confirm your place. The lessons unlock as soon as it’s approved.</p>
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
      <div className="cd-buyrow">
        {isAuthenticated ? (
          <button type="button" className="btn btn--primary btn--block btn--lg" onClick={enroll} disabled={!!busy || !isStudent}>{busy === 'enroll' && <span className="btn-spinner" />} Enroll now</button>
        ) : (
          <Link to={`/join?next=${encodeURIComponent(`/courses/${slug}`)}`} className="btn btn--primary btn--block btn--lg">Enroll now</Link>
        )}
        {heart}
      </div>
    );
  }

  return (
    <div className="cd">
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
          <div className="cd-head__meta">
            {course.highlight && <span className={`uc__hl uc__hl--${course.highlight}`}>{HIGHLIGHT_LABELS[course.highlight]}</span>}
            {course.is_premium && <span className="cd-premium"><i className="far fa-circle-check" aria-hidden="true" /> Premium</span>}
            {stats.rating_count > 0 ? (
              <a href="#reviews" className="cd-head__rating"><b>{stats.rating_average.toFixed(1)}</b> <Stars value={stats.rating_average} size={13} /> <span>({stats.rating_count} {stats.rating_count === 1 ? 'rating' : 'ratings'})</span></a>
            ) : (
              <span className="cc__new">New</span>
            )}
            {stats.student_count > 0 && <span><i className="fas fa-user-group" aria-hidden="true" /> {stats.student_count} {stats.student_count === 1 ? 'student' : 'students'}</span>}
          </div>
          <p className="cd-head__by">
            Created by {teacher.id ? <Link to={`/instructors/${teacher.id}`} className="cd-head__teacher">{teacherName}</Link> : <strong>{teacherName}</strong>}
          </p>
          <ul className="cd-head__facts">
            {course.updated_at && <li><i className="fas fa-circle-exclamation" aria-hidden="true" /> Last updated {formatDate(course.updated_at)}</li>}
            <li><i className="fas fa-signal" aria-hidden="true" /> {levelLabel(course.level)}</li>
            {course.language && <li><i className="fas fa-globe" aria-hidden="true" /> {course.language}</li>}
            {totals.seconds > 0 ? <li><i className="far fa-clock" aria-hidden="true" /> {formatDuration(totals.seconds)} total</li> : course.duration && <li><i className="far fa-clock" aria-hidden="true" /> {course.duration}</li>}
            {course.next_intake && <li><i className="fas fa-calendar-days" aria-hidden="true" /> Next intake {formatDate(`${course.next_intake}T00:00`)}</li>}
          </ul>
        </header>

        <aside className="cd-aside">
          <div className="cd-card">
            <div className="cd-card__media">
              {playing && course.promo_embed_url ? (
                <iframe src={`${course.promo_embed_url}${course.promo_embed_url.includes('?') ? '&' : '?'}autoplay=1`} title={`${course.title} trailer`} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
              ) : (
                <>
                  {image ? <img src={assetUrl(image)} alt="" /> : <span className="cd-card__media-fallback"><i className="fas fa-graduation-cap" aria-hidden="true" /></span>}
                  {course.promo_embed_url && (
                    <button type="button" className="cd-card__play" onClick={() => setPlaying(true)} aria-label="Play the course trailer">
                      <i className="fas fa-play" aria-hidden="true" /><span>Preview this course</span>
                    </button>
                  )}
                </>
              )}
            </div>
            <div className="cd-card__body">
              {!enrolled && <p className="cd-card__price"><Price course={course} /></p>}
              {action}
              {!enrolled && firstPreview && <Link to={`/learn/${slug}/lesson/${firstPreview.id}`} className="btn btn--text btn--block"><i className="fas fa-eye" /> Watch a free preview</Link>}
              {!enrolled && !manager && (
                <p className="cd-card__note">
                  {paid ? 'Pay by mobile money and upload your receipt. Lessons unlock as soon as ADRAM confirms it.'
                    : course.enrollment_mode === 'open' ? 'Get instant access to every lesson as soon as you enrol.' : 'ADRAM confirms each place and will contact you with next steps.'}
                </p>
              )}
              <h3>This course includes</h3>
              <ul className="cd-includes">
                {totals.seconds > 0 && <li><i className="far fa-circle-play" aria-hidden="true" /> {formatDuration(totals.seconds)} of video</li>}
                {totals.lessons > 0 && <li><i className="fas fa-list-check" aria-hidden="true" /> {totals.lessons} {totals.lessons === 1 ? 'lesson' : 'lessons'}</li>}
                {totals.quizzes > 0 && <li><i className="fas fa-circle-question" aria-hidden="true" /> {totals.quizzes} {totals.quizzes === 1 ? 'quiz' : 'quizzes'}</li>}
                {totals.assignments > 0 && <li><i className="fas fa-file-pen" aria-hidden="true" /> {totals.assignments} {totals.assignments === 1 ? 'assignment' : 'assignments'}</li>}
                {totals.documents + totals.resources > 0 && <li><i className="fas fa-file-arrow-down" aria-hidden="true" /> {totals.documents + totals.resources} downloadable {totals.documents + totals.resources === 1 ? 'resource' : 'resources'}</li>}
                <li><i className="fas fa-mobile-screen" aria-hidden="true" /> Learn on your phone or computer</li>
                <li><i className="fas fa-certificate" aria-hidden="true" /> Certificate of completion</li>
              </ul>
              <div className="cd-card__tools">
                <button type="button" className="btn btn--text btn--sm" onClick={share}><i className="fas fa-share-nodes" /> Share</button>
                {!manager && <ReportButton target="course" id={course.id} label="Report" />}
              </div>
            </div>
          </div>
        </aside>

        <div className="cd-body">
          <section className="cd-box">
            <h2>What you’ll learn</h2>
            <ul className="cd-learn">
              {learn.map((point) => <li key={point}><i className="fas fa-check" aria-hidden="true" /> {point}</li>)}
            </ul>
          </section>

          {(enrolled || manager) && <Announcements slug={slug} />}

          <section className="cd-section" id="curriculum">
            <h2>Course content</h2>
            {outline.has_content ? (
              <>
                <p className="muted cd-section__sub">
                  {outline.sections.length} {outline.sections.length === 1 ? 'section' : 'sections'} · {totals.lessons} {totals.lessons === 1 ? 'lesson' : 'lessons'}
                  {formatDuration(totals.seconds) && ` · ${formatDuration(totals.seconds)} total length`}
                </p>
                <div className="cd-curriculum">
                  <Curriculum slug={slug} sections={outline.sections} doneIds={progress?.done_ids} open={(l) => enrolled || manager || l.is_preview} />
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
              <div className="cd-text">{paragraphs(course.description).map((p) => <p key={p.slice(0, 40)}>{p}</p>)}</div>
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

      {related.length > 0 && (
        <section className="container cd-related">
          <h2>Students also looked at</h2>
          <div className="cc-grid">
            {related.slice(0, 4).map((c) => <CourseCard key={c.slug} course={c} wish={wish} />)}
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
    </div>
  );
};

export const CourseDetailPage = () => {
  const { slug } = useParams();
  return <Detail key={slug} slug={slug} />;
};

export default CourseDetailPage;

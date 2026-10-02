import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { lmsAPI } from '../../services/api';
import PortalLayout from '../../components/layout/PortalLayout';
import { Alert } from '../../components/ui/Form';
import BrandIcon from '../../components/brand/BrandIcon';
import CourseCard from '../../components/lms/CourseCard';
import { StatusPill } from '../../components/lms/Price';
import useWishlist from '../../components/lms/useWishlist';
import { useAddToCart } from '../../components/lms/cartStore';
import { money, useCourseImage } from '../../components/lms/courseUtils';
import { NOTIFICATION_ICONS } from '../../components/lms/notifications';
import { assetUrl } from '../../utils/assets';
import { formatDate, timeAgo } from '../../utils/format';
import { formatDuration } from '../../utils/lms';
import { hoursLabel } from '../../utils/learn';
import '../../styles/lms.css';
import '../../styles/marketplace.css';
import '../../styles/learn.css';

const TABS = [
  ['all', 'All courses'],
  ['progress', 'In progress'],
  ['done', 'Completed'],
  ['wishlist', 'Wishlist'],
  ['certificates', 'Certificates'],
  ['viewed', 'Recently viewed'],
];

const finished = (row) => Boolean(row.certificate_code) || row.status === 'completed';
const learnLink = (row) => (row.has_content ? `/learn/${row.course.slug}/lesson/${row.progress.resume_id}` : `/courses/${row.course.slug}`);

const Thumb = ({ row, imageOf, className, children }) => {
  const image = imageOf({ slug: row.course.slug, thumbnail: row.course.thumbnail });
  return (
    <Link to={learnLink(row)} className={className} aria-label={`Open ${row.course.title}`}>
      {image ? <img src={assetUrl(image)} alt="" loading="lazy" /> : <span><BrandIcon name={row.course.icon} size={40} /></span>}
      {children}
    </Link>
  );
};

/** One enrolled course: thumbnail, title, instructor, progress, last lesson and the button to carry on. */
const LearningCard = ({ row, imageOf }) => {
  const { progress } = row;
  const done = finished(row);
  return (
    <article className="mld-card">
      <Thumb row={row} imageOf={imageOf} className="mld-card__thumb">
        <span className="mld-card__play"><i className="fas fa-play" aria-hidden="true" /></span>
        {done && <span className="mld-card__done"><i className="fas fa-check" aria-hidden="true" /> Completed</span>}
      </Thumb>
      <div className="mld-card__body">
        <strong>{row.course.title}</strong>
        <span className="mld-card__by">{row.course.instructor}</span>
        <div className="lms-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} aria-label={`${row.course.title} progress`}>
          <span style={{ width: `${progress.percent}%` }} />
        </div>
        <small>{progress.percent}% complete · {progress.completed} of {progress.total} lessons{row.time_spent_seconds > 60 ? ` · ${formatDuration(row.time_spent_seconds)} spent` : ''}</small>
        <span className="mld-card__last">
          {row.last_lesson?.title ? <>Last lesson: {row.last_lesson.title}</> : row.resume_title ? <>Up next: {row.resume_title}</> : 'Lessons coming soon'}
        </span>
        <div className="mld-card__actions">
          <Link to={learnLink(row)} className="btn btn--primary btn--sm">
            <i className="fas fa-circle-play" /> {done ? 'Review' : progress.completed ? 'Continue learning' : 'Start course'}
          </Link>
          {row.certificate_code && <Link to={`/certificate/${row.certificate_code}`} className="btn btn--outline btn--sm"><i className="fas fa-certificate" /> Certificate</Link>}
        </div>
      </div>
    </article>
  );
};

/** "My learning": the student's learning dashboard. */
export const MyLearningPage = () => {
  const [state, setState] = useState({ data: null, error: false });
  const { hash } = useLocation();
  // A link like /student/learning#wishlist opens that tab.
  const [tab, setTab] = useState(() => (TABS.some(([id]) => `#${id}` === hash) ? hash.slice(1) : 'all'));
  const imageOf = useCourseImage();
  const wish = useWishlist();
  const addToCart = useAddToCart();

  useEffect(() => {
    let live = true;
    lmsAPI.dashboard().then(({ data }) => live && setState({ data, error: false })).catch(() => live && setState({ data: null, error: true }));
    return () => {
      live = false;
    };
  }, []);

  const { data, error } = state;
  const rows = data?.courses || [];
  const shown = tab === 'progress' ? rows.filter((r) => !finished(r)) : tab === 'done' ? rows.filter(finished) : rows;
  const wishlist = (data?.wishlist || []).filter((c) => !wish || wish.has(c.slug));
  const s = data?.stats;

  return (
    <PortalLayout
      title="My learning"
      subtitle="Your courses, progress and certificates in one place."
      actions={<Link to="/courses" className="btn btn--outline btn--sm"><i className="fas fa-compass" /> Browse courses</Link>}
    >
      {error && <Alert>Your learning dashboard couldn’t be loaded. Refresh the page to try again.</Alert>}
      {!data && !error && <div className="skeleton skeleton--block" />}
      {data && (
        <div className="mld">
          <div className="mld-welcome">
            <div>
              <h2>Welcome back{data.user.first_name ? `, ${data.user.first_name}` : ''}!</h2>
              <p className="muted">{rows.length ? 'Pick up where you left off.' : 'Start learning something new today.'}</p>
            </div>
            {data.cart_count > 0 && <Link to="/cart" className="btn btn--outline btn--sm"><i className="fas fa-cart-shopping" /> Cart ({data.cart_count})</Link>}
          </div>

          <div className="mld-stats" aria-label="Learning statistics">
            <div className="mld-stat"><i className="far fa-clock" aria-hidden="true" /><div><strong>{hoursLabel(s.hours)}</strong><small>Learning time</small></div></div>
            <div className="mld-stat"><i className="fas fa-book-open" aria-hidden="true" /><div><strong>{s.enrolled}</strong><small>Courses enrolled</small></div></div>
            <div className="mld-stat"><i className="fas fa-person-running" aria-hidden="true" /><div><strong>{s.in_progress}</strong><small>In progress</small></div></div>
            <div className="mld-stat"><i className="fas fa-flag-checkered" aria-hidden="true" /><div><strong>{s.completed}</strong><small>Completed</small></div></div>
            <div className="mld-stat"><i className="fas fa-list-check" aria-hidden="true" /><div><strong>{s.quiz_average}%</strong><small>Quiz average</small></div></div>
            <div className="mld-stat"><i className="fas fa-certificate" aria-hidden="true" /><div><strong>{s.certificates}</strong><small>Certificates</small></div></div>
          </div>

          {data.continue && (
            <section className="card mld-hero" aria-label="Continue learning">
              <Thumb row={data.continue} imageOf={imageOf} className="mld-hero__thumb">
                <span className="mld-hero__play"><i className="fas fa-circle-play" aria-hidden="true" /></span>
              </Thumb>
              <div className="mld-hero__body">
                <p className="mld-hero__eyebrow">Continue learning</p>
                <h3>{data.continue.course.title}</h3>
                <span className="muted small">{data.continue.course.instructor}</span>
                <div className="lms-progress"><span style={{ width: `${data.continue.progress.percent}%` }} /></div>
                <small>{data.continue.progress.percent}% complete{data.continue.resume_title ? ` · Next: ${data.continue.resume_title}` : ''}</small>
                <Link to={learnLink(data.continue)} className="btn btn--primary"><i className="fas fa-play" /> Continue</Link>
              </div>
            </section>
          )}

          {data.recently_accessed.length > 1 && (
            <section className="mld-section" aria-label="Recently accessed">
              <h2>Recently accessed</h2>
              <div className="mld-strip">
                {data.recently_accessed.map((r) => {
                  const image = imageOf({ slug: r.course.slug, thumbnail: r.course.thumbnail });
                  return (
                    <Link key={r.course.slug} to={learnLink(r)}>
                      {image ? <img src={assetUrl(image)} alt="" /> : <span className="mld-strip__icon"><BrandIcon name={r.course.icon} size={22} /></span>}
                      <span><strong>{r.course.title}</strong><small>{r.progress.percent}% · {timeAgo(r.last_accessed_at)}</small></span>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          <section className="mld-section">
            <div className="lms-tabs mld-tabs" role="tablist">
              {TABS.map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)}>{label}</button>
              ))}
            </div>
            {['all', 'progress', 'done'].includes(tab) && (
              rows.length === 0 ? (
                <section className="card panel empty-state">
                  <span className="empty-state__icon"><i className="fas fa-graduation-cap" /></span>
                  <h3>You’re not learning anything yet</h3>
                  <p className="muted">Enrol on a course and it appears here, with your progress.</p>
                  <Link to="/courses" className="btn btn--primary btn--sm">Browse courses</Link>
                </section>
              ) : shown.length === 0 ? (
                <p className="muted">{tab === 'done' ? 'Finish a course and it moves here.' : 'Nothing in progress right now.'}</p>
              ) : (
                <div className="mld-courses">{shown.map((r) => <LearningCard key={r.course.slug} row={r} imageOf={imageOf} />)}</div>
              )
            )}
            {tab === 'wishlist' && (wishlist.length === 0 ? (
              <p className="muted">Tap the heart on a course to save it here for later.</p>
            ) : (
              <div className="cc-grid">
                {wishlist.map((c) => (
                  <div key={c.slug} className="mld-wish">
                    <CourseCard course={c} wish={wish} />
                    {!c.is_free && <button type="button" className="btn btn--outline btn--sm btn--block" onClick={() => addToCart(c.slug)}><i className="fas fa-cart-plus" /> Add to cart</button>}
                  </div>
                ))}
              </div>
            ))}
            {tab === 'certificates' && (data.certificates.length === 0 ? (
              <p className="muted">Complete a course to earn its certificate.</p>
            ) : (
              <ul className="mld-list card panel">
                {data.certificates.map((c) => (
                  <li key={c.code}>
                    <i className="fas fa-certificate" aria-hidden="true" />
                    <div><strong>{c.course_title}</strong><small>Completed {formatDate(c.issued_at)} · ID {c.code}</small></div>
                    <Link to={`/certificate/${c.code}`} className="btn btn--outline btn--sm">View</Link>
                  </li>
                ))}
              </ul>
            ))}
            {tab === 'viewed' && (data.recently_viewed.length === 0 ? (
              <p className="muted">Courses you look at appear here.</p>
            ) : (
              <div className="cc-grid">{data.recently_viewed.map((c) => <CourseCard key={c.slug} course={c} wish={wish} />)}</div>
            ))}
          </section>

          <div className="mld-side">
            <section className="card panel">
              <div className="mld-section__head"><h2 className="h3">Notifications</h2><Link to="/notifications" className="link-arrow">See all <i className="fas fa-arrow-right" /></Link></div>
              {data.notifications.length === 0 ? <p className="muted">You’re all caught up.</p> : (
                <ul className="mld-list">
                  {data.notifications.slice(0, 5).map((n) => (
                    <li key={n.id}>
                      <i className={`fas ${NOTIFICATION_ICONS[n.kind] || 'fa-bell'}`} aria-hidden="true" />
                      <div>{n.link ? <Link to={n.link}><strong>{n.title}</strong></Link> : <strong>{n.title}</strong>}<small>{timeAgo(n.created_at)}</small></div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="card panel">
              <div className="mld-section__head"><h2 className="h3">Recent purchases</h2><Link to="/student/purchases" className="link-arrow">Purchase history <i className="fas fa-arrow-right" /></Link></div>
              {data.orders.length === 0 ? <p className="muted">No purchases yet.</p> : (
                <ul className="mld-list">
                  {data.orders.map((o) => (
                    <li key={o.id}>
                      <i className="fas fa-receipt" aria-hidden="true" />
                      <div><Link to={`/orders/${o.id}`}><strong>{o.items.map((i) => i.title).join(', ')}</strong></Link><small>{o.number} · {formatDate(o.created_at)} · {money(o.total, o.currency)}</small></div>
                      <StatusPill status={o.status} label={o.status_display} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {data.recommended.length > 0 && (
            <section className="mld-section">
              <h2>Recommended for you</h2>
              <div className="cc-grid">{data.recommended.slice(0, 8).map((c) => <CourseCard key={c.slug} course={c} wish={wish} />)}</div>
            </section>
          )}
        </div>
      )}
    </PortalLayout>
  );
};

export default MyLearningPage;

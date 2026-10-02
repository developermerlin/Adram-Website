import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { lmsAPI } from '../../services/api';
import { formatDate, greeting } from '../../utils/format';
import { hoursLabel } from '../../utils/learn';
import { assetUrl } from '../../utils/assets';
import PortalLayout from '../../components/layout/PortalLayout';
import DashboardArt from '../../components/brand/DashboardArt';
import { Alert } from '../../components/ui/Form';
import Kpi from '../../components/portal/Kpi';
import { MessagesPanel, SecurityPanel } from '../../components/portal/OverviewPanels';
import CourseCard from '../../components/lms/CourseCard';
import { money, useCourseImage } from '../../components/lms/courseUtils';
import useWishlist from '../../components/lms/useWishlist';
import StreakGoalCard from '../../components/lms/StreakGoalCard';
import DeadlinesCard from '../../components/lms/DeadlinesCard';
import FollowingCard from '../../components/lms/FollowingCard';
import PaymentPlansCard from '../../components/lms/PaymentPlansCard';
import '../../styles/learn.css';
import '../../styles/marketplace.css';

const todayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const ORDER_TONE = { successful: 'badge--green', pending: 'badge--amber', processing: 'badge--blue', failed: 'badge--red', cancelled: 'badge--gray', refunded: 'badge--gray' };

/** The training side of a student's portal: their courses, progress, certificates, cart and purchases. */
export const TrainingDashboard = () => {
  const { user } = useAuth();
  const imageOf = useCourseImage();
  const wish = useWishlist();
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [requests, setRequests] = useState([]); // courses "by approval": waiting for ADRAM, or not accepted
  const [progress, setProgress] = useState(null); // streak and daily goal
  const loadProgress = useCallback(() => lmsAPI.analytics(7).then(({ data: d }) => setProgress(d)).catch(() => {}), []);
  useEffect(() => {
    loadProgress();
  }, [loadProgress]);

  useEffect(() => {
    let live = true;
    lmsAPI.dashboard().then(({ data: d }) => live && setData(d)).catch(() => live && setFailed(true));
    lmsAPI.enrollments().then(({ data: list }) => live && setRequests(list.filter((e) => ['requested', 'declined'].includes(e.status)))).catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const s = data?.stats;
  const next = data?.continue;
  const courses = data?.courses || [];
  const nextImage = next ? imageOf({ slug: next.course.slug, thumbnail: next.course.thumbnail }) : '';
  const waitingOrders = (data?.orders || []).filter((o) => ['pending', 'failed'].includes(o.status));

  let heroText = 'Welcome to your training dashboard. Find a course to start learning.';
  if (next) heroText = `Pick up where you left off in ${next.course.title}.`;
  else if (courses.length) heroText = 'Your courses are all here. Keep learning or start something new.';

  return (
    <PortalLayout title="Training overview" subtitle={todayFmt.format(new Date())}>
      <section className="ov-hero">
        <div className="ov-hero__copy">
          <p className="ov-hero__eyebrow">{greeting()},</p>
          <h2>{user?.first_name}</h2>
          <p>{heroText}</p>
          <div className="ov-hero__actions">
            <Link to="/courses" className="btn btn--light btn--sm"><i className="fas fa-compass" /> Browse courses</Link>
            <Link to="/student/learning" className="btn btn--ghost-light btn--sm"><i className="fas fa-circle-play" /> My learning</Link>
            <Link to="/cart" className="btn btn--ghost-light btn--sm"><i className="fas fa-cart-shopping" /> Cart{data?.cart_count ? ` (${data.cart_count})` : ''}</Link>
          </div>
        </div>
        <DashboardArt className="ov-hero__art" />
      </section>

      {failed && <Alert>Your training dashboard couldn’t be loaded. Refresh the page to try again.</Alert>}

      <div className="ov-kpis">
        <Kpi icon="fa-book-open" label="My courses" value={s ? s.enrolled : null} note={s ? `${s.in_progress} in progress` : ''} to="/student/learning" />
        <Kpi icon="fa-circle-check" label="Completed" value={s ? s.completed : null} note={s ? `${plural(s.lessons_completed, 'lesson')} done` : ''} to="/student/learning" tone="green" />
        <Kpi icon="fa-certificate" label="Certificates" value={s ? s.certificates : null} note="Earned by finishing a course" to="/student/certificates" tone="violet" />
        <Kpi icon="fa-clock" label="Learning time" value={s ? hoursLabel(s.hours) : null} note={s && s.quizzes_passed ? `${plural(s.quizzes_passed, 'quiz')} passed` : 'Time spent in lessons'} tone="cyan" />
      </div>

      <div className="ov-grid">
        <div className="stack-lg">
          <section className="card panel">
            <div className="panel__head"><h2 className="h3">Continue learning</h2></div>
            {!data && !failed && <div className="skeleton skeleton--block" />}
            {data && !next && (
              <div className="ov-empty"><i className="fas fa-circle-play" /> Nothing in progress. <Link to="/courses">Find a course</Link> to start learning.</div>
            )}
            {next && (
              <Link to={next.has_content ? `/learn/${next.course.slug}/lesson/${next.progress.resume_id}` : `/courses/${next.course.slug}`} className="ls-next">
                <span className="ls-next__thumb">{nextImage ? <img src={assetUrl(nextImage)} alt="" /> : <i className="fas fa-circle-play" aria-hidden="true" />}</span>
                <span className="ls-next__text">
                  <small>{next.course.category || 'Course'}</small>
                  <strong>{next.course.title}</strong>
                  <span className="lms-progress"><span style={{ width: `${next.progress.percent}%` }} /></span>
                  <small>{next.progress.percent}% complete{next.resume_title ? ` · Next: ${next.resume_title}` : ''}</small>
                </span>
                <i className="fas fa-play" aria-hidden="true" />
              </Link>
            )}
          </section>

          <section className="card panel">
            <div className="panel__head">
              <h2 className="h3">My courses</h2>
              <Link to="/student/learning" className="panel__link">View all</Link>
            </div>
            {data && courses.length === 0 && <div className="ov-empty"><i className="fas fa-book-open" /> You’re not on any course yet.</div>}
            <ul className="ov-apps">
              {courses.slice(0, 5).map((r) => (
                <li key={r.course.id}>
                  <Link to={r.has_content && r.progress.resume_id ? `/learn/${r.course.slug}/lesson/${r.progress.resume_id}` : `/courses/${r.course.slug}`} className="ov-app">
                    <span className="ov-app__icon"><i className="fas fa-laptop-code" /></span>
                    <span className="ov-app__main">
                      <strong>{r.course.title}</strong>
                      <span className="ov-app__meta">{r.course.instructor}{r.last_accessed_at ? ` · last opened ${formatDate(r.last_accessed_at)}` : ''}</span>
                      <span className="ov-app__bar" aria-hidden="true"><span style={{ width: `${r.progress.percent}%` }} /></span>
                    </span>
                    <span className={`badge ${r.certificate_code ? 'badge--green' : r.progress.percent ? 'badge--blue' : 'badge--gray'}`}>
                      {r.certificate_code ? 'Completed' : `${r.progress.percent}%`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          {data?.recommended?.length > 0 && (
            <section className="card panel">
              <div className="panel__head">
                <h2 className="h3">Recommended for you</h2>
                <Link to="/courses" className="panel__link">Browse all</Link>
              </div>
              <div className="cc-grid td-recommended">
                {data.recommended.slice(0, 3).map((c) => <CourseCard key={c.slug} course={c} wish={wish} />)}
              </div>
            </section>
          )}
        </div>

        <aside className="stack-lg">
          <StreakGoalCard data={progress} onGoal={loadProgress} compact />
          <PaymentPlansCard />
          <DeadlinesCard />
          <FollowingCard />

          {requests.length > 0 && (
            <section className="card panel">
              <div className="panel__head">
                <h2 className="h3">Enrollment requests</h2>
                <Link to="/student/training" className="panel__link">My training</Link>
              </div>
              <ul className="ov-todo">
                {requests.map((e) => (
                  <li key={e.id} className={`ov-todo__item ov-todo__item--${e.status === 'requested' ? 'amber' : 'red'}`}>
                    <span className="ov-todo__icon" aria-hidden="true"><i className={`fas ${e.status === 'requested' ? 'fa-hourglass-half' : 'fa-circle-info'}`} /></span>
                    <span className="ov-todo__text">
                      {e.course.title}
                      <small className="muted"> · {e.status === 'requested' ? 'waiting for ADRAM to confirm' : 'not accepted'}</small>
                    </span>
                    <Link to={`/courses/${e.course.slug}`} className="btn btn--outline btn--sm">{e.status === 'requested' ? 'View' : 'Ask again'}</Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {waitingOrders.length > 0 && (
            <section className="card panel">
              <div className="panel__head"><h2 className="h3">Finish your payment</h2></div>
              <ul className="ov-todo">
                {waitingOrders.map((o) => (
                  <li key={o.id} className="ov-todo__item ov-todo__item--amber">
                    <span className="ov-todo__icon" aria-hidden="true"><i className="fas fa-money-bill-transfer" /></span>
                    <span className="ov-todo__text">Order {o.number}: {money(o.total, o.currency)}</span>
                    <Link to={`/orders/${o.id}`} className="btn btn--outline btn--sm">Pay now</Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card panel">
            <div className="panel__head"><h2 className="h3">Cart &amp; wishlist</h2></div>
            <ul className="td-links">
              <li><Link to="/cart"><i className="fas fa-cart-shopping" aria-hidden="true" /> Cart <strong>{data ? data.cart_count : '…'}</strong></Link></li>
              <li><Link to="/student/learning#wishlist"><i className="fas fa-heart" aria-hidden="true" /> Wishlist <strong>{data ? data.wishlist.length : '…'}</strong></Link></li>
              <li><Link to="/student/purchases"><i className="fas fa-receipt" aria-hidden="true" /> Purchase history</Link></li>
            </ul>
          </section>

          {data?.orders?.length > 0 && (
            <section className="card panel">
              <div className="panel__head">
                <h2 className="h3">Recent orders</h2>
                <Link to="/student/purchases" className="panel__link">View all</Link>
              </div>
              <ul className="td-orders">
                {data.orders.slice(0, 4).map((o) => (
                  <li key={o.id}>
                    <Link to={`/orders/${o.id}`}>
                      <span><strong>{o.number}</strong><small>{formatDate(o.created_at)} · {o.items.map((i) => i.title).join(', ')}</small></span>
                      <span className="td-orders__right"><b>{money(o.total, o.currency)}</b><span className={`badge ${ORDER_TONE[o.status] || 'badge--gray'}`}>{o.status_display}</span></span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <MessagesPanel />
          <SecurityPanel />

          <section className="card panel ov-help">
            <span className="ov-help__icon" aria-hidden="true"><i className="fas fa-headset" /></span>
            <h2 className="h3">Need help with a course?</h2>
            <p className="muted small">Ask the ADRAM team about courses, payments or certificates.</p>
            <Link to="/contact?subject=Training%20enquiry" className="btn btn--primary btn--sm btn--block">Contact us</Link>
          </section>
        </aside>
      </div>
    </PortalLayout>
  );
};

export default TrainingDashboard;

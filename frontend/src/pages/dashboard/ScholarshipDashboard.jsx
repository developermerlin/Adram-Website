import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { portalAPI } from '../../services/api';
import usePortal from '../../data/usePortal';
import { formatDate, formatDateTime, greeting } from '../../utils/format';
import { daysUntil, isClosed, progressOf } from '../../utils/applicationStages';
import PortalLayout from '../../components/layout/PortalLayout';
import DashboardArt from '../../components/brand/DashboardArt';
import Flag from '../../components/ui/Flag';
import { Alert } from '../../components/ui/Form';
import { StageBadge } from '../../components/portal/ApplicationCard';
import { ScholarshipRow } from '../../components/portal/PortalPieces';
import { MessagesPanel, SecurityPanel } from '../../components/portal/OverviewPanels';
import Kpi from '../../components/portal/Kpi';

const todayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Server-side to-dos (see student_actions in backend/portal/views.py) turned into rows with a link.
const ACTION_VIEW = {
  reupload: (x) => ({ tone: 'red', icon: 'fa-rotate-left', text: `Re-upload ${plural(x.count, 'returned document')} for ${x.scholarship}`, to: `/student/applications/${x.application_id}/apply`, cta: 'Re-upload' }),
  guidelines: (x) => ({ tone: 'blue', icon: 'fa-book-open', text: `Read your guidelines and terms for ${x.scholarship}`, to: '/student/applications', cta: 'Read now' }),
  payment: (x) => ({
    tone: 'amber',
    icon: 'fa-money-bill-transfer',
    text: x.rejected ? `Upload your payment receipt again for ${x.scholarship}` : `Pay and upload your receipt for ${x.scholarship}`,
    to: `/student/applications/${x.application_id}/apply`,
    cta: x.rejected ? 'Upload again' : 'Pay now',
  }),
  upload: (x) => ({ tone: 'blue', icon: 'fa-upload', text: `Upload ${plural(x.count, 'document')} for ${x.scholarship}`, to: `/student/applications/${x.application_id}/apply`, cta: 'Upload' }),
  interview: (x) => ({
    tone: 'amber',
    icon: 'fa-video',
    text: `Interview for ${x.scholarship}${x.at ? ` on ${formatDateTime(x.at)}` : ''}`,
    href: x.link || null,
    to: x.link ? null : '/student/applications',
    cta: x.link ? 'Join interview' : 'View details',
  }),
  awarded: (x) => ({ tone: 'green', icon: 'fa-trophy', text: `Contact ADRAM about your ${x.scholarship} award`, to: `/contact?subject=${encodeURIComponent(`Scholarship awarded: ${x.scholarship}`)}`, cta: 'Contact us' }),
};

/** The scholarships side of a student's portal: applications, saved scholarships, documents and deadlines. */
export const ScholarshipDashboard = () => {
  const { user } = useAuth();
  const portal = usePortal();
  const { data } = portal;
  const [actions, setActions] = useState(null);

  useEffect(() => {
    portalAPI.actions().then(({ data: d }) => setActions(d)).catch(() => setActions([]));
  }, []);

  const applications = data?.applications || [];
  const active = applications.filter((a) => !isClosed(a.stage));
  const docsToUpload = applications
    .filter((a) => a.service && ['payment_submitted', 'paid'].includes(a.service.status) && !isClosed(a.stage))
    .reduce((n, a) => n + a.documents.filter((d) => !d.has_file || d.review_status === 'returned').length, 0);

  // Deadlines from active applications and saved scholarships, soonest first.
  const deadlines = [
    ...active.map((a) => ({ key: `a${a.id}`, name: a.scholarship_name, date: a.deadline, to: '/student/applications', kind: 'Application' })),
    ...(data?.saved || []).map((s) => ({ key: `s${s.slug}`, name: s.name, date: s.deadline, to: `/scholarships/${s.slug}`, kind: 'Saved' })),
  ]
    .filter((d) => d.date && daysUntil(d.date) >= 0)
    .sort((x, y) => x.date.localeCompare(y.date))
    .slice(0, 5);

  const profileChecks = [true, Boolean(user?.phone_number), Boolean(user?.country), Boolean(user?.profile_picture)];
  const profilePct = Math.round((profileChecks.filter(Boolean).length / profileChecks.length) * 100);
  const hasGoals = Boolean(data && (data.goals.levels.length || data.goals.destinations.length));

  const todo = [
    ...(actions || []).map((x) => ({ key: `${x.kind}-${x.application_id}`, ...ACTION_VIEW[x.kind](x) })),
    ...(data && applications.length === 0 ? [{ key: 'start', tone: 'blue', icon: 'fa-magnifying-glass', text: 'Find a scholarship and start tracking your application', to: '/scholarships', cta: 'Browse' }] : []),
    ...(data && !hasGoals ? [{ key: 'goals', tone: 'gray', icon: 'fa-bullseye', text: 'Set your study goals to get better recommendations', to: '/student/saved#goals', cta: 'Set goals' }] : []),
    ...(profilePct < 100 ? [{ key: 'profile', tone: 'gray', icon: 'fa-user-pen', text: 'Complete your profile: phone number, country and photo', to: '/profile', cta: 'Complete' }] : []),
  ];

  let heroText = 'Welcome to your scholarships dashboard. Find a scholarship to get started.';
  if (actions?.length) heroText = `You have ${plural(actions.length, 'thing')} to do on your applications.`;
  else if (active.length) heroText = 'Your applications are on track. Here’s where everything stands.';

  return (
    <PortalLayout title="Scholarships overview" subtitle={todayFmt.format(new Date())}>
      <section className="ov-hero">
        <div className="ov-hero__copy">
          <p className="ov-hero__eyebrow">{greeting()},</p>
          <h2>{user?.first_name}</h2>
          <p>{heroText}</p>
          <div className="ov-hero__actions">
            <Link to="/scholarships" className="btn btn--light btn--sm"><i className="fas fa-magnifying-glass" /> Find scholarships</Link>
            <Link to="/student/applications" className="btn btn--ghost-light btn--sm"><i className="fas fa-list-check" /> My applications</Link>
            <Link to="/student/saved" className="btn btn--ghost-light btn--sm"><i className="fas fa-bookmark" /> Saved</Link>
          </div>
        </div>
        <DashboardArt className="ov-hero__art" />
        <Link to="/profile" className="ov-hero__ring" style={{ '--pct': `${profilePct}%` }} aria-label={`Profile ${profilePct}% complete`}>
          <span><strong>{profilePct}%</strong><small>profile</small></span>
        </Link>
      </section>

      {portal.error && <Alert>Your portal couldn’t be loaded. Refresh the page to try again.</Alert>}

      <div className="ov-kpis">
        <Kpi icon="fa-list-check" label="Active applications" value={data ? active.length : null} note={data ? `${applications.length} in total` : ''} to="/student/applications" />
        <Kpi icon="fa-bookmark" label="Saved scholarships" value={data ? data.saved.length : null} note="Your shortlist" to="/student/saved" tone="violet" />
        <Kpi icon="fa-file-arrow-up" label="Documents to upload" value={data ? docsToUpload : null} note={docsToUpload ? 'Needed for ADRAM to apply' : 'Nothing waiting'} to="/student/applications" tone={docsToUpload ? 'amber' : 'green'} />
        <Kpi
          icon="fa-hourglass-half"
          label="Next deadline"
          value={data ? (deadlines[0] ? `${daysUntil(deadlines[0].date)} days` : '—') : null}
          note={deadlines[0] ? deadlines[0].name : 'No upcoming deadlines'}
          tone={deadlines[0] && daysUntil(deadlines[0].date) <= 14 ? 'red' : 'cyan'}
        />
      </div>

      <div className="ov-grid">
        <div className="stack-lg">
          <section className="card panel">
            <div className="panel__head">
              <h2 className="h3">What to do next</h2>
              {todo.length > 0 && <span className="ov-count">{todo.length}</span>}
            </div>
            {actions === null && <div className="skeleton skeleton--block" />}
            {actions !== null && todo.length === 0 && (
              <div className="ov-empty"><i className="fas fa-circle-check" /> You’re all caught up. Anything you need to do will appear here.</div>
            )}
            <ul className="ov-todo">
              {todo.map((t) => (
                <li key={t.key} className={`ov-todo__item ov-todo__item--${t.tone}`}>
                  <span className="ov-todo__icon" aria-hidden="true"><i className={`fas ${t.icon}`} /></span>
                  <span className="ov-todo__text">{t.text}</span>
                  {t.href ? (
                    <a href={t.href} target="_blank" rel="noopener noreferrer" className="btn btn--primary btn--sm">{t.cta}</a>
                  ) : (
                    <Link to={t.to} className="btn btn--outline btn--sm">{t.cta}</Link>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="card panel">
            <div className="panel__head">
              <h2 className="h3">My applications</h2>
              <Link to="/student/applications" className="panel__link">View all</Link>
            </div>
            {!data && <div className="skeleton skeleton--block" />}
            {data && applications.length === 0 && (
              <div className="ov-empty"><i className="fas fa-folder-open" /> No applications yet. Open any scholarship and choose <strong>Track my application</strong>.</div>
            )}
            <ul className="ov-apps">
              {applications.slice(0, 5).map((a) => (
                <li key={a.id}>
                  <Link to={a.service ? `/student/applications/${a.id}/apply` : '/student/applications'} className="ov-app">
                    {a.country ? <Flag code={a.country} size={30} /> : <span className="ov-app__icon"><i className="fas fa-graduation-cap" /></span>}
                    <span className="ov-app__main">
                      <strong>{a.scholarship_name}</strong>
                      <span className="ov-app__meta">
                        {a.service ? 'ADRAM is applying for you' : 'Tracking it yourself'}
                        {a.deadline && ` · deadline ${formatDate(`${a.deadline}T00:00`)}`}
                      </span>
                      <span className="ov-app__bar" aria-hidden="true"><span style={{ width: `${progressOf(a)}%` }} /></span>
                    </span>
                    <StageBadge stage={a.stage} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>

        </div>

        <aside className="stack-lg">
          <MessagesPanel />

          <section className="card panel">
            <div className="panel__head"><h2 className="h3">Upcoming deadlines</h2></div>
            {data && deadlines.length === 0 && <p className="muted small">No upcoming deadlines. Save scholarships to see their deadlines here.</p>}
            <ol className="ov-deadlines">
              {deadlines.map((d) => {
                const days = daysUntil(d.date);
                const day = new Date(`${d.date}T00:00`);
                return (
                  <li key={d.key}>
                    <Link to={d.to}>
                      <span className={`ov-deadlines__date${days <= 14 ? ' is-soon' : ''}`}>
                        <strong>{day.getDate()}</strong>
                        <small>{day.toLocaleString(undefined, { month: 'short' })}</small>
                      </span>
                      <span className="ov-deadlines__main">
                        <strong>{d.name}</strong>
                        <small>{d.kind} · {days === 0 ? 'today' : `in ${days} days`}</small>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="card panel">
            <div className="panel__head">
              <h2 className="h3">Recommended for you</h2>
              <Link to="/student/saved" className="panel__link">More</Link>
            </div>
            <ul className="sch-rows">
              {data?.recommended.slice(0, 3).map((s) => (
                <ScholarshipRow key={s.slug} scholarship={s}>
                  <button type="button" className="icon-btn" aria-label={`Save ${s.name}`} title="Save" onClick={() => portal.toggleSave(s)}><i className="far fa-bookmark" /></button>
                </ScholarshipRow>
              ))}
            </ul>
          </section>

          <SecurityPanel />

          <section className="card panel ov-help">
            <span className="ov-help__icon" aria-hidden="true"><i className="fas fa-headset" /></span>
            <h2 className="h3">Need help?</h2>
            <p className="muted small">A counsellor can review your eligibility, essays and documents.</p>
            <Link to="/contact?subject=Scholarship%20consultation" className="btn btn--primary btn--sm btn--block">Book a consultation</Link>
          </section>
        </aside>
      </div>
    </PortalLayout>
  );
};

export default ScholarshipDashboard;

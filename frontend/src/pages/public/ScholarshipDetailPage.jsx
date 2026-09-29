import { Link, useLocation, useParams } from 'react-router-dom';
import { commonDocuments, FUNDING } from '../../data/scholarships';
import { useScholarship, useScholarships } from '../../data/useCatalog';
import { formatDate } from '../../utils/format';
import { CtaBand, IconTile, PageHero, Spinner } from '../../components/ui/Section';
import Flag from '../../components/ui/Flag';
import { ShareButtons } from '../../components/ui/ShareLink';
import { OfficialLink, PortalButtons } from '../../components/ui/ScholarshipActions';
import { DeadlineBadge, KeyDatesTimeline } from '../../components/ui/KeyDates';
import ServiceOffer from '../../components/portal/ServiceOffer';
import { useAuth } from '../../context/AuthContext';
import usePortal from '../../data/usePortal';
import { NotFoundPage } from './StatusPages';
import '../../styles/pages.css';

export const ScholarshipDetailPage = () => {
  const { scholarshipId } = useParams();
  const { pathname } = useLocation();
  const { data: s, loading, error } = useScholarship(scholarshipId);
  const { data: all } = useScholarships();
  const { isAuthenticated } = useAuth();
  const portal = usePortal();

  if (loading) return <Spinner label="Loading scholarship…" />;
  if (error?.response?.status === 404) return <NotFoundPage />;
  if (error) {
    return (
      <section className="section">
        <div className="container finder-empty">
          <IconTile name="globe" />
          <h3>This scholarship couldn’t be loaded</h3>
          <p>Please check your connection and try again.</p>
          <Link to="/scholarships" className="btn btn--outline btn--sm">Back to scholarships</Link>
        </div>
      </section>
    );
  }

  const consultLink = `/contact?subject=${encodeURIComponent(`Scholarship help: ${s.name}`)}`;
  // Same destination first, then others, so the sidebar suggests the most relevant alternatives.
  const others = (all || []).filter((x) => x.slug !== s.slug);
  const related = [...others.filter((x) => x.country === s.country), ...others.filter((x) => x.country !== s.country)].slice(0, 4);

  const facts = [
    { icon: 'fa-location-dot', label: 'Destination', value: s.country_name },
    { icon: 'fa-graduation-cap', label: 'Level', value: s.levels.join(', ') },
    { icon: 'fa-sack-dollar', label: 'Funding', value: FUNDING[s.funding] },
    ...(s.duration ? [{ icon: 'fa-hourglass-half', label: 'Duration', value: s.duration }] : []),
    ...(s.fields ? [{ icon: 'fa-book-open', label: 'Fields', value: s.fields }] : []),
    ...(s.application_window ? [{ icon: 'fa-calendar-days', label: 'Application window', value: s.application_window }] : []),
    ...(s.deadline ? [{ icon: 'fa-flag-checkered', label: 'Next deadline', value: formatDate(`${s.deadline}T00:00`) }] : []),
  ];

  return (
    <>
      {!s.is_published && (
        <div className="draft-bar" role="status">
          <i className="fas fa-eye-slash" aria-hidden="true" /> Draft preview: this scholarship isn’t on the public website yet.
        </div>
      )}
      <PageHero
        title={s.name}
        crumbs={[{ to: '/scholarships', label: 'Scholarships' }, { label: s.name }]}
        art={
          <div className="sch-hero-card" aria-hidden="true">
            <div className="sch-hero-card__flag"><Flag code={s.country} size={96} /></div>
            <span className="sch-hero-card__dest">{s.country_name}</span>
            <strong className="sch-hero-card__name">{s.name}</strong>
            <span className={`badge ${s.funding === 'full' ? 'badge--green' : 'badge--amber'}`}>{FUNDING[s.funding]}</span>
            <ul>
              {s.covers.slice(0, 3).map((c) => (
                <li key={c}><i className="fas fa-check" /> {c}</li>
              ))}
            </ul>
          </div>
        }
        actions={
          <>
            <Link to={consultLink} className="btn btn--primary">
              <i className="fas fa-handshake-angle" /> Get help applying
            </Link>
            <OfficialLink scholarship={s} className="btn btn--ghost-light">
              <i className="fas fa-arrow-up-right-from-square" /> Official website
            </OfficialLink>
            <PortalButtons scholarship={s} portal={portal} signedIn={isAuthenticated} />
          </>
        }
      >
        <span className="sch-hero-meta">
          <span className="sch-hero-meta__flag"><Flag code={s.country} size={30} /> {s.country_name}</span>
          <span className={`badge ${s.funding === 'full' ? 'badge--green' : 'badge--amber'}`}>{FUNDING[s.funding]}</span>
          {s.levels.map((l) => (
            <span key={l} className="badge badge--glass">{l}</span>
          ))}
        </span>
        <span className="d-block sch-hero-provider">Offered by {s.provider}</span>
        <span className="d-block sch-hero-deadline"><DeadlineBadge scholarship={s} /></span>
      </PageHero>

      <section className="section">
        <div className="container detail-layout">
          <div className="detail-main">
            <section className="detail-block">
              <span className="eyebrow">Overview</span>
              <h2>About this scholarship</h2>
              <p className="detail-lead">{s.summary}</p>
            </section>

            <section className="detail-block" id="key-dates">
              <h3 className="detail-title">Key dates</h3>
              <KeyDatesTimeline scholarship={s} />
              <p className="sch-disclaimer">
                <i className="fas fa-circle-info" aria-hidden="true" /> Dates can change each year; ADRAM updates them when the provider announces the new cycle.
              </p>
            </section>

            {s.service_enabled && (
              <section className="detail-block" id="apply-with-adram">
                <ServiceOffer
                  info={s}
                  requestedAt={portal.applicationFor(s.slug)?.service_requested_at}
                  action={
                    !isAuthenticated ? (
                      <Link to={`/join?next=${encodeURIComponent(pathname)}`} className="btn btn--primary">
                        <i className="fas fa-user-plus" /> Join free to ask ADRAM to apply
                      </Link>
                    ) : portal.isStudent ? (
                      <button type="button" className="btn btn--primary" disabled={!portal.data} onClick={() => portal.applyWithAdram(s)}>
                        <i className="fas fa-handshake-angle" /> Ask ADRAM to apply for me
                      </button>
                    ) : null
                  }
                />
              </section>
            )}

            {s.covers.length > 0 && (
              <section className="detail-block">
                <h3 className="detail-title">What it covers</h3>
                <div className="included-grid">
                  {s.covers.map((c) => (
                    <div key={c} className="included">
                      <i className="fas fa-circle-check" aria-hidden="true" />
                      {c}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {s.locked && (
              <section className="detail-block">
                <div className="locked-panel">
                  <span className="locked-panel__icon"><i className="fas fa-lock" aria-hidden="true" /></span>
                  <div>
                    <h3>Sign in to see the full details</h3>
                    <p>
                      Who can apply, the application steps{s.hide_official_link ? '' : ' and the official website'} are available to
                      ADRAM members. Creating an account is free.
                    </p>
                  </div>
                  <div className="locked-panel__actions">
                    <Link to="/login" state={{ from: pathname }} className="btn btn--primary">
                      <i className="fas fa-right-to-bracket" /> Sign in
                    </Link>
                    <Link to="/register" className="btn btn--outline">
                      <i className="fas fa-user-plus" /> Create free account
                    </Link>
                  </div>
                </div>
              </section>
            )}

            {s.eligibility.length > 0 && (
              <section className="detail-block">
                <h3 className="detail-title">Who can apply</h3>
                <ul className="check-list check-list--lg">
                  {s.eligibility.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </section>
            )}

            {s.steps.length > 0 && (
              <section className="detail-block">
                <h3 className="detail-title">How to apply</h3>
                <ol className="timeline">
                  {s.steps.map((step, i) => (
                    <li key={step}>
                      <span className="timeline__num">{i + 1}</span>
                      <div>
                        <p className="timeline__text">{step}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            <section className="detail-block">
              <h3 className="detail-title">Documents to prepare</h3>
              <div className="included-grid">
                {commonDocuments.map((d) => (
                  <div key={d} className="included included--doc">
                    <i className="far fa-file-lines" aria-hidden="true" />
                    {d}
                  </div>
                ))}
              </div>
              <p className="sch-disclaimer">
                <i className="fas fa-circle-info" aria-hidden="true" /> Requirements differ between programmes and change
                every year.{' '}
                {s.url || s.link_locked ? (
                  <>
                    Always check the latest guidance on the{' '}
                    <OfficialLink scholarship={s}>official {s.name} website</OfficialLink>.
                  </>
                ) : (
                  <>Our counsellors can confirm the current rules with you before you apply.</>
                )}
              </p>
            </section>

            <section className="detail-block">
              <div className="help-banner">
                <IconTile name="support" tone="glow" />
                <div>
                  <h3>Apply with ADRAM’s support</h3>
                  <p>
                    Our counsellors review your eligibility, help you write strong essays and statements, check your
                    documents and keep you on track for every deadline.
                  </p>
                </div>
                <Link to={consultLink} className="btn btn--primary">
                  <i className="fas fa-comments" /> Book a consultation
                </Link>
              </div>
            </section>
          </div>

          <aside className="detail-aside">
            <div className="aside-card">
              <h3>Key facts</h3>
              <dl className="facts-list">
                {facts.map((f) => (
                  <div key={f.label}>
                    <dt><i className={`fas ${f.icon}`} aria-hidden="true" /> {f.label}</dt>
                    <dd>{f.value}</dd>
                  </div>
                ))}
              </dl>
              {s.url || s.link_locked ? (
                <OfficialLink scholarship={s} className="btn btn--outline btn--block">
                  <i className="fas fa-arrow-up-right-from-square" /> Visit official website
                </OfficialLink>
              ) : (
                <Link to={consultLink} className="btn btn--outline btn--block">
                  <i className="fas fa-handshake-angle" /> Apply with ADRAM’s help
                </Link>
              )}
              {s.link_locked && <p className="aside-note"><i className="fas fa-lock" /> Official links are for ADRAM members. Joining is free.</p>}
              <div className="share-row">
                <ShareButtons path={pathname} title={s.name} className="btn btn--outline btn--sm" />
              </div>
            </div>

            {related.length > 0 && (
              <div className="aside-card">
                <h3>More scholarships</h3>
                <ul className="aside-links">
                  {related.map((r) => (
                    <li key={r.slug}>
                      <Link to={`/scholarships/${r.slug}`}>
                        <Flag code={r.country} size={22} />
                        <span>{r.name}</span>
                        <i className="fas fa-chevron-right" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link to="/scholarships#finder" className="link-arrow">
                  Browse all scholarships <i className="fas fa-arrow-right" />
                </Link>
              </div>
            )}

            <div className="aside-card aside-card--cta">
              <IconTile name="graduate" tone="glow" />
              <h3>Track your application</h3>
              <p>Create a free ADRAM account to save scholarships, track deadlines and work with a counsellor.</p>
              <Link to="/register" className="btn btn--primary btn--block">
                <i className="fas fa-user-plus" /> Create free account
              </Link>
              <Link to={consultLink} className="btn btn--ghost-light btn--block aside-card__second">
                <i className="fas fa-envelope" /> Ask a question
              </Link>
            </div>
          </aside>
        </div>
      </section>

      <CtaBand
        title={`Thinking about the ${s.name}?`}
        text="Tell us about your background and goals. A counsellor will help you decide if it’s the right fit and how to apply."
        to={consultLink}
      />
    </>
  );
};

export default ScholarshipDetailPage;

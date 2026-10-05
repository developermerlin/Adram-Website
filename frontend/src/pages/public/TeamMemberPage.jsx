import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { teamAPI, parseApiErrors } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { assetUrl } from '../../utils/assets';
import Markdown from '../../components/blog/Markdown';
import { CtaBand } from '../../components/ui/Section';
import { SOCIAL_NETWORKS, initials } from '../../components/team/teamShared';
import '../../styles/pages.css';
import '../../styles/team.css';

const yearRange = (start, end, current) => [start, current ? 'Present' : end].filter(Boolean).join(' – ');

const Section = ({ id, title, icon, children }) => (
  <section className="tm-section" id={id} aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`}><i className={`fas ${icon}`} aria-hidden="true" /> {title}</h2>
    {children}
  </section>
);

/** /team/:slug — a team member's portfolio: who they are, what they've done, their CV, and a way to message them. */
export const TeamMemberPage = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [p, setP] = useState(null);
  const [failed, setFailed] = useState('');

  useEffect(() => {
    teamAPI.member(slug).then(({ data }) => setP(data))
      .catch((err) => setFailed(err.response?.status === 404 ? 'This team member’s page isn’t available.' : parseApiErrors(err).detail || 'This page couldn’t be loaded.'));
  }, [slug]);

  useEffect(() => {
    if (!p) return undefined;
    const before = document.title;
    document.title = `${p.name}${p.job_title ? `, ${p.job_title}` : ''} | ADRAM Technologies`;
    return () => { document.title = before; };
  }, [p]);

  if (failed) {
    return (
      <section className="section"><div className="container tm-missing">
        <i className="fas fa-user-slash" aria-hidden="true" />
        <h1 className="h2">{failed}</h1>
        <Link to="/about/team" className="btn btn--primary"><i className="fas fa-users" /> Meet the team</Link>
      </div></section>
    );
  }
  if (!p) return <section className="section"><div className="container"><div className="skeleton skeleton--block" style={{ height: 360 }} /></div></section>;

  const first = p.name.split(' ')[0];
  const isSelf = user?.id === p.member_id;
  const canMessage = p.allow_chat && !isSelf;
  const message = () => {
    const to = `/messages?member=${p.member_id}`;
    if (!isAuthenticated) navigate('/login', { state: { from: to } });
    else navigate(to);
  };
  const openCv = async () => {
    try {
      await teamAPI.openCv(p.slug);
    } catch {
      toast.error('The CV couldn’t be opened.');
    }
  };
  const socials = SOCIAL_NETWORKS.filter((n) => p.socials?.[n.id]);
  const sections = [
    ['about', 'About', p.bio],
    ['experience', 'Experience', p.experience.length],
    ['projects', 'Projects', p.projects.length],
    ['education', 'Education', p.education.length],
    ['certifications', 'Certifications', p.certifications.length],
    ['achievements', 'Achievements', p.achievements.length],
    ['testimonials', 'Testimonials', p.testimonials.length],
  ].filter(([, , has]) => has);

  return (
    <>
      {!p.is_published && (
        <div className="tm-preview" role="status"><i className="fas fa-eye-slash" aria-hidden="true" /> Preview: this profile isn’t published yet, so only you and administrators can see it.</div>
      )}
      <header className="tm-hero">
        <div className="tm-hero__cover" style={p.cover ? { backgroundImage: `url(${assetUrl(p.cover)})` } : undefined} aria-hidden="true" />
        <div className="container tm-hero__inner">
          <nav className="breadcrumb tm-crumbs" aria-label="Breadcrumb">
            <Link to="/">Home</Link><span>/</span><Link to="/about/team">Our team</Link><span>/</span><span aria-current="page">{p.name}</span>
          </nav>
          <div className="tm-card">
            <div className="tm-card__photo">
              {p.photo ? <img src={assetUrl(p.photo)} alt={p.name} width="168" height="168" /> : <span aria-hidden="true">{initials(p.name)}</span>}
            </div>
            <div className="tm-card__main">
              <h1>{p.name}</h1>
              <p className="tm-card__role">{[p.job_title, p.department].filter(Boolean).join(' · ') || 'ADRAM Technologies'}</p>
              {p.headline && <p className="tm-card__headline">{p.headline}</p>}
              <ul className="tm-card__facts">
                {p.location && <li><i className="fas fa-location-dot" aria-hidden="true" /> {p.location}</li>}
                {p.years_experience != null && <li><i className="fas fa-briefcase" aria-hidden="true" /> {p.years_experience}+ years’ experience</li>}
                {p.languages.length > 0 && <li><i className="fas fa-language" aria-hidden="true" /> {p.languages.join(', ')}</li>}
              </ul>
              <div className="tm-card__actions">
                {canMessage && <button type="button" className="btn btn--primary" onClick={message}><i className="fas fa-comments" /> Message {first}</button>}
                {p.cv.generated && <Link to={`/team/${p.slug}/cv`} className="btn btn--outline"><i className="fas fa-file-lines" /> View CV</Link>}
                {p.cv.file && p.cv.allowed && <button type="button" className="btn btn--outline" onClick={openCv}><i className="fas fa-file-pdf" /> Download CV</button>}
                {p.cv.needs_sign_in && (
                  <button type="button" className="btn btn--outline" onClick={() => navigate('/login', { state: { from: `/team/${p.slug}` } })}>
                    <i className="fas fa-lock" /> Sign in to view the CV
                  </button>
                )}
                {p.can_edit && <Link to={user?.role === 'ADMIN' ? `/admin/team/${p.id}` : '/team-profile'} className="btn btn--text"><i className="fas fa-pen" /> Edit</Link>}
              </div>
              {socials.length > 0 && (
                <div className="tm-card__social">
                  {socials.map((n) => (
                    <a key={n.id} href={n.id === 'whatsapp' ? `https://wa.me/${p.socials.whatsapp.replace(/[^\d]/g, '')}` : p.socials[n.id]}
                      target="_blank" rel="noopener noreferrer" aria-label={`${p.name} on ${n.label}`} title={n.label} style={{ '--brand': n.brand }}>
                      <i className={n.icon} aria-hidden="true" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {sections.length > 1 && (
        <nav className="tm-subnav" aria-label="On this page">
          <div className="container">
            {sections.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
          </div>
        </nav>
      )}

      <div className="container tm-layout">
        <div className="tm-main">
          {p.bio && (
            <Section id="about" title={`About ${first}`} icon="fa-user">
              <div className="tm-bio"><Markdown source={p.bio} /></div>
            </Section>
          )}

          {p.experience.length > 0 && (
            <Section id="experience" title="Experience" icon="fa-briefcase">
              <ol className="tm-timeline">
                {p.experience.map((e, i) => (
                  <li key={i}>
                    <div className="tm-timeline__head">
                      <h3>{e.title}</h3>
                      <span className="tm-when">{yearRange(e.start, e.end, e.current)}</span>
                    </div>
                    <p className="tm-org">{[e.organisation, e.location].filter(Boolean).join(' · ')}</p>
                    {e.description && <p className="tm-desc">{e.description}</p>}
                  </li>
                ))}
              </ol>
            </Section>
          )}

          {p.projects.length > 0 && (
            <Section id="projects" title="Selected projects" icon="fa-diagram-project">
              <div className="tm-projects">
                {p.projects.map((pr, i) => (
                  <article key={i} className="tm-project">
                    {pr.image && <img src={assetUrl(pr.image)} alt="" loading="lazy" />}
                    <div className="tm-project__body">
                      <h3>{pr.title}</h3>
                      {pr.description && <p>{pr.description}</p>}
                      {pr.tags?.length > 0 && <ul className="tm-tags">{pr.tags.map((t) => <li key={t}>{t}</li>)}</ul>}
                      {pr.url && <a href={pr.url} target="_blank" rel="noopener noreferrer" className="link-arrow">View project <i className="fas fa-arrow-up-right-from-square" /></a>}
                    </div>
                  </article>
                ))}
              </div>
            </Section>
          )}

          {p.education.length > 0 && (
            <Section id="education" title="Education" icon="fa-graduation-cap">
              <ol className="tm-timeline">
                {p.education.map((e, i) => (
                  <li key={i}>
                    <div className="tm-timeline__head"><h3>{e.qualification}</h3><span className="tm-when">{yearRange(e.start, e.end)}</span></div>
                    {e.institution && <p className="tm-org">{e.institution}</p>}
                    {e.description && <p className="tm-desc">{e.description}</p>}
                  </li>
                ))}
              </ol>
            </Section>
          )}

          {p.certifications.length > 0 && (
            <Section id="certifications" title="Certifications" icon="fa-certificate">
              <ul className="tm-certs">
                {p.certifications.map((c, i) => (
                  <li key={i}>
                    <span className="tm-certs__icon" aria-hidden="true"><i className="fas fa-award" /></span>
                    <div>
                      <strong>{c.url ? <a href={c.url} target="_blank" rel="noopener noreferrer">{c.name}</a> : c.name}</strong>
                      <small>{[c.issuer, c.year].filter(Boolean).join(' · ')}</small>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {p.achievements.length > 0 && (
            <Section id="achievements" title="Achievements" icon="fa-trophy">
              <ul className="tm-achievements">
                {p.achievements.map((a, i) => (
                  <li key={i}><strong>{a.title}</strong>{a.year && <span className="tm-when">{a.year}</span>}{a.description && <p>{a.description}</p>}</li>
                ))}
              </ul>
            </Section>
          )}

          {p.testimonials.length > 0 && (
            <Section id="testimonials" title="What people say" icon="fa-quote-left">
              <div className="tm-quotes">
                {p.testimonials.map((t, i) => (
                  <figure key={i} className="tm-quote">
                    <blockquote>“{t.quote}”</blockquote>
                    {(t.author || t.role) && <figcaption><strong>{t.author}</strong>{t.role && <span>{t.role}</span>}</figcaption>}
                  </figure>
                ))}
              </div>
            </Section>
          )}

          {sections.length === 0 && <p className="muted tm-empty">{first}’s portfolio is being prepared.</p>}
        </div>

        <aside className="tm-side">
          {(canMessage || p.public_email || p.public_phone) && (
            <section className="tm-box tm-contact">
              <h2>Get in touch</h2>
              {canMessage && (
                <button type="button" className="btn btn--primary tm-contact__btn" onClick={message}>
                  <i className="fas fa-comments" /> Send {first} a message
                </button>
              )}
              {canMessage && <p className="muted small">{isAuthenticated ? 'Your conversation opens in your portal.' : 'Sign in or create a free account to start a conversation.'}</p>}
              <ul>
                {p.public_email && <li><i className="fas fa-envelope" aria-hidden="true" /> <a href={`mailto:${p.public_email}`}>{p.public_email}</a></li>}
                {p.public_phone && <li><i className="fas fa-phone" aria-hidden="true" /> <a href={`tel:${p.public_phone.replace(/\s+/g, '')}`}>{p.public_phone}</a></li>}
              </ul>
            </section>
          )}

          {p.skills.length > 0 && (
            <section className="tm-box">
              <h2>Skills</h2>
              <ul className="tm-skills">
                {p.skills.map((s) => (
                  <li key={s.name}>
                    <span className="tm-skills__top"><span>{s.name}</span><small>{s.level}%</small></span>
                    <span className="tm-skills__bar" role="meter" aria-valuenow={s.level} aria-valuemin={0} aria-valuemax={100} aria-label={`${s.name}: ${s.level}%`}>
                      <span style={{ width: `${s.level}%` }} />
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {p.expertise.length > 0 && (
            <section className="tm-box">
              <h2>Areas of expertise</h2>
              <ul className="tm-tags tm-tags--lg">{p.expertise.map((x) => <li key={x}>{x}</li>)}</ul>
            </section>
          )}

          {(p.cv.generated || (p.cv.file && p.cv.allowed)) && (
            <section className="tm-box tm-cvbox">
              <h2>Curriculum vitae</h2>
              <p className="muted small">{first}’s full CV: experience, education, skills and certifications.</p>
              <div className="tm-cvbox__actions">
                {p.cv.generated && <Link to={`/team/${p.slug}/cv`} className="btn btn--outline btn--sm"><i className="fas fa-file-lines" /> View CV</Link>}
                {p.cv.file && p.cv.allowed && <button type="button" className="btn btn--outline btn--sm" onClick={openCv}><i className="fas fa-file-pdf" /> PDF</button>}
              </div>
            </section>
          )}
        </aside>
      </div>

      <CtaBand title={`Work with ${first} and the ADRAM team`} text="Tell us about your project or the skills you want to learn, and we’ll get back to you within one working day." />
    </>
  );
};

export default TeamMemberPage;

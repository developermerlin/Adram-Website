import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePageContent } from '../../content/useContent';
import { teamAPI } from '../../services/api';
import { assetUrl } from '../../utils/assets';
import { CtaBand, PageHero } from '../../components/ui/Section';
import { SOCIAL_NETWORKS, initials } from '../../components/team/teamShared';
import '../../styles/pages.css';
import '../../styles/team.css';

/** One member on the Team page; the whole card opens their portfolio. */
const MemberCard = ({ member, index }) => {
  const { name, job_title: role, headline, skills = [], photo, socials = {}, slug, featured, location } = member;
  const links = SOCIAL_NETWORKS.filter((n) => socials[n.id] && n.id !== 'whatsapp').slice(0, 3);
  return (
    <article className={`team-card tc team-card--${index % 4}${featured ? ' team-card--featured' : ''}`}>
      <div className="tc__photo">
        {photo ? <img src={assetUrl(photo)} alt={`${name}, ${role}`} loading="lazy" width="300" height="300" /> : <span aria-hidden="true">{initials(name)}</span>}
        {featured && <span className="tc__badge">Featured</span>}
      </div>
      <div className="team-card__body">
        <h3><Link to={`/team/${slug}`} className="team-card__link">{name}</Link></h3>
        <p className="team-card__role">{role}</p>
        {location && <p className="team-card__where" title={location}><i className="fas fa-location-dot" aria-hidden="true" /> {location}</p>}
        {headline && <p className="team-card__bio">{headline}</p>}
        {skills.length > 0 && <ul className="team-card__skills">{skills.slice(0, 3).map((s) => <li key={s}>{s}</li>)}</ul>}
      </div>
      <div className="team-card__foot">
        <div className="team-card__social">
          {links.map((n) => (
            <a key={n.id} href={socials[n.id]} target="_blank" rel="noopener noreferrer" aria-label={`${name} on ${n.label}`} title={n.label} style={{ '--brand': n.brand }}>
              <i className={n.icon} aria-hidden="true" />
            </a>
          ))}
        </div>
        <span className="team-card__more" aria-hidden="true">View profile <i className="fas fa-arrow-right" /></span>
      </div>
    </article>
  );
};

/** The heading over the cards: label, title and introduction (Site content), with figures from the profiles. */
const TeamIntro = ({ intro = {}, members }) => {
  const years = (members || []).reduce((n, m) => n + (Number(m.years_experience) || 0), 0);
  const skills = new Set((members || []).flatMap((m) => m.skills || [])).size;
  const facts = members?.length ? [
    { value: members.length, label: members.length === 1 ? 'Team member' : 'Team members', icon: 'fa-people-group' },
    years > 0 && { value: `${years}+`, label: 'Years of combined experience', icon: 'fa-briefcase' },
    skills > 0 && { value: skills, label: 'Skills across the team', icon: 'fa-screwdriver-wrench' },
  ].filter(Boolean) : [];
  if (!intro.title && !facts.length) return null;
  return (
    <div className="team-intro">
      <div className="team-intro__copy">
        {intro.eyebrow && <span className="eyebrow">{intro.eyebrow}</span>}
        {intro.title && <h2>{intro.title}</h2>}
        {intro.text && <p>{intro.text}</p>}
      </div>
      {facts.length > 0 && (
        <dl className="team-intro__facts">
          {facts.map((f) => (
            <div key={f.label}>
              <span className="team-intro__icon" aria-hidden="true"><i className={`fas ${f.icon}`} /></span>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
};

export const TeamPage = () => {
  const c = usePageContent('team');
  const [members, setMembers] = useState(null);
  useEffect(() => {
    teamAPI.members().then(({ data }) => setMembers(data.results)).catch(() => setMembers([]));
  }, []);

  return (
    <>
      <PageHero
        eyebrow={c.hero.eyebrow}
        title={c.hero.title}
        crumbs={[{ to: '/about', label: 'About' }, { label: c.hero.eyebrow }]}
        background={c.hero.image || undefined}
        actions={
          <>
            {c.hero.primaryLabel && (
              <Link to="/contact?subject=Working%20with%20the%20team" className="btn btn--primary">
                <i className="fas fa-envelope" /> {c.hero.primaryLabel}
              </Link>
            )}
            {c.hero.secondaryLabel && (
              <Link to="/about" className="btn btn--ghost-light">
                <i className="fas fa-building" /> {c.hero.secondaryLabel}
              </Link>
            )}
          </>
        }
      >
        {c.hero.lead}
      </PageHero>

      <section className="section">
        <div className="container">
          <TeamIntro intro={c.intro} members={members} />
          {members === null && <div className="team-grid">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton skeleton--block" style={{ height: 380 }} />)}</div>}
          {members?.length === 0 && (
            <div className="tm-missing">
              <i className="fas fa-people-group" aria-hidden="true" />
              <p className="muted">Our team profiles are on their way.</p>
            </div>
          )}
          {members?.length > 0 && (
            <div className="team-grid">
              {members.map((m, i) => <MemberCard key={m.slug} member={m} index={i} />)}
            </div>
          )}
        </div>
      </section>

      <CtaBand title={c.cta.title} text={c.cta.text} />
    </>
  );
};

export default TeamPage;

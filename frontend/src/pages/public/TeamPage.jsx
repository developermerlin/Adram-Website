import { Link } from 'react-router-dom';
import { usePageContent } from '../../content/useContent';
import { assetUrl } from '../../utils/assets';
import { CtaBand, PageHero } from '../../components/ui/Section';
import '../../styles/pages.css';

// How each social handle in data/team.js is shown, in this order. `brand` is the network's own colour.
const NETWORKS = [
  { id: 'linkedin', label: 'LinkedIn', icon: 'fab fa-linkedin-in', brand: '#0a66c2' },
  { id: 'x', label: 'X (Twitter)', icon: 'fab fa-x-twitter', brand: '#111111' },
  { id: 'facebook', label: 'Facebook', icon: 'fab fa-facebook-f', brand: '#1877f2' },
  { id: 'instagram', label: 'Instagram', icon: 'fab fa-instagram', brand: '#dd2a7b' },
  { id: 'github', label: 'GitHub', icon: 'fab fa-github', brand: '#24292f' },
  { id: 'whatsapp', label: 'WhatsApp', icon: 'fab fa-whatsapp', brand: '#25d366' },
  { id: 'website', label: 'Website', icon: 'fas fa-globe', brand: '#1454e8' },
];

const initials = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

const MemberCard = ({ member, index }) => {
  const { name, role, bio, skills = [], photo, socials = {} } = member;
  const links = NETWORKS.filter((n) => socials[n.id]);
  return (
    <article className={`team-card team-card--${index % 4}`}>
      <div className="team-card__cover" aria-hidden="true" />
      <div className="team-card__avatar">
        {photo ? <img src={assetUrl(photo)} alt={`${name}, ${role}`} loading="lazy" width="200" height="200" /> : <span aria-hidden="true">{initials(name)}</span>}
      </div>
      <div className="team-card__body">
        <h3>{name}</h3>
        <p className="team-card__role">{role}</p>
        {bio && <p className="team-card__bio">{bio}</p>}
        {skills.length > 0 && (
          <ul className="team-card__skills">
            {skills.slice(0, 4).map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        )}
      </div>
      <div className="team-card__foot">
        <div className="team-card__social">
          {links.map((n) => (
            <a
              key={n.id}
              href={socials[n.id]}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${name} on ${n.label}`}
              title={n.label}
              style={{ '--brand': n.brand }}
            >
              <i className={n.icon} aria-hidden="true" />
            </a>
          ))}
        </div>
        {socials.email && (
          <a href={`mailto:${socials.email}`} className="team-card__mail" aria-label={`Email ${name}`}>
            <i className="fas fa-envelope" aria-hidden="true" /> Email
          </a>
        )}
      </div>
    </article>
  );
};

export const TeamPage = () => {
  const c = usePageContent('team');
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
          <div className="team-grid">
            {c.members.map((m, i) => (
              <MemberCard key={`${m.name}-${i}`} member={m} index={i} />
            ))}
          </div>
        </div>
      </section>

      <CtaBand title={c.cta.title} text={c.cta.text} />
    </>
  );
};

export default TeamPage;

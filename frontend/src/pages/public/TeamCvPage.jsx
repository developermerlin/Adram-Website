import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { teamAPI } from '../../services/api';
import { useSite } from '../../content/useContent';
import { assetUrl } from '../../utils/assets';
import Markdown from '../../components/blog/Markdown';
import { SOCIAL_NETWORKS, initials } from '../../components/team/teamShared';
import '../../styles/team.css';

const when = (start, end, current) => [start, current ? 'Present' : end].filter(Boolean).join(' – ');
// A skill's level in words (the bar shows it too)
const level = (n) => (n >= 90 ? 'Expert' : n >= 75 ? 'Advanced' : n >= 55 ? 'Proficient' : 'Intermediate');

/** /team/:slug/cv — a team member's CV, made from their profile, ready to print or save as PDF. */
export const TeamCvPage = () => {
  const { slug } = useParams();
  const site = useSite();
  const [p, setP] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    teamAPI.member(slug).then(({ data }) => (data.cv.generated ? setP(data) : setFailed(true))).catch(() => setFailed(true));
  }, [slug]);

  useEffect(() => {
    if (!p) return undefined;
    const before = document.title;
    document.title = `${p.name.replace(/\s+/g, '-')}-CV-ADRAM-Technologies`;
    return () => { document.title = before; };
  }, [p]);

  if (failed) {
    return (
      <main className="cv-page">
        <p className="cv-page__msg">This CV isn’t available. <Link to={`/team/${slug}`}>Back to the profile</Link></p>
      </main>
    );
  }
  if (!p) return <main className="cv-page"><p className="cv-page__msg">Preparing the CV…</p></main>;

  // The contact strip: email, phone, location, then the three most useful links (not every network)
  const short = (url) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
  const order = ['website', 'linkedin', 'github', 'x', 'facebook', 'instagram'];
  const links = order.map((id) => SOCIAL_NETWORKS.find((n) => n.id === id)).filter((n) => p.socials?.[n.id]).slice(0, 3);
  const contacts = [
    p.public_email && { key: 'email', icon: 'fas fa-envelope', text: p.public_email },
    p.public_phone && { key: 'phone', icon: 'fas fa-phone', text: p.public_phone },
    p.location && { key: 'location', icon: 'fas fa-location-dot', text: p.location },
    ...links.map((n) => ({ key: n.id, icon: n.icon, text: short(p.socials[n.id]) })),
  ].filter(Boolean);
  const openPdf = async () => {
    try { await teamAPI.openCv(p.slug); } catch { toast.error('The PDF couldn’t be opened.'); }
  };

  return (
    <main className="cv-page">
      <div className="cv-page__tools">
        <Link to={`/team/${p.slug}`} className="btn btn--outline btn--sm"><i className="fas fa-arrow-left" /> Back to the profile</Link>
        <span className="cv-page__spacer" />
        {p.cv.file && p.cv.allowed && <button type="button" className="btn btn--outline btn--sm" onClick={openPdf}><i className="fas fa-file-pdf" /> Original PDF</button>}
        <button type="button" className="btn btn--primary btn--sm" onClick={() => window.print()}><i className="fas fa-print" /> Print or save as PDF</button>
      </div>

      <article className="cv">
        <header className="cv__head">
          <div className="cv__photo">{p.photo ? <img src={assetUrl(p.photo)} alt="" /> : <span>{initials(p.name)}</span>}</div>
          <div className="cv__id">
            <h1>{p.name}</h1>
            {(p.job_title || p.department) && <p className="cv__title">{[p.job_title, p.department].filter(Boolean).join(' · ')}</p>}
            {p.headline && <p className="cv__headline">{p.headline}</p>}
          </div>
        </header>
        {contacts.length > 0 && (
          <ul className="cv__contact" aria-label="Contact details">
            {contacts.map((c) => <li key={c.key}><i className={c.icon} aria-hidden="true" /> <span>{c.text}</span></li>)}
          </ul>
        )}

        <div className="cv__body">
          <aside className="cv__side">
            {p.skills.length > 0 && (
              <section>
                <h2>Skills</h2>
                <ul className="cv__skills">
                  {p.skills.map((s) => (
                    <li key={s.name}>
                      <span className="cv__skill-top"><span>{s.name}</span><small>{level(s.level)}</small></span>
                      <span className="cv__level" aria-label={`${s.name}: ${level(s.level)}`}><span style={{ width: `${s.level}%` }} /></span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {p.expertise.length > 0 && <section><h2>Expertise</h2><ul className="cv__list cv__list--plain">{p.expertise.map((x) => <li key={x}>{x}</li>)}</ul></section>}
            {p.languages.length > 0 && <section><h2>Languages</h2><ul className="cv__list cv__list--plain">{p.languages.map((l) => <li key={l}>{l}</li>)}</ul></section>}
            {p.certifications.length > 0 && (
              <section>
                <h2>Certifications</h2>
                <ul className="cv__list">{p.certifications.map((c, i) => <li key={i}><strong>{c.name}</strong>{(c.issuer || c.year) && <small>{[c.issuer, c.year].filter(Boolean).join(' · ')}</small>}</li>)}</ul>
              </section>
            )}
            {p.achievements.length > 0 && (
              <section>
                <h2>Achievements</h2>
                <ul className="cv__list">{p.achievements.map((a, i) => <li key={i}><strong>{a.title}</strong>{a.year && <small>{a.year}</small>}</li>)}</ul>
              </section>
            )}
          </aside>

          <div className="cv__main">
            {p.bio && <section><h2>Profile</h2><div className="cv__bio"><Markdown source={p.bio} /></div></section>}
            {p.experience.length > 0 && (
              <section>
                <h2>Experience</h2>
                {p.experience.map((e, i) => (
                  <div key={i} className="cv__entry">
                    <div className="cv__entry-head"><h3>{e.title}</h3><span className="cv__when">{when(e.start, e.end, e.current)}</span></div>
                    {(e.organisation || e.location) && <p className="cv__org">{[e.organisation, e.location].filter(Boolean).join(' · ')}</p>}
                    {e.description && <p className="cv__desc">{e.description}</p>}
                  </div>
                ))}
              </section>
            )}
            {p.education.length > 0 && (
              <section>
                <h2>Education</h2>
                {p.education.map((e, i) => (
                  <div key={i} className="cv__entry">
                    <div className="cv__entry-head"><h3>{e.qualification}</h3><span className="cv__when">{when(e.start, e.end)}</span></div>
                    {e.institution && <p className="cv__org">{e.institution}</p>}
                    {e.description && <p className="cv__desc">{e.description}</p>}
                  </div>
                ))}
              </section>
            )}
            {p.projects.length > 0 && (
              <section>
                <h2>Selected projects</h2>
                {p.projects.map((pr, i) => (
                  <div key={i} className="cv__entry">
                    <h3>{pr.title}</h3>
                    {pr.description && <p className="cv__desc">{pr.description}</p>}
                    {pr.tags?.length > 0 && <ul className="cv__tags">{pr.tags.map((t) => <li key={t}>{t}</li>)}</ul>}
                  </div>
                ))}
              </section>
            )}
          </div>
        </div>
        <footer className="cv__foot">{p.name} · Curriculum vitae · ADRAM Technologies, {site.location || 'Freetown, Sierra Leone'}</footer>
      </article>
    </main>
  );
};

export default TeamCvPage;

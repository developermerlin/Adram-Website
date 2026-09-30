import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { lmsAPI } from '../../services/api';
import { Spinner } from '../../components/ui/Section';
import CourseCard from '../../components/lms/CourseCard';
import Stars from '../../components/lms/Stars';
import useWishlist from '../../components/lms/useWishlist';
import { assetUrl } from '../../utils/assets';
import { formatDate } from '../../utils/format';
import { paragraphs } from '../../utils/lms';
import { NotFoundPage } from './StatusPages';
import '../../styles/lms.css';
import '../../styles/marketplace.css';
import '../../styles/shop.css';

const LINKS = [
  ['website', 'fas fa-globe', 'Website'],
  ['linkedin', 'fab fa-linkedin', 'LinkedIn'],
  ['twitter', 'fab fa-x-twitter', 'X (Twitter)'],
  ['youtube', 'fab fa-youtube', 'YouTube'],
  ['github', 'fab fa-github', 'GitHub'],
  ['facebook', 'fab fa-facebook', 'Facebook'],
];
const fmt = new Intl.NumberFormat();
const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

/** An instructor's public page: who they are, what they teach and what students say. */
export const InstructorProfilePage = () => {
  const { id } = useParams();
  const wish = useWishlist();
  const [state, setState] = useState({ data: null, missing: false });

  useEffect(() => {
    let live = true;
    lmsAPI.instructor(id).then(({ data }) => live && setState({ data, missing: false })).catch(() => live && setState({ data: null, missing: true }));
    return () => {
      live = false;
    };
  }, [id]);

  const { data: p, missing } = state;
  if (missing) return <NotFoundPage />;
  if (!p) return <Spinner label="Loading profile…" />;
  const links = LINKS.filter(([k]) => p.links[k]);

  return (
    <div className="container ip">
      <div className="ip-head">
        <div>
          <p className="ip-head__eyebrow">Instructor</p>
          <h1>{p.name}</h1>
          {p.headline && <p className="ip-head__headline">{p.headline}</p>}
          <div className="ip-stats">
            <div><small>Students</small><strong>{fmt.format(p.totals.students)}</strong></div>
            <div><small>Courses</small><strong>{p.totals.courses}</strong></div>
            <div><small>Reviews</small><strong>{fmt.format(p.totals.reviews)}</strong></div>
            {p.totals.reviews > 0 && <div><small>Rating</small><strong>{p.totals.rating.toFixed(1)} <Stars value={p.totals.rating} size={13} /></strong></div>}
          </div>
          {p.expertise.length > 0 && (
            <div className="program-card__topics" aria-label="Expertise">{p.expertise.map((e) => <span key={e} className="tag">{e}</span>)}</div>
          )}
          {p.bio && (
            <section className="ip-bio">
              <h2>About me</h2>
              {paragraphs(p.bio).map((para) => <p key={para.slice(0, 40)}>{para}</p>)}
            </section>
          )}
        </div>
        <aside className="ip-head__side">
          {p.photo ? <img src={assetUrl(p.photo)} alt="" className="ip-photo" /> : <span className="ip-photo ip-photo--initials" aria-hidden="true">{initials(p.name)}</span>}
          {links.length > 0 && (
            <div className="ip-links">
              {links.map(([k, icon, label]) => (
                <a key={k} href={p.links[k]} target="_blank" rel="noopener noreferrer"><i className={icon} aria-hidden="true" /> {label}</a>
              ))}
            </div>
          )}
        </aside>
      </div>

      <section>
        <h2>My courses ({p.courses.length})</h2>
        {p.courses.length === 0 ? <p className="muted">No published courses yet.</p> : (
          <div className="cc-grid">{p.courses.map((c) => <CourseCard key={c.slug} course={c} wish={wish} />)}</div>
        )}
      </section>

      {p.reviews.length > 0 && (
        <section>
          <h2>What students say</h2>
          <ul className="ip-reviews">
            {p.reviews.map((r) => (
              <li key={r.id}>
                <strong>{r.name}</strong> <Stars value={r.rating} size={12} />
                <div className="muted small">{r.course} · {formatDate(r.created_at)}</div>
                {r.comment && <p>{r.comment}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};

export default InstructorProfilePage;

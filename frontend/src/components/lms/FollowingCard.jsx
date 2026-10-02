import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { lmsAPI } from '../../services/api';
import { assetUrl } from '../../utils/assets';
import '../../styles/assignments.css';

/** The instructors the student follows (hidden when they follow nobody). */
export const FollowingCard = () => {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    lmsAPI.following().then(({ data }) => setRows(data)).catch(() => setRows([]));
  }, []);
  if (!rows?.length) return null;
  return (
    <section className="card panel">
      <div className="panel__head"><h2 className="h3">Instructors you follow</h2></div>
      <ul className="fw-list">
        {rows.map((r) => (
          <li key={r.id}>
            {r.photo ? <img src={assetUrl(r.photo)} alt="" /> : <span className="fw-list__initial" aria-hidden="true">{r.name.slice(0, 1)}</span>}
            <span>
              <Link to={`/instructors/${r.id}`}><strong>{r.name}</strong></Link>
              <small className="muted">{r.headline || `${r.courses} ${r.courses === 1 ? 'course' : 'courses'}`}</small>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default FollowingCard;

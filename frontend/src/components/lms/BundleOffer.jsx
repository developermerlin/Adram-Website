import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { lmsAPI } from '../../services/api';
import { money } from './courseUtils';
import '../../styles/bundles.css';


/** "Save with a bundle": the published bundles that include this course (nothing when there are none). */
export const BundleOffer = ({ slug }) => {
  const [bundles, setBundles] = useState([]);
  useEffect(() => {
    let live = true;
    lmsAPI.bundles({ course: slug }).then(({ data }) => live && setBundles(data)).catch(() => {});
    return () => {
      live = false;
    };
  }, [slug]);
  if (!bundles.length) return null;
  return (
    <section className="bd-offer" aria-label="Bundles with this course">
      <h2><i className="fas fa-layer-group" aria-hidden="true" /> Save with a bundle</h2>
      {bundles.map((b) => (
        <Link key={b.slug} to={`/bundles/${b.slug}`} className="bd-offer__item">
          <span>
            <strong>{b.title}</strong>
            <small className="muted">{b.course_count} courses{b.summary ? ` · ${b.summary}` : ''}</small>
          </span>
          <span className="bd-offer__price">
            <strong>{money(b.price)}</strong>
            {Number(b.savings) > 0 && <small>Save {b.savings_percent}%</small>}
          </span>
        </Link>
      ))}
    </section>
  );
};

export default BundleOffer;

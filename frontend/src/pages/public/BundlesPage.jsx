import { usePageContent } from '../../content/useContent';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { lmsAPI } from '../../services/api';
import { Spinner } from '../../components/ui/Section';
import { assetUrl } from '../../utils/assets';
import { money } from '../../components/lms/courseUtils';
import '../../styles/bundles.css';


/** /bundles: every published course bundle. */
export const BundlesPage = () => {
  const copy = usePageContent('store').bundles;
  const [bundles, setBundles] = useState(null);
  useEffect(() => {
    lmsAPI.bundles().then(({ data }) => setBundles(data)).catch(() => setBundles([]));
  }, []);
  if (!bundles) return <Spinner label="Loading bundles…" />;
  return (
    <div className="container bd-page">
      <h1>{copy.title}</h1>
      <p className="bd-summary">{copy.lead}</p>
      {bundles.length === 0 && <p className="muted">{copy.empty} <Link to="/courses">Browse all courses</Link>.</p>}
      <div className="bd-grid">
        {bundles.map((b) => (
          <Link key={b.slug} to={`/bundles/${b.slug}`} className="card bd-tile">
            <span className="bd-tile__thumbs" aria-hidden="true">
              {b.thumbnails.map((t, i) => (t ? <img key={i} src={assetUrl(t)} alt="" /> : <span key={i} />))}
            </span>
            <span className="bd-tile__body">
              <small className="bd-kicker">{b.course_count} courses</small>
              <strong>{b.title}</strong>
              {b.summary && <span className="muted small">{b.summary}</span>}
              <span className="bd-tile__price"><strong>{money(b.price)}</strong>{Number(b.savings) > 0 && <><s>{money(b.separate_price)}</s> <em>Save {b.savings_percent}%</em></>}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default BundlesPage;

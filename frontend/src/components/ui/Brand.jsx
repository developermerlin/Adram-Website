import { Link } from 'react-router-dom';
import { usePageContent } from '../../content/useContent';
import { assetUrl } from '../../utils/assets';

// The logo mark and its two lines of text come from the editable site-wide details.
export const Brand = ({ light = false, onClick }) => {
  const { name, brandName, brandSub, logo } = usePageContent('site');
  return (
    <Link to="/" className={`brand${light ? ' brand--light' : ''}`} onClick={onClick} aria-label={`${name} home`}>
      <img src={assetUrl(logo)} alt="" width="40" height="40" />
      <span className="brand__text">
        <span className="brand__name">{brandName}</span>
        {brandSub && <span className="brand__sub">{brandSub}</span>}
      </span>
    </Link>
  );
};

export default Brand;

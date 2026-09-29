import { Link } from 'react-router-dom';

export const Brand = ({ light = false, onClick }) => (
  <Link to="/" className={`brand${light ? ' brand--light' : ''}`} onClick={onClick} aria-label="ADRAM Technologies home">
    <img src="/brand/mark-192.png" alt="" width="40" height="40" />
    <span className="brand__text">
      <span className="brand__name">ADRAM</span>
      <span className="brand__sub">Technologies</span>
    </span>
  </Link>
);

export default Brand;

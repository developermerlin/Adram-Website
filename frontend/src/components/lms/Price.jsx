import { isPaid, money, onSale, priceOf, salePrice, STATUS_LABELS } from './courseUtils';
import '../../styles/marketplace.css';

/** A course's price: the sale price with the full price struck through while a sale is on. */
export const Price = ({ course, className = '' }) => {
  if (!isPaid(course)) return <span className={`price price--free ${className}`}><span className="price__now">{priceOf(course)}</span></span>;
  const sale = onSale(course);
  const off = sale ? Math.round(100 - (100 * salePrice(course)) / Number(course.price)) : 0;
  return (
    <span className={`price ${className}`}>
      <span className="price__now">{money(salePrice(course), course.currency)}</span>
      {sale && <span className="price__was">{money(course.price, course.currency)}</span>}
      {sale && off > 0 && <span className="price__off">{off}% off</span>}
    </span>
  );
};

/** A coloured pill for a course, order, report or submission status. */
export const StatusPill = ({ status, label }) => (
  <span className={`status-pill status-pill--${status}`}>{label || STATUS_LABELS[status] || String(status).replace(/_/g, ' ')}</span>
);

export default Price;

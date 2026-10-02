import { useEffect, useState } from 'react';
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

const left = (ms) => {
  const minutes = Math.max(0, Math.floor(ms / 60000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days >= 1) return `${days} day${days === 1 ? '' : 's'}${hours ? ` ${hours} h` : ''}`;
  if (hours >= 1) return `${hours} h ${minutes % 60} min`;
  return `${minutes % 60} min`;
};

/** "Easter sale ends in 2 days 4 h": how long the current price lasts (ticks every minute). */
export const SaleCountdown = ({ course }) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!course.sale_ends_at) return undefined;
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, [course.sale_ends_at]);
  if (!course.sale_ends_at || !onSale(course)) return null;
  const ms = new Date(course.sale_ends_at).getTime() - now;
  if (ms <= 0) return <p className="sale-left">This price has just ended. Refresh to see the current price.</p>;
  const urgent = ms < 24 * 3600 * 1000;
  return (
    <p className={`sale-left${urgent ? ' is-urgent' : ''}`}>
      <i className="fas fa-clock" aria-hidden="true" /> {course.sale_label && course.sale_label !== 'Sale' ? `${course.sale_label} ends` : 'Sale ends'} in <strong>{left(ms)}</strong>
    </p>
  );
};

/** A coloured pill for a course, order, report or submission status. */
export const StatusPill = ({ status, label }) => (
  <span className={`status-pill status-pill--${status}`}>{label || STATUS_LABELS[status] || String(status).replace(/_/g, ' ')}</span>
);

export default Price;

import { useState } from 'react';

/** Read-only stars for a rating from 0 to 5 (halves shown). */
export const Stars = ({ value = 0, size = 14 }) => (
  <span className="stars" role="img" aria-label={`${value} out of 5 stars`}>
    {[1, 2, 3, 4, 5].map((n) => (
      <i key={n} className={value >= n ? 'fas fa-star' : value >= n - 0.5 ? 'fas fa-star-half-stroke' : 'far fa-star'} style={{ fontSize: size }} aria-hidden="true" />
    ))}
  </span>
);

/** Stars a student can click to give a rating. */
export const StarInput = ({ value, onChange }) => {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <span className="stars stars--input" role="radiogroup" aria-label="Your rating" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} ${n === 1 ? 'star' : 'stars'}`}
          onMouseEnter={() => setHover(n)}
          onFocus={() => setHover(n)}
          onBlur={() => setHover(0)}
          onClick={() => onChange(n)}
        >
          <i className={shown >= n ? 'fas fa-star' : 'far fa-star'} aria-hidden="true" />
        </button>
      ))}
    </span>
  );
};

export default Stars;

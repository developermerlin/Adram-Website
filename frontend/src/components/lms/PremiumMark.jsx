/** Udemy's Premium mark: a rosette with a tick. */
const PremiumMark = ({ size = 18, className = 'uc__premium-mark' }) => (
  <svg className={className} viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
    <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"
      d="M12 2.5l2.2 1.6 2.7-.2.9 2.6 2.3 1.5-.8 2.6.8 2.6-2.3 1.5-.9 2.6-2.7-.2L12 19.1l-2.2-1.6-2.7.2-.9-2.6-2.3-1.5.8-2.6-.8-2.6 2.3-1.5.9-2.6 2.7.2z" />
    <path fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" d="M8.6 11.2l2.3 2.3 4.4-4.6" />
  </svg>
);

export default PremiumMark;

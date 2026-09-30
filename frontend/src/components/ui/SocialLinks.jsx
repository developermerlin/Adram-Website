import { useSite } from '../../content/useContent';

// Social icon buttons in each network's brand colour (see .social-links in global.css).
// `labeled` shows each network's name beside its icon (used on the contact page).
export const SocialLinks = ({ size = 'md', labeled = false, className = '' }) => {
  const site = useSite();
  return (
  <div className={`social-links social-links--${size}${labeled ? ' social-links--labeled' : ''} ${className}`}>
    {site.socials.map((s) => (
      <a
        key={s.id}
        href={s.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={s.label}
        title={s.label}
        className={labeled ? 'social-links__row' : `social-links__item social-links__item--${s.id}`}
      >
        {labeled ? (
          <>
            <span className={`social-links__item social-links__item--${s.id}`}>
              <i className={s.icon} aria-hidden="true" />
            </span>
            <span className="social-links__label">{s.label}</span>
            <i className="fas fa-arrow-up-right-from-square social-links__ext" aria-hidden="true" />
          </>
        ) : (
          <i className={s.icon} aria-hidden="true" />
        )}
      </a>
    ))}
  </div>
  );
};

export default SocialLinks;

import { usePageContent } from '../../content/useContent';
import { assetUrl } from '../../utils/assets';
import '../../styles/hero-brand.css';

// The ADRAM logo in a white badge, framed by soft rings, a tilted orbit and four service badges.
// variant="interactive" (home hero): sits in 3D, tilts towards the pointer and reacts to hover.
// variant="flat" (About page): the same scene as a calm navy card with no tilt.

// The icons are fixed; their labels are editable (home content: hero.badges)
const SATELLITE_ICONS = ['fa-code', 'fa-network-wired', 'fa-graduation-cap', 'fa-laptop-code'];

// Tilt towards the pointer (up to 10°) and move the light sheen with it.
// Skipped for touch and for people who've asked their device for less motion.
const prefersLessMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const tiltTowards = (e) => {
  if (e.pointerType === 'touch' || prefersLessMotion()) return;
  const el = e.currentTarget;
  const box = el.getBoundingClientRect();
  const x = (e.clientX - box.left) / box.width; // 0 (left) … 1 (right)
  const y = (e.clientY - box.top) / box.height; // 0 (top) … 1 (bottom)
  el.style.setProperty('--ry', `${(x - 0.5) * 20}deg`);
  el.style.setProperty('--rx', `${(0.5 - y) * 20}deg`);
  el.style.setProperty('--mx', `${x * 100}%`);
  el.style.setProperty('--my', `${y * 100}%`);
};

const resetTilt = (e) => {
  ['--rx', '--ry', '--mx', '--my'].forEach((name) => e.currentTarget.style.removeProperty(name));
};

export const HeroBrand = ({ variant = 'interactive' }) => {
  const interactive = variant === 'interactive';
  const { hero } = usePageContent('home');
  const { name, heroLogo } = usePageContent('site');
  return (
    <div className="hero-brand-scene">
      <div
        className={`hero-brand hero-brand--${variant}`}
        onPointerMove={interactive ? tiltTowards : undefined}
        onPointerLeave={interactive ? resetTilt : undefined}
      >
        <span className="hero-brand__glow" aria-hidden="true" />
        <span className="hero-brand__ring hero-brand__ring--outer" aria-hidden="true" />
        <span className="hero-brand__ring hero-brand__ring--inner" aria-hidden="true" />
        <span className="hero-brand__orbit" aria-hidden="true" />
        <div className="hero-brand__badge">
          <img src={assetUrl(heroLogo)} alt={`${name} logo`} width="1254" height="1254" />
        </div>
        <div className="hero-brand__satellites">
          {SATELLITE_ICONS.map((icon, i) => (
            <span key={icon} className="hero-brand__satellite" data-label={hero.badges[i] || ''} title={hero.badges[i] || ''}>
              <i className={`fas ${icon}`} aria-hidden="true" />
            </span>
          ))}
        </div>
        <span className="hero-brand__sheen" aria-hidden="true" />
      </div>
    </div>
  );
};

export default HeroBrand;

// Banner artwork for the portal overviews: a graduation cap lifting off a rising bar chart.
// Soft gradients give it the glossy "3D" feel of the banner; decorative only, so it's hidden from screen readers.
import { useId } from 'react';

export const DashboardArt = ({ className = '' }) => {
  const id = useId().replace(/:/g, '');
  const g = (name) => `url(#${name}-${id})`;
  return (
    <svg className={`dash-art ${className}`} viewBox="0 0 240 180" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`top-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3a4a78" />
          <stop offset="1" style={{ stopColor: 'var(--navy-800)' }} />
        </linearGradient>
        <linearGradient id={`band-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#24346a" />
          <stop offset="1" style={{ stopColor: 'var(--navy-900)' }} />
        </linearGradient>
        <linearGradient id={`bar-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.35" />
        </linearGradient>
        <linearGradient id={`gold-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd66b" />
          <stop offset="1" stopColor="#f5a623" />
        </linearGradient>
        <radialGradient id={`glow-${id}`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.45" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Rising bars */}
      <g opacity="0.9">
        <rect x="46" y="120" width="22" height="44" rx="6" style={{ fill: g('bar') }} />
        <rect x="76" y="100" width="22" height="64" rx="6" style={{ fill: g('bar') }} />
        <rect x="106" y="82" width="22" height="82" rx="6" style={{ fill: g('bar') }} />
        <rect x="136" y="110" width="22" height="54" rx="6" opacity="0.7" style={{ fill: g('bar') }} />
      </g>
      <path d="M40 132 L86 104 L116 90 L176 44" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeDasharray="2 7" opacity="0.85" />

      {/* Graduation cap */}
      <g className="dash-art__cap">
        <ellipse cx="176" cy="104" rx="30" ry="6" opacity="0.18" style={{ fill: 'var(--navy-900)' }} />
        <path d="M156 58 v18 c0 8 40 8 40 0 v-18 z" style={{ fill: g('band') }} />
        <path d="M176 30 L218 48 L176 66 L134 48 Z" style={{ fill: g('top') }} />
        <path d="M176 30 L218 48 L176 52 L134 48 Z" fill="#ffffff" opacity="0.12" />
        <circle cx="176" cy="48" r="3.5" style={{ fill: g('gold') }} />
        <path d="M176 48 Q200 54 204 72" fill="none" strokeWidth="2.5" strokeLinecap="round" style={{ stroke: g('gold') }} />
        <path d="M200 70 h8 l-2 14 h-4 z" style={{ fill: g('gold') }} />
      </g>

    </svg>
  );
};

export default DashboardArt;

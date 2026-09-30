// ADRAM icon set: 32px grid, 2px rounded outline in the current colour, with one accent shape in the
// logo gradient (defined once in <BrandDefs />). Use <BrandIcon name="web" /> anywhere an icon is needed.

const A = 'url(#adram-grad)';

const icons = {
  // ----- Services -----
  web: (
    <>
      <rect x="3" y="5" width="26" height="22" rx="3" />
      <path d="M3 11h26" />
      <rect x="7" y="15" width="8" height="8" rx="1.5" fill={A} stroke="none" />
      <path d="M18.5 16h6.5M18.5 20h4" />
    </>
  ),
  mobile: (
    <>
      <rect x="9" y="3" width="14" height="26" rx="3" />
      <rect x="12" y="7.5" width="8" height="11" rx="1.5" fill={A} stroke="none" />
      <path d="M14 24h4" />
    </>
  ),
  software: (
    <>
      <rect x="3" y="5" width="26" height="17" rx="2.5" />
      <path d="M16 22v5M11 27h10" />
      <path d="M12.5 10.5 9 13.5l3.5 3M19.5 10.5l3.5 3-3.5 3" stroke={A} strokeWidth="2.4" />
    </>
  ),
  network: (
    <>
      <rect x="12" y="3" width="8" height="7" rx="1.5" fill={A} stroke="none" />
      <rect x="3" y="22" width="8" height="7" rx="1.5" />
      <rect x="21" y="22" width="8" height="7" rx="1.5" />
      <path d="M16 10v6M7 22v-6h18v6" />
    </>
  ),
  hardware: (
    <>
      <rect x="9" y="3" width="14" height="26" rx="3" />
      <path d="M12 8h8M12 12h8" />
      <circle cx="16" cy="21" r="3.6" fill={A} stroke="none" />
    </>
  ),
  photo: (
    <>
      <path d="M4 10h5l2-3h10l2 3h5v17H4z" />
      <circle cx="16" cy="18" r="5" fill={A} stroke="none" />
    </>
  ),
  analytics: (
    <>
      <path d="M4 4v24h24" />
      <rect x="9" y="17" width="4" height="7" rx="1" />
      <rect x="16" y="12" width="4" height="12" rx="1" fill={A} stroke="none" />
      <rect x="23" y="7" width="4" height="17" rx="1" />
    </>
  ),
  typing: (
    <>
      <rect x="3" y="9" width="26" height="16" rx="3" />
      <path d="M8 14h2M13 14h2M18 14h2M23 14h1" />
      <rect x="10" y="19" width="12" height="2.6" rx="1.3" fill={A} stroke="none" />
    </>
  ),
  ai: (
    <>
      <rect x="8" y="8" width="16" height="16" rx="3" />
      <path d="M12 4v4M20 4v4M12 24v4M20 24v4M4 12h4M4 20h4M24 12h4M24 20h4" />
      <circle cx="16" cy="16" r="4" fill={A} stroke="none" />
    </>
  ),
  consult: (
    <>
      <path d="M16 4a8 8 0 0 0-4.8 14.4c.9.7 1.3 1.6 1.3 2.6v1h7v-1c0-1 .4-1.9 1.3-2.6A8 8 0 0 0 16 4z" fill={A} stroke="none" />
      <path d="M12.5 26h7M14 29.5h4" />
    </>
  ),
  transform: (
    <>
      <path d="M6 14a10 10 0 0 1 17.6-5.4L26 11M26 5v6h-6" />
      <path d="M26 18a10 10 0 0 1-17.6 5.4L6 21M6 27v-6h6" />
      <circle cx="16" cy="16" r="3.5" fill={A} stroke="none" />
    </>
  ),

  // ----- Training -----
  terminal: (
    <>
      <rect x="3" y="5" width="26" height="22" rx="3" />
      <path d="m9 12 4 4-4 4" stroke={A} strokeWidth="2.6" />
      <path d="M16 21h7" />
    </>
  ),
  architecture: (
    <>
      <rect x="4" y="4" width="9" height="9" rx="2" fill={A} stroke="none" />
      <rect x="19" y="4" width="9" height="9" rx="2" />
      <rect x="11.5" y="19" width="9" height="9" rx="2" />
      <path d="M8.5 13v3.5H16V19M23.5 13v3.5H16" />
    </>
  ),
  briefcase: (
    <>
      <rect x="3" y="9" width="26" height="18" rx="3" />
      <path d="M11 9V6.5A1.5 1.5 0 0 1 12.5 5h7A1.5 1.5 0 0 1 21 6.5V9M3 16.5h10M19 16.5h10" />
      <rect x="13" y="14" width="6" height="5" rx="1" fill={A} stroke="none" />
    </>
  ),
  classroom: (
    <>
      <rect x="4" y="4" width="24" height="15" rx="2" />
      <path d="m8 15 5-4 4 3 6-6" stroke={A} strokeWidth="2.4" />
      <path d="M16 19v5M11 29l5-5 5 5" />
    </>
  ),
  building: (
    <>
      <path d="M6 29V6a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v23M21 12h4a2 2 0 0 1 2 2v15M3 29h26" />
      <g fill={A} stroke="none">
        <rect x="10" y="8" width="3" height="3" rx=".6" />
        <rect x="14.5" y="8" width="3" height="3" rx=".6" />
        <rect x="10" y="14" width="3" height="3" rx=".6" />
        <rect x="14.5" y="14" width="3" height="3" rx=".6" />
      </g>
      <path d="M12 29v-6h3.5v6" />
    </>
  ),
  certificate: (
    <>
      <rect x="3" y="5" width="26" height="18" rx="2" />
      <path d="M8 11h10M8 16h7" />
      <circle cx="23" cy="19" r="4.5" fill={A} stroke="none" />
      <path d="m20.5 23-1 6 3.5-2 3.5 2-1-6" />
    </>
  ),

  // ----- Process -----
  discover: (
    <>
      <path d="M5 7a3 3 0 0 1 3-3h16a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3h-9l-6 5v-5H8a3 3 0 0 1-3-3z" />
      <g fill={A} stroke="none">
        <circle cx="11" cy="12.5" r="1.8" />
        <circle cx="16" cy="12.5" r="1.8" />
        <circle cx="21" cy="12.5" r="1.8" />
      </g>
    </>
  ),
  design: (
    <>
      <rect x="4" y="4" width="18" height="18" rx="2" />
      <path d="M4 10h18M10 10v12" />
      <path d="m27.3 10.7-11 11-4.3 1.3 1.3-4.3 11-11a2.1 2.1 0 0 1 3 3z" fill={A} stroke="none" />
    </>
  ),
  build: (
    <>
      <path d="M16 15 5 9v14l11 6 11-6V9z" />
      <path d="M16 15v14" />
      <path d="m16 3 11 6-11 6L5 9z" fill={A} stroke="none" />
    </>
  ),
  support: (
    <>
      <path d="M6 18v-3a10 10 0 0 1 20 0v3M26 26c0 2-2 3-5 3h-3" />
      <rect x="4" y="17" width="6" height="9" rx="2" fill={A} stroke="none" />
      <rect x="22" y="17" width="6" height="9" rx="2" fill={A} stroke="none" />
    </>
  ),

  // ----- Why ADRAM / values -----
  location: (
    <>
      <path d="M16 29s9-8.2 9-15a9 9 0 0 0-18 0c0 6.8 9 15 9 15z" />
      <circle cx="16" cy="14" r="3.5" fill={A} stroke="none" />
    </>
  ),
  layers: (
    <>
      <path d="m16 4 12 6-12 6-12-6z" fill={A} stroke="none" />
      <path d="m4 16 12 6 12-6M4 22l12 6 12-6" />
    </>
  ),
  graduate: (
    <>
      <path d="M9 16.5v5.5c0 1.6 3.1 3.5 7 3.5s7-1.9 7-3.5v-5.5" />
      <path d="M16 5 2 12l14 7 14-7z" fill={A} stroke="none" />
      <path d="M27 13.5v7" />
      <circle cx="27" cy="22.5" r="1.8" fill={A} stroke="none" />
    </>
  ),
  shield: (
    <>
      <path d="m16 3 11 4v8c0 7-4.7 12-11 14C9.7 27 5 22 5 15V7z" />
      <path d="m11 16 3.5 3.5 7-7.5" stroke={A} strokeWidth="2.6" />
    </>
  ),
  partnership: (
    <>
      <circle cx="12" cy="16" r="7.5" />
      <circle cx="20" cy="16" r="7.5" stroke={A} strokeWidth="2.6" />
    </>
  ),
  quality: (
    <>
      <path d="M11.5 18.5 9 28l4-2 3 3 3-3 4 2-2.5-9.5" />
      <circle cx="16" cy="12" r="8" fill={A} stroke="none" />
      <circle cx="16" cy="12" r="4" stroke="#fff" />
    </>
  ),
  innovation: (
    <>
      <path d="M15 4c.8 6.5 3.5 9.2 10 10-6.5.8-9.2 3.5-10 10-.8-6.5-3.5-9.2-10-10 6.5-.8 9.2-3.5 10-10z" fill={A} stroke="none" />
      <path d="M26 21v6M23 24h6" />
    </>
  ),
  people: (
    <>
      <circle cx="7.5" cy="12" r="3" />
      <circle cx="24.5" cy="12" r="3" />
      <path d="M2.5 25a5 5 0 0 1 8.5-3.6M29.5 25a5 5 0 0 0-8.5-3.6" />
      <circle cx="16" cy="9" r="4" fill={A} stroke="none" />
      <path d="M9 27a7 7 0 0 1 14 0z" fill={A} stroke="none" />
    </>
  ),
  server: (
    <>
      <rect x="5" y="4" width="22" height="10" rx="2" />
      <rect x="5" y="18" width="22" height="10" rx="2" />
      <circle cx="10" cy="9" r="1.8" fill={A} stroke="none" />
      <circle cx="10" cy="23" r="1.8" fill={A} stroke="none" />
      <path d="M15 9h7M15 23h7" />
    </>
  ),
  laptop: (
    <>
      <rect x="6" y="6" width="20" height="14" rx="2" />
      <path d="M3 24h26l-1.5 3h-23z" />
      <rect x="9" y="9" width="14" height="8" rx="1" fill={A} stroke="none" />
    </>
  ),

  // ----- Scholarships -----
  award: (
    <>
      <path d="M11.5 18.5 9 28l4-2 3 3 3-3 4 2-2.5-9.5" />
      <circle cx="16" cy="12" r="8" fill={A} stroke="none" />
      <path d="m16 7.5 1.4 2.8 3.1.5-2.2 2.2.5 3.1-2.8-1.5-2.8 1.5.5-3.1-2.2-2.2 3.1-.5z" fill="#fff" stroke="none" />
    </>
  ),
  heart: (
    <>
      <path d="M16 19s-7-4.3-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 23 10c0 4.7-7 9-7 9z" fill={A} stroke="none" />
      <path d="M3 21h4.5l5.5 3.5h6.5a2 2 0 0 1 0 4H11M19.5 24.5l6.3-3.4a2 2 0 0 1 2.2 3.3L21 29H4" />
    </>
  ),
  star: (
    <path d="m16 3.5 3.8 7.7 8.5 1.2-6.1 6 1.4 8.5L16 23l-7.6 4 1.4-8.5-6.1-6 8.5-1.2z" fill={A} stroke="none" />
  ),
  globe: (
    <>
      <circle cx="16" cy="16" r="12" />
      <ellipse cx="16" cy="16" rx="5" ry="12" />
      <path d="M4 16h24" />
      <path d="M1.5 23.5C8 28 25 22 30.5 10" stroke={A} strokeWidth="2.6" />
    </>
  ),
  flask: (
    <>
      <path d="M12 4h8M13.5 4v8L6 25a2.5 2.5 0 0 0 2.2 3.7h15.6A2.5 2.5 0 0 0 26 25l-7.5-13V4" />
      <path d="M9.4 20h13.2l3 5.4a1.6 1.6 0 0 1-1.4 2.3H7.8a1.6 1.6 0 0 1-1.4-2.3z" fill={A} stroke="none" />
    </>
  ),

  // ----- Contact -----
  mail: (
    <>
      <rect x="3" y="7" width="26" height="18" rx="3" />
      <path d="m4.5 9 11.5 8 11.5-8" stroke={A} strokeWidth="2.6" />
    </>
  ),
  phone: (
    <path
      d="M8 4h4l2 6-3 2a15 15 0 0 0 7 7l2-3 6 2v4a3 3 0 0 1-3 3A20 20 0 0 1 5 7a3 3 0 0 1 3-3z"
      fill={A}
      stroke="none"
    />
  ),
  clock: (
    <>
      <circle cx="16" cy="16" r="12" />
      <path d="M16 9v7l5 3" stroke={A} strokeWidth="2.6" />
    </>
  ),

  // ----- Sectors -----
  health: (
    <>
      <circle cx="16" cy="16" r="13" />
      <path d="M14 8h4v6h6v4h-6v6h-4v-6H8v-4h6z" fill={A} stroke="none" />
    </>
  ),
  community: (
    <>
      <circle cx="16" cy="16" r="13" />
      <path d="M16 22s-6-3.7-6-7.7a3.4 3.4 0 0 1 6-2.2 3.4 3.4 0 0 1 6 2.2c0 4-6 7.7-6 7.7z" fill={A} stroke="none" />
    </>
  ),
  government: (
    <>
      <path d="M16 3 29 10H3z" fill={A} stroke="none" />
      <path d="M7 13v11M13 13v11M19 13v11M25 13v11M4 27h24M3 30h26" />
    </>
  ),
  growth: (
    <>
      <rect x="6" y="17" width="5" height="9" rx="1" />
      <rect x="13.5" y="12" width="5" height="14" rx="1" />
      <rect x="21" y="6" width="5" height="20" rx="1" fill={A} stroke="none" />
      <path d="M3 29h26" />
    </>
  ),
  finance: (
    <>
      <ellipse cx="13" cy="9" rx="8" ry="3.5" fill={A} stroke="none" />
      <path d="M5 9v5c0 1.9 3.6 3.5 8 3.5M21 9v4" />
      <ellipse cx="19" cy="19" rx="8" ry="3.5" />
      <path d="M11 19v5c0 1.9 3.6 3.5 8 3.5s8-1.6 8-3.5v-5" />
    </>
  ),
};

// The same icons placed inside a larger illustration (nested SVG, so coordinates stay on the 32px grid).
export const IconAt = ({ name, x, y, size = 32, color = '#0b1f5c' }) => (
  <svg x={x} y={y} width={size} height={size} viewBox="0 0 32 32" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {icons[name]}
  </svg>
);

export const BrandIcon = ({ name, size = 32, className = '', title }) => (
  <svg
    className={`brand-icon ${className}`}
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    role={title ? 'img' : undefined}
    aria-label={title}
    aria-hidden={title ? undefined : true}
  >
    {icons[name] || icons.innovation}
  </svg>
);

// Shared gradients for icons and illustrations. Rendered once near the root of the app.
export const BrandDefs = () => (
  <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="adram-grad" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stopColor="#0a3ab5" />
        <stop offset=".55" stopColor="#1c7cf0" />
        <stop offset="1" stopColor="#16c8f5" />
      </linearGradient>
      <linearGradient id="adram-grad-h" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#1454e8" />
        <stop offset="1" stopColor="#16c8f5" />
      </linearGradient>
      <linearGradient id="adram-orbit" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#16c8f5" stopOpacity="0" />
        <stop offset=".35" stopColor="#16c8f5" />
        <stop offset="1" stopColor="#1454e8" />
      </linearGradient>
      <radialGradient id="adram-glow">
        <stop offset="0" stopColor="#2f6bff" stopOpacity=".55" />
        <stop offset="1" stopColor="#2f6bff" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="adram-area" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#1c7cf0" stopOpacity=".35" />
        <stop offset="1" stopColor="#1c7cf0" stopOpacity="0" />
      </linearGradient>
      <pattern id="adram-dots" width="18" height="18" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="1.4" fill="#1454e8" fillOpacity=".16" />
      </pattern>
      <filter id="adram-shadow" x="-60%" y="-60%" width="220%" height="240%">
        <feDropShadow dx="0" dy="10" stdDeviation="12" floodColor="#06123d" floodOpacity=".22" />
      </filter>
    </defs>
  </svg>
);

// Every icon name, for the icon picker in the admin's content editor.
// eslint-disable-next-line react-refresh/only-export-components
export const ICON_NAMES = Object.keys(icons);

export default BrandIcon;

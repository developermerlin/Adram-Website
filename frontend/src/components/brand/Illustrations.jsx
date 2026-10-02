// ADRAM brand illustrations. All artwork is SVG in the logo palette (royal blue -> cyan on navy) and reuses
// the orbit ring from the logo, so it stays sharp at any size and matches the icon set.
import { IconAt } from './BrandIcon';

const NAVY = 'var(--navy-800)';
const DEEP = 'var(--navy-900)';
const BLUE = 'var(--blue-600)';
const CYAN = 'var(--cyan-400)';
const SOFT = 'var(--blue-50)';
const LINE = '#dde5f7';
const GREEN = '#22c38e';
const G = 'url(#adram-grad)';
const FONT = 'DM Sans, Segoe UI, sans-serif';

// Placeholder "text" line
const Bar = ({ x, y, w, h = 6, fill = LINE, r }) => <rect x={x} y={y} width={w} height={h} rx={r ?? h / 2} style={{ fill }} />;

// The swoosh from the logo, drawn as a tilted ellipse with a small satellite.
const Orbit = ({ cx, cy, rx, ry, angle = -14, width = 3, satellite = true, opacity = 1 }) => (
  <g transform={`rotate(${angle} ${cx} ${cy})`} opacity={opacity}>
    <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke="url(#adram-orbit)" strokeWidth={width} />
    {satellite && <circle className="art-pulse" cx={cx + rx * 0.72} cy={cy - ry * 0.7} r="6" style={{ fill: CYAN }} />}
  </g>
);

const Window = ({ x, y, w, h, children, dark = false }) => (
  <g filter="url(#adram-shadow)">
    <rect x={x} y={y} width={w} height={h} rx="14" style={{ fill: dark ? NAVY : '#fff' }} />
    <rect x={x} y={y} width={w} height="30" rx="14" style={{ fill: dark ? DEEP : '#f5f7fc' }} />
    <rect x={x} y={y + 16} width={w} height="14" style={{ fill: dark ? DEEP : '#f5f7fc' }} />
    <circle cx={x + 18} cy={y + 15} r="4" fill="#ff6b6b" />
    <circle cx={x + 31} cy={y + 15} r="4" fill="#ffc75f" />
    <circle cx={x + 44} cy={y + 15} r="4" fill="#3ddc97" />
    {children}
  </g>
);

const Tile = ({ x, y, icon, size = 56, dark = false }) => (
  <g filter="url(#adram-shadow)">
    <rect x={x} y={y} width={size} height={size} rx={size * 0.28} style={{ fill: dark ? NAVY : '#fff' }} />
    <IconAt name={icon} x={x + size * 0.22} y={y + size * 0.22} size={size * 0.56} color={dark ? '#fff' : NAVY} />
  </g>
);

const Check = ({ x, y, r = 11 }) => (
  <g>
    <circle cx={x} cy={y} r={r} style={{ fill: GREEN }} />
    <path d={`M${x - r * 0.4} ${y}l${r * 0.3} ${r * 0.3} ${r * 0.5}-${r * 0.6}`} stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </g>
);

const Scene = ({ children, label, viewBox = '0 0 480 340', className = '' }) => (
  <svg className={`art ${className}`} viewBox={viewBox} role="img" aria-label={label}>
    {children}
  </svg>
);

/* ---------------------------------------------------------------------------
   Home hero: laptop running a portal dashboard, phone app, status chips
--------------------------------------------------------------------------- */
export const HeroArt = () => (
  <Scene viewBox="0 0 560 470" label="ADRAM software shown on a laptop and a phone" className="art--hero">
    <defs>
      <clipPath id="hero-screen">
        <rect x="74" y="84" width="372" height="224" rx="8" />
      </clipPath>
      <clipPath id="hero-phone">
        <rect x="407" y="187" width="96" height="206" rx="14" />
      </clipPath>
    </defs>
    <circle cx="300" cy="230" r="240" fill="url(#adram-glow)" />
    <Orbit cx={290} cy={250} rx={270} ry={92} angle={-16} opacity={0.9} />

    {/* Laptop */}
    <rect x="60" y="70" width="400" height="252" rx="16" stroke="rgba(255,255,255,.18)" style={{ fill: 'var(--t-800, #132f82)' }} />
    <path d="M28 322h464l-20 24H48z" style={{ fill: 'var(--t-800, #1a3a95)' }} />
    <rect x="220" y="322" width="80" height="6" rx="3" style={{ fill: DEEP }} />
    <g clipPath="url(#hero-screen)">
      <rect x="74" y="84" width="372" height="224" fill="#f5f7fc" />
      {/* sidebar */}
      <rect x="74" y="84" width="72" height="224" style={{ fill: DEEP }} />
      <circle cx="96" cy="106" r="9" style={{ fill: G }} />
      <Bar x={110} y={103} w={26} fill="rgba(255,255,255,.4)" />
      <rect x="84" y="130" width="54" height="16" rx="5" fill="rgba(47,107,255,.35)" />
      <Bar x={92} y={135} w={36} fill="#fff" />
      <Bar x={92} y={160} w={34} fill="rgba(255,255,255,.25)" />
      <Bar x={92} y={180} w={28} fill="rgba(255,255,255,.25)" />
      <Bar x={92} y={200} w={38} fill="rgba(255,255,255,.25)" />
      {/* top bar */}
      <rect x="146" y="84" width="300" height="30" fill="#fff" />
      <rect x="158" y="93" width="110" height="12" rx="6" fill="#eef1f8" />
      <circle cx="428" cy="99" r="8" style={{ fill: G }} />
      {/* stats */}
      {[158, 254, 350].map((x, i) => (
        <g key={x}>
          <rect x={x} y="124" width="86" height="48" rx="7" fill="#fff" stroke="#e3e8f4" />
          <rect x={x + 8} y="132" width="16" height="16" rx="5" style={{ fill: i === 1 ? 'var(--a-50, #e3f8fe)' : SOFT }} />
          <Bar x={x + 30} y={134} w={40} h={5} />
          <Bar x={x + 30} y={144} w={24} h={8} fill={NAVY} r={3} />
          <Bar x={x + 8} y={158} w={70} h={5} fill={i === 2 ? '#ffe9bf' : 'var(--t-100, #e7eefc)'} />
        </g>
      ))}
      {/* chart */}
      <rect x="158" y="182" width="190" height="116" rx="7" fill="#fff" stroke="#e3e8f4" />
      <Bar x={168} y={192} w={60} h={6} fill={NAVY} r={3} />
      <path d="M168 280 L196 262 L222 268 L250 240 L276 248 L304 218 L338 206 L338 288 L168 288Z" fill="url(#adram-area)" />
      <path className="art-draw" d="M168 280 L196 262 L222 268 L250 240 L276 248 L304 218 L338 206" fill="none" stroke="url(#adram-grad-h)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {/* donut */}
      <rect x="356" y="182" width="80" height="116" rx="7" fill="#fff" stroke="#e3e8f4" />
      <circle cx="396" cy="232" r="22" fill="none" strokeWidth="9" style={{ stroke: SOFT }} />
      <circle cx="396" cy="232" r="22" fill="none" stroke="url(#adram-grad-h)" strokeWidth="9" strokeDasharray="100 139" transform="rotate(-90 396 232)" strokeLinecap="round" />
      <Bar x={372} y={268} w={48} h={5} />
      <Bar x={378} y={280} w={36} h={5} />
    </g>

    {/* Phone */}
    <g className="art-float" style={{ animationDelay: '-2s' }}>
      <rect x="398" y="178" width="114" height="224" rx="20" stroke="rgba(255,255,255,.2)" filter="url(#adram-shadow)" style={{ fill: 'var(--t-800, #132f82)' }} />
      <g clipPath="url(#hero-phone)">
        <rect x="407" y="187" width="96" height="206" fill="#fff" />
        <rect x="407" y="187" width="96" height="70" style={{ fill: G }} />
        <Bar x={417} y={206} w={40} h={5} fill="rgba(255,255,255,.7)" />
        <Bar x={417} y={218} w={62} h={9} fill="#fff" r={4} />
        <Bar x={417} y={236} w={34} h={5} fill="rgba(255,255,255,.7)" />
        {[268, 300, 332].map((y, i) => (
          <g key={y}>
            <rect x="415" y={y} width="80" height="26" rx="7" fill="#f5f7fc" />
            <circle cx="428" cy={y + 13} r="7" style={{ fill: i === 0 ? G : i === 1 ? CYAN : 'var(--t-200, #c9d6f6)' }} />
            <Bar x={440} y={y + 8} w={40} h={4} fill="#c3cde6" />
            <Bar x={440} y={y + 15} w={26} h={4} fill={LINE} />
          </g>
        ))}
        <rect x="419" y="366" width="72" height="16" rx="8" style={{ fill: G }} />
      </g>
    </g>

    {/* Status chips */}
    <g className="art-float">
      <rect x="10" y="22" width="188" height="62" rx="14" fill="rgba(11,31,92,.9)" stroke="rgba(255,255,255,.14)" filter="url(#adram-shadow)" />
      <rect x="24" y="35" width="36" height="36" rx="10" fill="rgba(22,200,245,.14)" />
      <IconAt name="network" x={31} y={42} size={22} color="#fff" />
      <text x="72" y="50" fontFamily={FONT} fontSize="13" fontWeight="700" fill="#fff">Office network</text>
      <circle cx="77" cy="64" r="4" fill="#3ddc97" />
      <text x="87" y="68" fontFamily={FONT} fontSize="11.5" fill="#9fb0dd">All systems online</text>
    </g>
    <g className="art-float" style={{ animationDelay: '-4s' }}>
      <rect x="0" y="372" width="214" height="72" rx="14" fill="rgba(11,31,92,.9)" stroke="rgba(255,255,255,.14)" filter="url(#adram-shadow)" />
      <rect x="14" y="386" width="36" height="36" rx="10" fill="rgba(22,200,245,.14)" />
      <IconAt name="graduate" x={21} y={393} size={22} color="#fff" />
      <text x="62" y="402" fontFamily={FONT} fontSize="13" fontWeight="700" fill="#fff">Scholarship application</text>
      <rect x="62" y="414" width="136" height="7" rx="3.5" fill="rgba(255,255,255,.12)" />
      <rect x="62" y="414" width="102" height="7" rx="3.5" fill="url(#adram-grad-h)" />
      <text x="62" y="436" fontFamily={FONT} fontSize="10.5" fill="#9fb0dd">Documents reviewed · 75%</text>
    </g>
  </Scene>
);

/* ---------------------------------------------------------------------------
   Service scenes (one per service id)
--------------------------------------------------------------------------- */
const WebScene = () => (
  <>
    <Window x={60} y={46} w={330} h={230}>
      <rect x="76" y="86" width="16" height="16" rx="5" style={{ fill: G }} />
      <Bar x={98} y={91} w={40} />
      <Bar x={250} y={91} w={26} />
      <Bar x={284} y={91} w={26} />
      <rect x="318" y="86" width="56" height="16" rx="8" style={{ fill: G }} />
      <rect x="76" y="116" width="298" height="84" rx="10" style={{ fill: NAVY }} />
      <Bar x={92} y={134} w={130} h={10} fill="#fff" r={5} />
      <Bar x={92} y={152} w={96} h={10} fill={CYAN} r={5} />
      <rect x="92" y="172" width="54" height="16" rx="8" style={{ fill: G }} />
      <circle cx="318" cy="158" r="30" fill="url(#adram-glow)" />
      <path d="M290 186l22-26 14 16 10-10 22 20z" fill="rgba(255,255,255,.25)" />
      <circle cx="340" cy="136" r="8" style={{ fill: CYAN }} />
      {[76, 177, 278].map((x) => (
        <g key={x}>
          <rect x={x} y="212" width="96" height="50" rx="8" fill="#f5f7fc" />
          <rect x={x + 10} y="222" width="14" height="14" rx="4" strokeOpacity=".3" style={{ fill: SOFT, stroke: BLUE }} />
          <Bar x={x + 10} y={244} w={70} h={5} />
        </g>
      ))}
    </Window>
    <g className="art-float">
      <Tile x={370} y={210} icon="web" size={64} dark />
    </g>
    <g className="art-float" style={{ animationDelay: '-3s' }}>
      <path d="M52 250l16 40 6-16 16-6z" stroke="#fff" strokeWidth="3" strokeLinejoin="round" style={{ fill: NAVY }} />
    </g>
  </>
);

const Phone = ({ x, y, w = 128, h = 250, accent = G, faded = false }) => (
  <g filter="url(#adram-shadow)" opacity={faded ? 0.9 : 1}>
    <rect x={x} y={y} width={w} height={h} rx="22" style={{ fill: NAVY }} />
    <rect x={x + 7} y={y + 7} width={w - 14} height={h - 14} rx="16" fill="#fff" />
    <path d={`M${x + 7} ${y + 23}a16 16 0 0 1 16-16h${w - 46}a16 16 0 0 1 16 16v52h-${w - 14}z`} style={{ fill: accent }} />
    <rect x={x + w / 2 - 16} y={y + 12} width="32" height="6" rx="3" fill="rgba(255,255,255,.35)" />
    <Bar x={x + 20} y={y + 36} w={w * 0.35} h={5} fill="rgba(255,255,255,.7)" />
    <Bar x={x + 20} y={y + 48} w={w * 0.55} h={10} fill="#fff" r={5} />
  </g>
);

const MobileScene = () => (
  <>
    <Phone x={250} y={60} w={116} h={230} accent={NAVY} faded />
    <g transform="translate(262 150)">
      {[0, 36, 72].map((dy) => (
        <g key={dy}>
          <rect x="0" y={dy} width="92" height="28" rx="7" fill="#f5f7fc" />
          <Bar x={10} y={dy + 11} w={60} h={5} />
        </g>
      ))}
    </g>
    <Phone x={130} y={36} />
    <g transform="translate(144 124)">
      <rect x="0" y="0" width="100" height="62" rx="10" style={{ fill: SOFT }} />
      <path d="M8 50 L28 34 L44 42 L64 20 L92 28" fill="none" stroke="url(#adram-grad-h)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {[74, 106, 138].map((dy, i) => (
        <g key={dy}>
          <rect x="0" y={dy} width="100" height="26" rx="7" fill="#f5f7fc" />
          <circle cx="13" cy={dy + 13} r="7" style={{ fill: i === 0 ? G : 'var(--t-200, #c9d6f6)' }} />
          <Bar x={26} y={dy + 10} w={56} h={5} />
        </g>
      ))}
    </g>
    <g className="art-float">
      <rect x="40" y="96" width="120" height="44" rx="12" fill="#fff" filter="url(#adram-shadow)" />
      <rect x="50" y="106" width="24" height="24" rx="7" style={{ fill: G }} />
      <Bar x={82} y={110} w={60} h={5} fill={NAVY} />
      <Bar x={82} y={121} w={42} h={5} />
    </g>
    <g className="art-float" style={{ animationDelay: '-3s' }}>
      <Check x={372} y={82} r={16} />
    </g>
  </>
);

const SoftwareScene = () => (
  <>
    <Window x={46} y={40} w={360} h={250}>
      <rect x="46" y="70" width="70" height="220" style={{ fill: NAVY }} />
      <path d="M46 276v-6h70v20H60a14 14 0 0 1-14-14z" style={{ fill: NAVY }} />
      <circle cx="66" cy="90" r="8" style={{ fill: G }} />
      {[112, 132, 152, 172].map((y, i) => (
        <Bar key={y} x={60} y={y} w={i === 0 ? 44 : 36} fill={i === 0 ? '#fff' : 'rgba(255,255,255,.25)'} />
      ))}
      {[128, 222, 316].map((x, i) => (
        <g key={x}>
          <rect x={x} y="84" width="80" height="50" rx="8" fill="#fff" stroke="#e3e8f4" />
          <Bar x={x + 10} y={94} w={36} h={5} />
          <Bar x={x + 10} y={106} w={26 + i * 6} h={10} fill={NAVY} r={4} />
          <Bar x={x + 10} y={122} w={56} h={4} fill={i === 1 ? '#bff0dd' : 'var(--t-100, #e7eefc)'} />
        </g>
      ))}
      <rect x="128" y="144" width="140" height="132" rx="8" fill="#fff" stroke="#e3e8f4" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect key={i} x={142 + i * 20} y={250 - [40, 64, 52, 84, 70, 96][i]} width="12" height={[40, 64, 52, 84, 70, 96][i]} rx="3" style={{ fill: i === 5 ? G : 'var(--t-200, #cfdcfb)' }} />
      ))}
      <rect x="276" y="144" width="120" height="132" rx="8" fill="#fff" stroke="#e3e8f4" />
      {[160, 186, 212, 238].map((y, i) => (
        <g key={y}>
          <circle cx="292" cy={y + 3} r="6" style={{ fill: i % 2 ? 'var(--t-200, #c9d6f6)' : SOFT }} />
          <Bar x={304} y={y} w={48} h={5} />
          <rect x="360" y={y - 2} width="26" height="10" rx="5" style={{ fill: i === 2 ? '#fff4de' : '#e6f6ef' }} />
        </g>
      ))}
    </Window>
    <g className="art-float">
      <Tile x={392} y={40} icon="software" size={60} dark />
    </g>
  </>
);

const NetworkScene = () => {
  const nodes = [
    { x: 64, y: 206, icon: 'laptop' },
    { x: 170, y: 262, icon: 'mobile' },
    { x: 290, y: 262, icon: 'server' },
    { x: 396, y: 206, icon: 'software' },
  ];
  return (
    <>
      <circle cx="240" cy="170" r="150" fill="url(#adram-glow)" opacity=".5" />
      {/* cloud */}
      <g className="art-float">
        <path d="M196 92a30 30 0 0 1 4-60 40 40 0 0 1 76 6 28 28 0 0 1 12 54z" fill="#fff" filter="url(#adram-shadow)" />
        <path d="M214 70l14-14 14 14M228 56v26" fill="none" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: BLUE }} />
        <path d="M248 58l14 14 14-14M262 72V46" fill="none" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: CYAN }} />
      </g>
      <path className="art-dash" d="M240 96v44" strokeWidth="3" strokeDasharray="6 7" style={{ stroke: BLUE }} />
      {nodes.map((n) => (
        <path key={n.icon} className="art-dash" d={`M240 180 Q ${(240 + n.x + 28) / 2} ${n.y - 10} ${n.x + 28} ${n.y}`} fill="none" strokeOpacity=".55" strokeWidth="3" strokeDasharray="6 7" style={{ stroke: BLUE }} />
      ))}
      {/* router */}
      <g filter="url(#adram-shadow)">
        <rect x="190" y="140" width="100" height="64" rx="16" style={{ fill: G }} />
        <path d="M212 140v-18M268 140v-18" strokeWidth="5" strokeLinecap="round" style={{ stroke: NAVY }} />
        {[214, 232, 250].map((x) => (
          <circle key={x} className="art-pulse" cx={x} cy="186" r="5" fill="#3ddc97" />
        ))}
        <IconAt name="network" x={250} y={152} size={30} color="#fff" />
      </g>
      {nodes.map((n, i) => (
        <g key={n.icon} className="art-float" style={{ animationDelay: `${-i * 1.4}s` }}>
          <Tile x={n.x} y={n.y} icon={n.icon} size={56} />
        </g>
      ))}
    </>
  );
};

const HardwareScene = () => {
  const nodes = [
    { x: 56, y: 70, icon: 'laptop' },
    { x: 368, y: 70, icon: 'server' },
    { x: 56, y: 222, icon: 'mobile' },
    { x: 368, y: 222, icon: 'network' },
  ];
  return (
    <>
      <circle cx="240" cy="170" r="150" fill="url(#adram-glow)" opacity=".5" />
      {nodes.map((n) => (
        <path key={n.icon} className="art-dash" d={`M240 170 L ${n.x + 28} ${n.y + 28}`} strokeOpacity=".55" strokeWidth="3" strokeDasharray="6 7" style={{ stroke: BLUE }} />
      ))}
      {/* processor chip */}
      <g filter="url(#adram-shadow)">
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i} strokeWidth="5" strokeLinecap="round" style={{ stroke: NAVY }}>
            <path d={`M${206 + i * 17} 118v-16M${206 + i * 17} 222v16`} />
            <path d={`M190 ${138 + i * 17}h-16M290 ${138 + i * 17}h16`} />
          </g>
        ))}
        <rect x="190" y="118" width="100" height="104" rx="16" style={{ fill: G }} />
        <rect x="208" y="136" width="64" height="68" rx="10" style={{ fill: NAVY }} />
        <IconAt name="hardware" x={222} y={152} size={36} color="#fff" />
      </g>
      {nodes.map((n, i) => (
        <g key={n.icon} className="art-float" style={{ animationDelay: `${-i * 1.4}s` }}>
          <Tile x={n.x} y={n.y} icon={n.icon} size={56} />
        </g>
      ))}
    </>
  );
};

const DesignScene = () => (
  <>
    <circle cx="240" cy="170" r="150" fill="url(#adram-glow)" opacity=".5" />
    <Window x={96} y={54} w={230} h={190}>
      <rect x={112} y={96} width="198" height="132" rx="8" style={{ fill: SOFT }} />
      <circle cx="160" cy="150" r="30" style={{ fill: G }} />
      <rect x="204" y="118" width="84" height="56" rx="10" style={{ fill: NAVY }} />
      <path d="M204 206l32-34 26 26 14-12 20 20z" opacity=".85" style={{ fill: CYAN }} />
      <Bar x={204} y={182} w={60} fill="#fff" />
    </Window>
    <g className="art-float">
      <Tile x={318} y={70} icon="photo" size={64} dark />
    </g>
    <g className="art-float" style={{ animationDelay: '-1.6s' }}>
      <Tile x={338} y={196} icon="web" size={56} />
    </g>
    <path className="art-dash" d="M96 262 C 130 300, 180 300, 214 262" fill="none" strokeWidth="3" strokeDasharray="6 7" style={{ stroke: BLUE }} />
    <circle cx="96" cy="262" r="6" fill="#fff" strokeWidth="3" style={{ stroke: BLUE }} />
    <circle cx="214" cy="262" r="6" fill="#fff" strokeWidth="3" style={{ stroke: BLUE }} />
  </>
);

const DataScene = () => (
  <>
    <circle cx="240" cy="170" r="150" fill="url(#adram-glow)" opacity=".5" />
    <Window x={70} y={56} w={250} h={190}>
      <rect x={84} y={98} width="70" height="46" rx="8" style={{ fill: SOFT }} />
      <Bar x={94} y={110} w={34} fill={NAVY} h={8} />
      <Bar x={94} y={126} w={48} />
      {[[172, 36], [194, 62], [216, 48], [238, 84], [260, 70]].map(([x, h]) => (
        <rect key={x} x={x} y={222 - h} width="16" height={h} rx="4" opacity={x > 230 ? 1 : 0.75} style={{ fill: x > 230 ? G : BLUE }} />
      ))}
      <path className="art-dash" d="M84 214 L 130 184 L 176 196 L 224 150 L 300 122" fill="none" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: CYAN }} />
      <circle cx="300" cy="122" r="6" fill="#fff" strokeWidth="3" style={{ stroke: CYAN }} />
      <circle cx="112" cy="196" r="24" fill="none" strokeWidth="8" style={{ stroke: LINE }} />
      <path d="M112 172a24 24 0 0 1 22 34" fill="none" strokeWidth="8" strokeLinecap="round" style={{ stroke: BLUE }} />
    </Window>
    <g className="art-float">
      <circle cx="372" cy="120" r="42" fill="#fff" fillOpacity=".18" stroke="#fff" strokeWidth="8" filter="url(#adram-shadow)" />
      <path d="M402 150l32 32" strokeWidth="12" strokeLinecap="round" style={{ stroke: NAVY }} />
      <IconAt name="analytics" x={350} y={98} size={44} color="#fff" />
    </g>
    <g className="art-float" style={{ animationDelay: '-1.8s' }}>
      <Tile x={340} y={214} icon="ai" size={56} />
    </g>
  </>
);

const TypingScene = () => (
  <>
    <circle cx="240" cy="170" r="150" fill="url(#adram-glow)" opacity=".5" />
    {/* document being typed */}
    <g filter="url(#adram-shadow)">
      <rect x="150" y="34" width="180" height="150" rx="12" fill="#fff" />
      <rect x="166" y="52" width="80" height="10" rx="5" style={{ fill: NAVY }} />
      <Bar x={166} y={76} w={148} />
      <Bar x={166} y={92} w={130} />
      <Bar x={166} y={108} w={148} />
      <Bar x={166} y={124} w={96} />
      <rect className="art-blink" x="266" y="120" width="3" height="14" style={{ fill: BLUE }} />
      <rect x="236" y="150" width="82" height="24" rx="12" style={{ fill: G }} />
      <text x="277" y="167" textAnchor="middle" fontFamily={FONT} fontSize="12" fontWeight="700" fill="#fff">60 WPM</text>
    </g>
    {/* keyboard */}
    <g filter="url(#adram-shadow)">
      <rect x="86" y="200" width="308" height="100" rx="14" style={{ fill: NAVY }} />
      {[0, 1, 2].map((row) =>
        Array.from({ length: 11 - row }).map((_, i) => (
          <rect key={`${row}-${i}`} x={104 + row * 10 + i * 25} y={214 + row * 22} width="20" height="16" rx="4" style={{ fill: row === 1 && i === 4 ? CYAN : 'var(--t-800, #1a3a95)' }} />
        ))
      )}
      <rect x="150" y="280" width="180" height="12" rx="6" style={{ fill: 'var(--t-800, #1a3a95)' }} />
    </g>
    <g className="art-float">
      <Tile x={362} y={56} icon="laptop" size={56} />
    </g>
    <g className="art-float" style={{ animationDelay: '-1.6s' }}>
      <Tile x={62} y={78} icon="graduate" size={56} />
    </g>
  </>
);

const AiScene = () => {
  const layers = [
    [90, 150, 210, 270],
    [110, 170, 230],
    [140, 200],
  ];
  const xs = [150, 240, 330];
  return (
    <>
      <circle cx="240" cy="180" r="150" fill="url(#adram-glow)" opacity=".45" />
      <Orbit cx={240} cy={180} rx={210} ry={70} opacity={0.8} />
      {layers.slice(0, -1).map((layer, li) =>
        layer.flatMap((y1) =>
          layers[li + 1].map((y2) => (
            <line key={`${li}-${y1}-${y2}`} x1={xs[li]} y1={y1} x2={xs[li + 1]} y2={y2} strokeOpacity=".25" strokeWidth="2" style={{ stroke: BLUE }} />
          )),
        ),
      )}
      {layers.map((layer, li) =>
        layer.map((y) => (
          <circle key={`${li}-${y}`} className={li === 2 ? 'art-pulse' : undefined} cx={xs[li]} cy={y} r={li === 2 ? 16 : 13} strokeWidth="3" filter="url(#adram-shadow)" style={{ fill: li === 2 ? G : '#fff', stroke: li === 2 ? 'none' : BLUE }} />
        )),
      )}
      <g className="art-float">
        <rect x="22" y="40" width="96" height="96" rx="24" filter="url(#adram-shadow)" style={{ fill: NAVY }} />
        <IconAt name="ai" x={40} y={58} size={60} color="#fff" />
      </g>
      <g className="art-float" style={{ animationDelay: '-3s' }}>
        <rect x="336" y="232" width="128" height="72" rx="16" fill="#fff" filter="url(#adram-shadow)" />
        <circle cx="358" cy="256" r="11" style={{ fill: G }} />
        <Bar x={376} y={250} w={72} h={6} fill={NAVY} />
        <Bar x={352} y={276} w={96} h={6} />
        <Bar x={352} y={288} w={64} h={6} />
      </g>
    </>
  );
};

const ConsultScene = () => (
  <>
    <circle cx="240" cy="170" r="150" fill="url(#adram-glow)" opacity=".4" />
    <g filter="url(#adram-shadow)">
      <rect x="120" y="36" width="210" height="270" rx="16" fill="#fff" />
      <rect x="185" y="26" width="80" height="24" rx="8" style={{ fill: NAVY }} />
    </g>
    <Bar x={142} y={70} w={110} h={10} fill={NAVY} r={5} />
    <Bar x={142} y={90} w={160} />
    <circle cx="178" cy="150" r="34" fill="none" strokeWidth="14" style={{ stroke: SOFT }} />
    <circle cx="178" cy="150" r="34" fill="none" stroke="url(#adram-grad-h)" strokeWidth="14" strokeDasharray="140 214" transform="rotate(-90 178 150)" />
    {[0, 1, 2].map((i) => (
      <g key={i}>
        <rect x="228" y={124 + i * 20} width="10" height="10" rx="3" style={{ fill: i === 0 ? BLUE : i === 1 ? CYAN : LINE }} />
        <Bar x={244} y={126 + i * 20} w={62 - i * 10} />
      </g>
    ))}
    {[210, 240, 270].map((y, i) => (
      <g key={y}>
        <Check x={152} y={y + 3} r={9} />
        <Bar x={170} y={y} w={[120, 96, 132][i]} />
      </g>
    ))}
    <g className="art-float">
      <circle cx="350" cy="222" r="42" fill="rgba(238,243,255,.7)" strokeWidth="10" filter="url(#adram-shadow)" style={{ stroke: NAVY }} />
      <path d="M380 252l34 34" strokeWidth="14" strokeLinecap="round" style={{ stroke: NAVY }} />
      <path d="M332 232l12-14 10 8 16-20" fill="none" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: BLUE }} />
    </g>
    <g className="art-float" style={{ animationDelay: '-3s' }}>
      <Tile x={50} y={74} icon="consult" size={64} dark />
    </g>
  </>
);

const TransformScene = () => (
  <>
    <circle cx="330" cy="170" r="140" fill="url(#adram-glow)" opacity=".45" />
    {/* paper stack */}
    {[2, 1, 0].map((i) => (
      <g key={i} transform={`rotate(${-8 + i * 6} 110 180)`}>
        <rect x={60 + i * 6} y={100 + i * 6} width="104" height="136" rx="8" stroke="#dfe4ef" filter={i ? undefined : 'url(#adram-shadow)'} style={{ fill: i ? '#f0f2f8' : '#fff' }} />
        {!i && (
          <>
            <Bar x={76} y={124} w={60} fill="#cfd5e3" />
            <Bar x={76} y={140} w={72} fill="#e2e6ef" />
            <Bar x={76} y={154} w={52} fill="#e2e6ef" />
            <Bar x={76} y={168} w={66} fill="#e2e6ef" />
          </>
        )}
      </g>
    ))}
    <path className="art-dash" d="M178 176 C 220 120, 250 120, 282 150" fill="none" stroke="url(#adram-grad-h)" strokeWidth="5" strokeLinecap="round" strokeDasharray="10 10" />
    <path d="M272 136l14 16-20 6" fill="none" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: CYAN }} />
    {/* cloud + device */}
    <g className="art-float">
      <path d="M310 118a26 26 0 0 1 4-52 36 36 0 0 1 68 6 24 24 0 0 1 10 46z" filter="url(#adram-shadow)" style={{ fill: G }} />
      <path d="M338 96l12 12 22-24" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </g>
    <g filter="url(#adram-shadow)">
      <rect x="290" y="150" width="150" height="100" rx="10" style={{ fill: NAVY }} />
      <rect x="298" y="158" width="134" height="84" rx="5" fill="#fff" />
      <path d="M272 250h186l-10 14H282z" style={{ fill: 'var(--t-800, #1a3a95)' }} />
    </g>
    <rect x="306" y="166" width="30" height="68" rx="4" style={{ fill: SOFT }} />
    <Bar x={344} y={168} w={70} fill={NAVY} />
    {[184, 200, 216].map((y) => (
      <g key={y}>
        <Check x={350} y={y + 5} r={5} />
        <Bar x={360} y={y + 2} w={60} h={5} />
      </g>
    ))}
  </>
);

const serviceScenes = {
  'web-development': WebScene,
  'mobile-development': MobileScene,
  'software-development': SoftwareScene,
  networking: NetworkScene,
  hardware: HardwareScene,
  'graphic-design': DesignScene,
  typing: TypingScene,
  'ai-machine-learning': AiScene,
  'data-analytics': DataScene,
  'it-consultancy': ConsultScene,
  'digital-transformation': TransformScene,
};

export const ServiceArt = ({ id, label }) => {
  const Content = serviceScenes[id] || WebScene;
  return (
    <Scene label={label}>
      <rect width="480" height="340" fill="url(#adram-dots)" />
      <Content />
    </Scene>
  );
};

/* ---------------------------------------------------------------------------
   Training: laptop with code, certificate and cap
--------------------------------------------------------------------------- */
export const TrainingArt = () => (
  <Scene label="Laptop with code, a certificate and a graduation cap">
    <circle cx="240" cy="170" r="160" fill="url(#adram-glow)" />
    <Orbit cx={240} cy={186} rx={220} ry={70} />
    <g filter="url(#adram-shadow)">
      <rect x="92" y="56" width="280" height="180" rx="14" style={{ fill: NAVY }} />
      <rect x="104" y="68" width="256" height="156" rx="6" style={{ fill: DEEP }} />
      <path d="M62 236h340l-16 20H78z" style={{ fill: 'var(--t-800, #1a3a95)' }} />
    </g>
    {[
      [120, 88, [40, 70], [CYAN, '#fff']],
      [136, 108, [30, 90], ['#ff9fd0', '#9fb0dd']],
      [136, 128, [56, 44], [CYAN, '#fff']],
      [152, 148, [70], ['#3ddc97']],
      [136, 168, [40, 60], ['#ffc75f', '#9fb0dd']],
      [120, 188, [24], [CYAN]],
    ].map(([x, y, widths, colors]) => {
      let cx = x;
      return widths.map((w, i) => {
        const el = <rect key={`${y}-${i}`} x={cx} y={y} width={w} height="8" rx="4" opacity=".9" style={{ fill: colors[i] }} />;
        cx += w + 8;
        return el;
      });
    })}
    <rect className="art-blink" x="152" y="188" width="3" height="12" fill="#fff" />
    <g className="art-float">
      <g filter="url(#adram-shadow)">
        <rect x="316" y="160" width="140" height="100" rx="10" fill="#fff" />
        <rect x="324" y="168" width="124" height="84" rx="6" fill="none" strokeWidth="2" style={{ stroke: LINE }} />
      </g>
      <Bar x={338} y={184} w={70} h={7} fill={NAVY} />
      <Bar x={338} y={198} w={92} h={5} />
      <Bar x={338} y={208} w={60} h={5} />
      <circle cx="420" cy="232" r="14" style={{ fill: G }} />
      <path d="M413 244l-3 14 10-5 10 5-3-14" style={{ fill: BLUE }} />
    </g>
    <g className="art-float" style={{ animationDelay: '-3s' }}>
      <Tile x={40} y={40} icon="graduate" size={66} />
    </g>
  </Scene>
);

/* ---------------------------------------------------------------------------
   Scholarships: globe, flight path from Freetown, cap and passport
--------------------------------------------------------------------------- */
export const ScholarshipArt = () => (
  <Scene label="A globe with a flight path, graduation cap and passport">
    <circle cx="240" cy="176" r="160" fill="url(#adram-glow)" />
    <g filter="url(#adram-shadow)">
      <circle cx="240" cy="180" r="110" fill="#fff" />
    </g>
    <circle cx="240" cy="180" r="110" style={{ fill: SOFT }} />
    <ellipse cx="240" cy="180" rx="46" ry="110" fill="none" strokeWidth="2" style={{ stroke: 'var(--t-200, #c9d6f6)' }} />
    <ellipse cx="240" cy="180" rx="90" ry="110" fill="none" strokeWidth="2" style={{ stroke: 'var(--t-200, #c9d6f6)' }} />
    <path d="M130 180h220M146 124h188M146 236h188" strokeWidth="2" style={{ stroke: 'var(--t-200, #c9d6f6)' }} />
    {/* simplified landmasses */}
    <path d="M204 110c16-10 40-6 46 8 6 12-6 18-2 30 5 14 22 18 20 34-2 20-22 34-34 48-8-12-4-30-14-40-12-10-30-6-32-22-3-18 4-48 16-58z" fill="url(#adram-grad)" opacity=".85" />
    <path d="M286 96c14 2 28 12 30 26-10 4-24-2-30 6-8-8-12-26 0-32zM300 190c10 4 22 12 20 24-8 2-18-6-20-24z" fill="url(#adram-grad)" opacity=".55" />
    {/* flight path */}
    <path className="art-dash" d="M214 214 C 150 110, 300 20, 392 92" fill="none" strokeWidth="3" strokeDasharray="8 8" strokeLinecap="round" style={{ stroke: 'var(--t-500, #2f8cf5)' }} />
    <g transform="translate(392 92) rotate(20)">
      <path d="M-18-12 22 0-18 12-11 0z" style={{ fill: BLUE }} />
      <path d="M-11 0 22 0-8 8z" style={{ fill: CYAN }} />
    </g>
    {/* pins */}
    <g>
      <path d="M214 218s-14-12-14-22a14 14 0 0 1 28 0c0 10-14 22-14 22z" style={{ fill: NAVY }} />
      <circle cx="214" cy="196" r="5" fill="#fff" />
    </g>
    <g className="art-float">
      <Tile x={50} y={52} icon="graduate" size={72} dark />
    </g>
    <g className="art-float" style={{ animationDelay: '-3s' }}>
      <g filter="url(#adram-shadow)">
        <rect x="346" y="192" width="90" height="120" rx="10" style={{ fill: NAVY }} />
      </g>
      <circle cx="391" cy="238" r="20" fill="none" strokeWidth="3" style={{ stroke: CYAN }} />
      <path d="M371 238h40M391 218c-8 10-8 30 0 40M391 218c8 10 8 30 0 40" strokeWidth="2" fill="none" style={{ stroke: CYAN }} />
      <Bar x={364} y={274} w={54} h={6} fill="rgba(255,255,255,.6)" />
      <Bar x={372} y={288} w={38} h={5} fill="rgba(255,255,255,.3)" />
    </g>
  </Scene>
);

/* ---------------------------------------------------------------------------
   About: the ADRAM mark at the centre of what we do
--------------------------------------------------------------------------- */
export const AboutArt = () => {
  const chips = [
    { x: 16, y: 40, icon: 'server', label: 'IT services' },
    { x: 300, y: 60, icon: 'laptop', label: 'Training' },
    { x: 280, y: 262, icon: 'graduate', label: 'Scholarships' },
    { x: 20, y: 250, icon: 'people', label: 'People first' },
  ];
  return (
    <Scene label="The ADRAM logo surrounded by its services, training and scholarships">
      <circle cx="240" cy="176" r="170" fill="url(#adram-glow)" />
      <circle cx="240" cy="176" r="128" fill="none" strokeWidth="2" strokeDasharray="4 8" style={{ stroke: LINE }} />
      <circle cx="240" cy="176" r="88" fill="none" strokeWidth="2" style={{ stroke: LINE }} />
      <Orbit cx={240} cy={180} rx={200} ry={64} angle={-18} />
      <g filter="url(#adram-shadow)">
        <circle cx="240" cy="176" r="62" fill="#fff" />
      </g>
      <image href="/brand/mark-192.png" x="196" y="132" width="88" height="88" />
      {chips.map((c, i) => (
        <g key={c.label} className="art-float" style={{ animationDelay: `${-i * 1.5}s` }}>
          <rect x={c.x} y={c.y} width="164" height="52" rx="14" fill="#fff" filter="url(#adram-shadow)" />
          <rect x={c.x + 10} y={c.y + 10} width="32" height="32" rx="9" style={{ fill: SOFT }} />
          <IconAt name={c.icon} x={c.x + 15} y={c.y + 15} size={22} color={NAVY} />
          <text x={c.x + 52} y={c.y + 31} fontFamily={FONT} fontSize="14" fontWeight="700" style={{ fill: NAVY }}>{c.label}</text>
        </g>
      ))}
    </Scene>
  );
};

/* ---------------------------------------------------------------------------
   Contact: a conversation window with mail, phone and location tiles
--------------------------------------------------------------------------- */
export const ContactArt = () => (
  <Scene label="A chat window with messages, and mail, phone and location icons">
    <circle cx="240" cy="170" r="160" fill="url(#adram-glow)" />
    <Orbit cx={240} cy={180} rx={220} ry={70} />
    <Window x={100} y={50} w={280} h={230}>
      {/* incoming message */}
      <circle cx="126" cy="106" r="12" style={{ fill: 'var(--t-200, #c9d6f6)' }} />
      <rect x="146" y="92" width="150" height="44" rx="12" fill="#f0f4fc" />
      <Bar x={158} y={104} w={110} h={6} fill="#b7c4e3" />
      <Bar x={158} y={118} w={76} h={6} fill="#cfd8ee" />
      {/* reply */}
      <rect x="186" y="150" width="170" height="54" rx="12" style={{ fill: G }} />
      <Bar x={200} y={164} w={130} h={6} fill="rgba(255,255,255,.85)" />
      <Bar x={200} y={178} w={96} h={6} fill="rgba(255,255,255,.6)" />
      <path d="M338 190l6 6 10-12" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      {/* input bar */}
      <rect x="116" y="226" width="248" height="36" rx="10" fill="#f5f7fc" stroke="#e3e8f4" />
      <Bar x={130} y={241} w={120} h={6} fill="#d5dcec" />
      <circle cx="344" cy="244" r="12" style={{ fill: G }} />
      <path d="M338 244h11M345 239l5 5-5 5" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </Window>
    <g className="art-float">
      <Tile x={36} y={70} icon="mail" size={64} dark />
    </g>
    <g className="art-float" style={{ animationDelay: '-2s' }}>
      <Tile x={388} y={96} icon="phone" size={60} />
    </g>
    <g className="art-float" style={{ animationDelay: '-4s' }}>
      <Tile x={60} y={236} icon="location" size={58} />
    </g>
  </Scene>
);

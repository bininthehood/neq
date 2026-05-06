// illustrations.jsx — Quiet Ink illustration system, 4 styles × 8 names
// Each style is a complete recasting of the 8 spot illustrations.
//
// Styles:
//   geometric   — circles/arcs/lines/rects only. Gallery-poster minimal.
//   editorial   — small inked spot drawings. Hand-feel, slightly asymmetric.
//   letterpress — heavy block forms + texture/grain + ink-bleed feel.
//   lineart     — single-weight thin lines, no fills. Most reductive.
//
// Usage: <Illust name="emptySaved" style="editorial" size={220} />

const ILLUST_BG = '#12110E';
const ILLUST_AMBER = '#C4A35A';
const ILLUST_AMBER_DIM = 'rgba(196,163,90,0.20)';
const ILLUST_STROKE = '#3A3833';
const ILLUST_INK = '#6B6C75';
const ILLUST_PAPER = '#24231E';

// Shared filter for letterpress: ink-bleed + grain
const _Defs = () => (
  <defs>
    <filter id="lp-bleed" x="-5%" y="-5%" width="110%" height="110%">
      <feMorphology in="SourceGraphic" operator="dilate" radius="0.4" result="d"/>
      <feTurbulence baseFrequency="0.9" numOctaves="2" seed="3" result="t"/>
      <feDisplacementMap in="d" in2="t" scale="1.2" result="m"/>
      <feGaussianBlur in="m" stdDeviation="0.25"/>
    </filter>
    <pattern id="lp-grain" width="3" height="3" patternUnits="userSpaceOnUse">
      <rect width="3" height="3" fill="transparent"/>
      <circle cx="1" cy="1" r="0.3" fill="rgba(196,163,90,0.15)"/>
    </pattern>
  </defs>
);

// ─── GEOMETRIC ─────────────────────────────────────────────────
const G = {
  welcome: () => (<>
    <circle cx="100" cy="100" r="84" fill="none" stroke={ILLUST_STROKE} strokeWidth="1"/>
    <path d="M 100 38 A 62 62 0 1 0 100 162 A 44 44 0 1 1 100 38 Z" fill={ILLUST_AMBER_DIM} stroke={ILLUST_AMBER} strokeWidth="1.5"/>
    <circle cx="148" cy="64" r="3" fill={ILLUST_AMBER}/>
    <line x1="22" y1="172" x2="178" y2="172" stroke={ILLUST_INK} strokeWidth="1" strokeLinecap="square"/>
  </>),
  emptyDiscover: () => (<>
    <rect x="64" y="56" width="72" height="100" rx="2" fill={ILLUST_PAPER} stroke={ILLUST_STROKE} strokeWidth="1" transform="rotate(-6 100 106)"/>
    <rect x="64" y="56" width="72" height="100" rx="2" fill={ILLUST_PAPER} stroke={ILLUST_STROKE} strokeWidth="1" transform="rotate(-2 100 106)"/>
    <rect x="64" y="56" width="72" height="100" rx="2" fill={ILLUST_BG} stroke={ILLUST_AMBER} strokeWidth="1.5"/>
    <circle cx="100" cy="106" r="3" fill={ILLUST_AMBER}/>
    <path d="M 152 106 L 172 106 M 166 100 L 172 106 L 166 112" fill="none" stroke={ILLUST_INK} strokeWidth="1" strokeLinecap="square"/>
  </>),
  emptySaved: () => (<>
    <rect x="36" y="40" width="128" height="120" fill="none" stroke={ILLUST_STROKE} strokeWidth="1"/>
    <line x1="36" y1="100" x2="164" y2="100" stroke={ILLUST_STROKE} strokeWidth="1"/>
    <rect x="56" y="56" width="6" height="40" fill={ILLUST_AMBER} transform="rotate(-8 59 76)"/>
    <rect x="68" y="56" width="6" height="40" fill="none" stroke={ILLUST_INK} strokeWidth="1" transform="rotate(-3 71 76)"/>
    <circle cx="100" cy="130" r="2" fill={ILLUST_INK}/>
    <circle cx="112" cy="130" r="2" fill={ILLUST_INK}/>
    <circle cx="124" cy="130" r="2" fill={ILLUST_INK}/>
  </>),
  noResults: () => (<>
    {[40, 70, 100, 130, 160].flatMap(y => [40, 70, 100, 130, 160].map(x => (
      <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" fill={ILLUST_INK}/>
    )))}
    <circle cx="86" cy="86" r="36" fill={ILLUST_BG} stroke={ILLUST_AMBER} strokeWidth="1.5"/>
    <line x1="112" y1="112" x2="148" y2="148" stroke={ILLUST_AMBER} strokeWidth="1.5" strokeLinecap="square"/>
    <line x1="68" y1="104" x2="104" y2="68" stroke={ILLUST_INK} strokeWidth="1" strokeLinecap="square"/>
  </>),
  calibrating: () => (<>
    <circle cx="100" cy="100" r="68" fill="none" stroke={ILLUST_STROKE} strokeWidth="1"/>
    <path d="M 100 32 A 68 68 0 0 1 168 100" fill="none" stroke={ILLUST_AMBER} strokeWidth="1.5" strokeLinecap="square"/>
    <line x1="40" y1="100" x2="160" y2="100" stroke={ILLUST_INK} strokeWidth="1" strokeLinecap="square"/>
    <circle cx="128" cy="100" r="3" fill={ILLUST_AMBER}/>
    <line x1="64" y1="96" x2="64" y2="104" stroke={ILLUST_INK} strokeWidth="1"/>
    <line x1="100" y1="96" x2="100" y2="104" stroke={ILLUST_INK} strokeWidth="1"/>
    <line x1="136" y1="96" x2="136" y2="104" stroke={ILLUST_INK} strokeWidth="1"/>
  </>),
  error: () => (<>
    <path d="M 50 50 L 150 50 L 150 100 L 100 150 L 50 150 Z" fill={ILLUST_PAPER} stroke={ILLUST_STROKE} strokeWidth="1"/>
    <path d="M 100 150 L 150 100 L 150 50" fill="none" stroke={ILLUST_AMBER} strokeWidth="1.5"/>
    <path d="M 50 110 L 80 100 L 75 120 L 105 110 L 100 130 L 130 120" fill="none" stroke={ILLUST_INK} strokeWidth="1" strokeLinecap="square"/>
    <circle cx="160" cy="44" r="3" fill={ILLUST_AMBER}/>
  </>),
  onboarding: () => (<>
    <line x1="40" y1="170" x2="160" y2="170" stroke={ILLUST_STROKE} strokeWidth="1"/>
    <circle cx="40" cy="170" r="3" fill={ILLUST_AMBER}/>
    <circle cx="100" cy="170" r="3" fill={ILLUST_AMBER}/>
    <circle cx="160" cy="170" r="3" fill={ILLUST_INK} fillOpacity="0.3"/>
    <path d="M 70 60 L 130 100 L 70 140 Z" fill={ILLUST_AMBER_DIM} stroke={ILLUST_AMBER} strokeWidth="1.5" strokeLinejoin="miter"/>
    <path d="M 50 60 L 110 100 L 50 140 Z" fill="none" stroke={ILLUST_STROKE} strokeWidth="1" strokeLinejoin="miter"/>
  </>),
  archive: () => (<>
    <rect x="40" y="50" width="120" height="10" fill={ILLUST_PAPER} stroke={ILLUST_STROKE} strokeWidth="1"/>
    <rect x="50" y="68" width="100" height="10" fill={ILLUST_PAPER} stroke={ILLUST_STROKE} strokeWidth="1"/>
    <rect x="40" y="86" width="120" height="10" fill={ILLUST_AMBER}/>
    <rect x="58" y="104" width="84" height="10" fill={ILLUST_PAPER} stroke={ILLUST_STROKE} strokeWidth="1"/>
    <rect x="40" y="122" width="120" height="10" fill={ILLUST_PAPER} stroke={ILLUST_STROKE} strokeWidth="1"/>
    <rect x="64" y="140" width="72" height="10" fill={ILLUST_PAPER} stroke={ILLUST_STROKE} strokeWidth="1"/>
    <circle cx="170" cy="91" r="2.5" fill={ILLUST_AMBER}/>
  </>),
};

// ─── EDITORIAL ─────────────────────────────────────────────────
// Hand-drawn spot drawings — slightly wonky lines, asymmetric, sketchy hatching
const E = {
  welcome: () => (<>
    {/* sun rising over horizon — sketchy circle, hand line for horizon */}
    <path d="M 60 100 Q 80 60, 100 60 Q 122 60, 140 100" fill="none" stroke={ILLUST_AMBER} strokeWidth="1.4" strokeLinecap="round"/>
    <path d="M 60 100 L 140 100" stroke={ILLUST_AMBER} strokeWidth="1.4" strokeLinecap="round"/>
    {/* horizon line — hand wobble */}
    <path d="M 22 138 Q 60 136, 100 138 T 178 138" fill="none" stroke={ILLUST_INK} strokeWidth="1.2" strokeLinecap="round"/>
    {/* sketchy hatching inside the sun */}
    <path d="M 78 88 L 122 88 M 76 96 L 124 96 M 80 80 L 120 80" stroke={ILLUST_AMBER} strokeWidth="0.6" strokeLinecap="round" opacity="0.5"/>
    {/* bird mark — single small swoosh */}
    <path d="M 144 56 q 6 -4 12 0 q 6 -4 12 0" fill="none" stroke={ILLUST_INK} strokeWidth="1" strokeLinecap="round"/>
  </>),
  emptyDiscover: () => (<>
    {/* a hand pointing to a card — sketchy outline of a card */}
    <path d="M 70 56 L 138 60 L 134 156 L 66 152 Z" fill={ILLUST_PAPER} stroke={ILLUST_INK} strokeWidth="1.2" strokeLinejoin="round"/>
    {/* inner poster mark — diagonal sketch lines */}
    <path d="M 78 80 L 124 84 M 76 96 L 126 100 M 78 116 L 122 120" stroke={ILLUST_INK} strokeWidth="0.8" strokeLinecap="round" opacity="0.5"/>
    {/* amber dot — like an ink stamp */}
    <circle cx="100" cy="120" r="5" fill={ILLUST_AMBER}/>
    <circle cx="100" cy="120" r="9" fill="none" stroke={ILLUST_AMBER} strokeWidth="0.8" opacity="0.4"/>
    {/* arrow swoosh */}
    <path d="M 148 106 q 12 -4 20 0 m -6 -5 l 6 5 l -6 6" fill="none" stroke={ILLUST_AMBER} strokeWidth="1.2" strokeLinecap="round"/>
  </>),
  emptySaved: () => (<>
    {/* empty bookshelf — sketchy plank */}
    <path d="M 30 110 L 170 116" stroke={ILLUST_INK} strokeWidth="1.6" strokeLinecap="round"/>
    <path d="M 30 110 L 30 130 L 170 136 L 170 116" fill="none" stroke={ILLUST_INK} strokeWidth="0.8" strokeLinecap="round"/>
    {/* two leaning books only */}
    <path d="M 50 70 L 56 110 L 64 110 L 60 70 Z" fill={ILLUST_AMBER} stroke={ILLUST_AMBER_DIM} strokeWidth="0.5"/>
    <path d="M 70 76 L 76 111 L 84 111 L 78 74 Z" fill="none" stroke={ILLUST_INK} strokeWidth="1"/>
    {/* a single tiny dust mote (sparkle) */}
    <path d="M 130 80 L 134 84 M 132 78 L 132 86" stroke={ILLUST_AMBER} strokeWidth="1" strokeLinecap="round"/>
    {/* faint hatching for texture on shelf */}
    <path d="M 40 130 L 46 134 M 60 132 L 66 136 M 80 134 L 86 138 M 100 134 L 106 138 M 120 134 L 126 138" stroke={ILLUST_INK} strokeWidth="0.5" opacity="0.4"/>
  </>),
  noResults: () => (<>
    {/* sketchy magnifying glass hovering over an empty page */}
    <path d="M 60 50 L 150 56 L 144 158 L 54 152 Z" fill={ILLUST_PAPER} stroke={ILLUST_INK} strokeWidth="1.2" strokeLinejoin="round" opacity="0.6"/>
    {/* lens — slightly ovaled */}
    <ellipse cx="100" cy="92" rx="32" ry="30" fill="none" stroke={ILLUST_AMBER} strokeWidth="1.4"/>
    {/* handle — hand-drawn diagonal */}
    <path d="M 124 116 q 8 8 16 18 q 4 4 8 6" fill="none" stroke={ILLUST_AMBER} strokeWidth="1.4" strokeLinecap="round"/>
    {/* lens highlight — sketchy curve */}
    <path d="M 84 78 q 8 -4 16 0" fill="none" stroke={ILLUST_AMBER} strokeWidth="0.8" strokeLinecap="round" opacity="0.6"/>
    {/* nothing-to-see slash */}
    <path d="M 84 102 q 16 -8 32 0" fill="none" stroke={ILLUST_INK} strokeWidth="1" strokeLinecap="round"/>
  </>),
  calibrating: () => (<>
    {/* a small balance / scale — two pans on a beam */}
    <path d="M 100 36 L 100 110" stroke={ILLUST_INK} strokeWidth="1.2" strokeLinecap="round"/>
    <path d="M 50 64 L 150 60" stroke={ILLUST_INK} strokeWidth="1.4" strokeLinecap="round"/>
    {/* left pan — bowl */}
    <path d="M 36 64 q 14 22 28 0" fill="none" stroke={ILLUST_INK} strokeWidth="1.2" strokeLinecap="round"/>
    <path d="M 36 64 L 64 64" stroke={ILLUST_INK} strokeWidth="0.6" strokeLinecap="round" opacity="0.4"/>
    {/* right pan — slightly tipped, amber */}
    <path d="M 134 64 q 14 22 28 0" fill="none" stroke={ILLUST_AMBER} strokeWidth="1.4" strokeLinecap="round"/>
    <path d="M 134 64 L 162 64" stroke={ILLUST_AMBER} strokeWidth="0.6" strokeLinecap="round" opacity="0.5"/>
    {/* tiny weight in right pan */}
    <circle cx="148" cy="74" r="4" fill={ILLUST_AMBER}/>
    {/* base */}
    <path d="M 76 130 L 124 130" stroke={ILLUST_INK} strokeWidth="1.4" strokeLinecap="round"/>
    <path d="M 92 130 L 84 150 M 108 130 L 116 150" stroke={ILLUST_INK} strokeWidth="1" strokeLinecap="round"/>
  </>),
  error: () => (<>
    {/* a torn paper / page tear */}
    <path d="M 50 50 L 150 50 L 150 96 L 130 100 L 140 110 L 120 116 L 132 130 L 110 134 L 124 150 L 50 150 Z" fill={ILLUST_PAPER} stroke={ILLUST_INK} strokeWidth="1.2" strokeLinejoin="round"/>
    {/* hatching on paper */}
    <path d="M 64 70 L 116 70 M 62 84 L 112 84 M 62 96 L 100 96" stroke={ILLUST_INK} strokeWidth="0.7" strokeLinecap="round" opacity="0.4"/>
    {/* exclamation — sketchy circle + line */}
    <circle cx="158" cy="56" r="10" fill="none" stroke={ILLUST_AMBER} strokeWidth="1.2"/>
    <path d="M 158 50 L 158 58 M 158 62 L 158 63" stroke={ILLUST_AMBER} strokeWidth="1.6" strokeLinecap="round"/>
  </>),
  onboarding: () => (<>
    {/* a footstep trail — three arrows curving */}
    <path d="M 36 132 q 20 -30 60 -28 q 40 2 60 -32" fill="none" stroke={ILLUST_INK} strokeWidth="1" strokeLinecap="round" strokeDasharray="4 4"/>
    {/* footprint marks — small ovals */}
    <ellipse cx="48" cy="130" rx="6" ry="3" fill={ILLUST_INK} opacity="0.5"/>
    <ellipse cx="78" cy="116" rx="6" ry="3" fill={ILLUST_INK} opacity="0.7"/>
    <ellipse cx="110" cy="106" rx="6" ry="3" fill={ILLUST_AMBER}/>
    {/* destination marker — flag */}
    <path d="M 152 72 L 152 130" stroke={ILLUST_AMBER} strokeWidth="1.4" strokeLinecap="round"/>
    <path d="M 152 72 L 174 80 L 152 90" fill={ILLUST_AMBER}/>
    {/* tiny glow under flag */}
    <ellipse cx="152" cy="132" rx="10" ry="2" fill={ILLUST_AMBER} opacity="0.3"/>
  </>),
  archive: () => (<>
    {/* a stack of cards / collection — overlapping rectangles like polaroids */}
    <path d="M 36 60 L 110 56 L 116 124 L 42 128 Z" fill={ILLUST_PAPER} stroke={ILLUST_INK} strokeWidth="1" transform="rotate(-8 76 92)"/>
    <path d="M 60 50 L 134 54 L 130 122 L 56 118 Z" fill={ILLUST_PAPER} stroke={ILLUST_INK} strokeWidth="1" transform="rotate(2 96 86)"/>
    <path d="M 84 56 L 158 58 L 156 126 L 82 124 Z" fill={ILLUST_BG} stroke={ILLUST_AMBER} strokeWidth="1.4" transform="rotate(8 120 92)"/>
    {/* sketch lines inside top card */}
    <path d="M 100 80 q 10 -4 20 0 M 96 96 q 14 -4 28 0 M 96 110 q 10 -4 20 0" stroke={ILLUST_AMBER} strokeWidth="0.7" strokeLinecap="round" opacity="0.5" transform="rotate(8 120 92)"/>
    {/* small heart mark — a saved icon */}
    <path d="M 168 142 q -3 -4 -6 0 q -3 -4 -6 0 q 0 4 6 8 q 6 -4 6 -8 z" fill={ILLUST_AMBER}/>
  </>),
};

// ─── LETTERPRESS ───────────────────────────────────────────────
// Heavy block forms + texture grain + amber bleeds
const L = {
  welcome: () => (<>
    <_Defs/>
    {/* big block sun — amber filled rectangle with bleed */}
    <g filter="url(#lp-bleed)">
      <rect x="60" y="50" width="80" height="80" fill={ILLUST_AMBER}/>
    </g>
    {/* counter — bg-colored cutout circle inside the block */}
    <circle cx="100" cy="90" r="22" fill={ILLUST_BG}/>
    {/* horizon — heavy bar */}
    <rect x="20" y="150" width="160" height="6" fill={ILLUST_INK}/>
    {/* a smaller block — typography mark / serif "N" */}
    <text x="32" y="44" fontFamily="Instrument Serif, serif" fontSize="28" fill={ILLUST_INK} opacity="0.6">N.</text>
    {/* grain overlay */}
    <rect width="200" height="200" fill="url(#lp-grain)"/>
  </>),
  emptyDiscover: () => (<>
    <_Defs/>
    {/* blocky stacked card */}
    <g filter="url(#lp-bleed)">
      <rect x="56" y="48" width="86" height="120" fill={ILLUST_PAPER} stroke={ILLUST_INK} strokeWidth="3"/>
      <rect x="62" y="54" width="86" height="120" fill={ILLUST_AMBER}/>
    </g>
    {/* counter shapes — strong slabs */}
    <rect x="74" y="74" width="62" height="14" fill={ILLUST_BG}/>
    <rect x="74" y="98" width="42" height="6" fill={ILLUST_BG}/>
    <rect x="74" y="116" width="52" height="6" fill={ILLUST_BG}/>
    {/* big arrow block */}
    <path d="M 158 100 L 178 100 L 178 90 L 188 110 L 178 130 L 178 120 L 158 120 Z" fill={ILLUST_INK} opacity="0.7"/>
    <rect width="200" height="200" fill="url(#lp-grain)"/>
  </>),
  emptySaved: () => (<>
    <_Defs/>
    {/* heavy frame — printed plate */}
    <rect x="30" y="40" width="140" height="124" fill={ILLUST_PAPER} stroke={ILLUST_INK} strokeWidth="6"/>
    {/* "EMPTY" stamp letterforms */}
    <g filter="url(#lp-bleed)">
      <rect x="46" y="64" width="20" height="44" fill={ILLUST_AMBER}/>
      <rect x="74" y="64" width="22" height="6" fill={ILLUST_AMBER}/>
      <rect x="74" y="84" width="16" height="6" fill={ILLUST_AMBER}/>
      <rect x="74" y="102" width="22" height="6" fill={ILLUST_AMBER}/>
      <rect x="106" y="64" width="6" height="44" fill={ILLUST_INK}/>
      <rect x="106" y="64" width="20" height="6" fill={ILLUST_INK}/>
      <rect x="120" y="64" width="6" height="44" fill={ILLUST_INK}/>
    </g>
    {/* baseline */}
    <rect x="40" y="124" width="120" height="3" fill={ILLUST_INK}/>
    <rect width="200" height="200" fill="url(#lp-grain)"/>
  </>),
  noResults: () => (<>
    <_Defs/>
    {/* big circle stamp + diagonal slash */}
    <g filter="url(#lp-bleed)">
      <circle cx="100" cy="100" r="56" fill="none" stroke={ILLUST_AMBER} strokeWidth="10"/>
      <rect x="56" y="96" width="88" height="8" fill={ILLUST_AMBER} transform="rotate(-30 100 100)"/>
    </g>
    {/* "0" inside */}
    <text x="100" y="120" fontFamily="Geist Mono, monospace" fontSize="40" fontWeight="700" fill={ILLUST_INK} textAnchor="middle">0</text>
    {/* tiny corner marks */}
    <rect x="20" y="20" width="10" height="3" fill={ILLUST_INK}/>
    <rect x="20" y="20" width="3" height="10" fill={ILLUST_INK}/>
    <rect x="170" y="177" width="10" height="3" fill={ILLUST_INK}/>
    <rect x="177" y="170" width="3" height="10" fill={ILLUST_INK}/>
    <rect width="200" height="200" fill="url(#lp-grain)"/>
  </>),
  calibrating: () => (<>
    <_Defs/>
    {/* "TASTE" type-block style — vertical bar gradient using stacked rects */}
    <g filter="url(#lp-bleed)">
      <rect x="48" y="50" width="14" height="100" fill={ILLUST_INK}/>
      <rect x="68" y="62" width="14" height="88" fill={ILLUST_INK}/>
      <rect x="88" y="42" width="14" height="108" fill={ILLUST_AMBER}/>
      <rect x="108" y="74" width="14" height="76" fill={ILLUST_INK}/>
      <rect x="128" y="58" width="14" height="92" fill={ILLUST_INK}/>
    </g>
    {/* baseline */}
    <rect x="40" y="156" width="120" height="3" fill={ILLUST_INK}/>
    {/* amber index dot above third bar */}
    <circle cx="95" cy="34" r="4" fill={ILLUST_AMBER}/>
    <rect width="200" height="200" fill="url(#lp-grain)"/>
  </>),
  error: () => (<>
    <_Defs/>
    {/* heavy block "!" */}
    <g filter="url(#lp-bleed)">
      <rect x="90" y="40" width="20" height="80" fill={ILLUST_AMBER}/>
      <rect x="90" y="132" width="20" height="20" fill={ILLUST_AMBER}/>
    </g>
    {/* outer rectangle */}
    <rect x="40" y="30" width="120" height="140" fill="none" stroke={ILLUST_INK} strokeWidth="4"/>
    {/* corner deco — printer's mark */}
    <rect x="46" y="36" width="14" height="3" fill={ILLUST_INK}/>
    <rect x="46" y="36" width="3" height="14" fill={ILLUST_INK}/>
    <rect x="140" y="36" width="14" height="3" fill={ILLUST_INK}/>
    <rect x="151" y="36" width="3" height="14" fill={ILLUST_INK}/>
    <rect width="200" height="200" fill="url(#lp-grain)"/>
  </>),
  onboarding: () => (<>
    <_Defs/>
    {/* big right-pointing block arrow */}
    <g filter="url(#lp-bleed)">
      <path d="M 30 80 L 110 80 L 110 60 L 170 100 L 110 140 L 110 120 L 30 120 Z" fill={ILLUST_AMBER}/>
    </g>
    {/* numbered dots — page numbers */}
    <text x="46" y="170" fontFamily="Geist Mono, monospace" fontSize="14" fontWeight="600" fill={ILLUST_INK}>01</text>
    <text x="92" y="170" fontFamily="Geist Mono, monospace" fontSize="14" fontWeight="600" fill={ILLUST_AMBER}>02</text>
    <text x="138" y="170" fontFamily="Geist Mono, monospace" fontSize="14" fontWeight="600" fill={ILLUST_INK} opacity="0.4">03</text>
    <rect x="40" y="180" width="120" height="2" fill={ILLUST_INK}/>
    <rect width="200" height="200" fill="url(#lp-grain)"/>
  </>),
  archive: () => (<>
    <_Defs/>
    {/* stack of horizontal bars — like type drawer */}
    <g filter="url(#lp-bleed)">
      <rect x="30" y="40" width="140" height="14" fill={ILLUST_INK}/>
      <rect x="30" y="58" width="100" height="14" fill={ILLUST_INK}/>
      <rect x="30" y="76" width="140" height="14" fill={ILLUST_AMBER}/>
      <rect x="30" y="94" width="120" height="14" fill={ILLUST_INK}/>
      <rect x="30" y="112" width="80" height="14" fill={ILLUST_INK}/>
      <rect x="30" y="130" width="140" height="14" fill={ILLUST_INK}/>
      <rect x="30" y="148" width="60" height="14" fill={ILLUST_INK}/>
    </g>
    {/* index marks */}
    <rect x="174" y="80" width="10" height="6" fill={ILLUST_AMBER}/>
    <rect width="200" height="200" fill="url(#lp-grain)"/>
  </>),
};

// ─── LINE ART ──────────────────────────────────────────────────
// Single-weight thin lines, no fills, very reductive
const N = {
  welcome: () => (<>
    {/* simple sun — open arc + horizon */}
    <path d="M 60 110 q 40 -50 80 0" fill="none" stroke={ILLUST_AMBER} strokeWidth="1" strokeLinecap="square"/>
    <line x1="50" y1="110" x2="150" y2="110" stroke={ILLUST_AMBER} strokeWidth="1" strokeLinecap="square"/>
    {/* horizon — single thin line */}
    <line x1="20" y1="160" x2="180" y2="160" stroke={ILLUST_INK} strokeWidth="1" strokeLinecap="square"/>
    {/* tiny mark — N. */}
    <text x="100" y="190" fontFamily="Instrument Serif" fontSize="10" fill={ILLUST_INK} textAnchor="middle">N.</text>
  </>),
  emptyDiscover: () => (<>
    {/* one rectangle outline + arrow */}
    <rect x="64" y="56" width="72" height="100" fill="none" stroke={ILLUST_AMBER} strokeWidth="1"/>
    {/* hint of stack — single line behind */}
    <line x1="68" y1="50" x2="140" y2="50" stroke={ILLUST_INK} strokeWidth="1"/>
    <line x1="146" y1="56" x2="146" y2="156" stroke={ILLUST_INK} strokeWidth="1"/>
    {/* arrow — minimal */}
    <line x1="148" y1="106" x2="174" y2="106" stroke={ILLUST_INK} strokeWidth="1"/>
    <polyline points="168,100 174,106 168,112" fill="none" stroke={ILLUST_INK} strokeWidth="1"/>
  </>),
  emptySaved: () => (<>
    {/* shelf line + 1 book outline */}
    <line x1="30" y1="120" x2="170" y2="120" stroke={ILLUST_INK} strokeWidth="1"/>
    <rect x="60" y="80" width="8" height="40" fill="none" stroke={ILLUST_AMBER} strokeWidth="1" transform="rotate(-6 64 100)"/>
    {/* dotted gap line for "rest is empty" */}
    <line x1="80" y1="116" x2="170" y2="116" stroke={ILLUST_INK} strokeWidth="1" strokeDasharray="2 4" opacity="0.5"/>
  </>),
  noResults: () => (<>
    {/* circle + slash, nothing else */}
    <circle cx="100" cy="100" r="44" fill="none" stroke={ILLUST_AMBER} strokeWidth="1"/>
    <line x1="78" y1="122" x2="122" y2="78" stroke={ILLUST_INK} strokeWidth="1" strokeLinecap="square"/>
    {/* tiny baseline label dash */}
    <line x1="86" y1="156" x2="114" y2="156" stroke={ILLUST_INK} strokeWidth="1"/>
  </>),
  calibrating: () => (<>
    {/* horizontal axis — single line + amber tick */}
    <line x1="30" y1="100" x2="170" y2="100" stroke={ILLUST_INK} strokeWidth="1" strokeLinecap="square"/>
    {/* notch marks */}
    {[50, 80, 110, 140].map(x => (
      <line key={x} x1={x} y1="96" x2={x} y2="104" stroke={ILLUST_INK} strokeWidth="1"/>
    ))}
    {/* amber index marker — small triangle above axis */}
    <path d="M 110 88 L 105 96 L 115 96 Z" fill={ILLUST_AMBER}/>
    <line x1="110" y1="96" x2="110" y2="104" stroke={ILLUST_AMBER} strokeWidth="1.4"/>
  </>),
  error: () => (<>
    {/* page outline with one diagonal cut */}
    <path d="M 50 50 L 150 50 L 150 110 L 110 150 L 50 150 Z" fill="none" stroke={ILLUST_INK} strokeWidth="1"/>
    {/* fold/cut accent */}
    <path d="M 110 150 L 110 110 L 150 110" fill="none" stroke={ILLUST_AMBER} strokeWidth="1"/>
    {/* small ! mark */}
    <line x1="160" y1="42" x2="160" y2="52" stroke={ILLUST_AMBER} strokeWidth="1.4"/>
    <circle cx="160" cy="58" r="1.2" fill={ILLUST_AMBER}/>
  </>),
  onboarding: () => (<>
    {/* simple arrow line, three dots */}
    <line x1="30" y1="100" x2="160" y2="100" stroke={ILLUST_INK} strokeWidth="1" strokeLinecap="square"/>
    <polyline points="154,94 160,100 154,106" fill="none" stroke={ILLUST_INK} strokeWidth="1"/>
    {/* progress dots below */}
    <circle cx="50" cy="140" r="3" fill={ILLUST_AMBER}/>
    <circle cx="100" cy="140" r="3" fill={ILLUST_AMBER}/>
    <circle cx="150" cy="140" r="3" fill="none" stroke={ILLUST_INK} strokeWidth="1"/>
  </>),
  archive: () => (<>
    {/* horizontal lines — like a list */}
    {[60, 78, 96, 114, 132].map((y, i) => (
      <line key={y} x1="40" y1={y} x2={i === 2 ? 160 : 100 + (i*12)} y2={y}
        stroke={i === 2 ? ILLUST_AMBER : ILLUST_INK} strokeWidth="1" strokeLinecap="square"/>
    ))}
    {/* index dot beside amber line */}
    <circle cx="170" cy="96" r="2.5" fill={ILLUST_AMBER}/>
  </>),
};

const STYLES = { geometric: G, editorial: E, letterpress: L, lineart: N };

const ILLUSTS = {
  welcome:        { kr: '시작',        en: 'Welcome',          context: '첫 진입 / 스플래시' },
  emptyDiscover:  { kr: '탐색 시작',   en: 'Empty Discover',   context: 'Discover 처음 / 카드 모두 본 뒤' },
  emptySaved:     { kr: '빈 책장',     en: 'Empty Saved',      context: '저장한 작품 없음' },
  noResults:      { kr: '없음',        en: 'No Results',       context: '검색 결과 없음' },
  calibrating:    { kr: '취향 분석',   en: 'Calibrating',      context: '온보딩 중 / 추천 계산' },
  error:          { kr: '오류',        en: 'Error',            context: '네트워크 / 시스템 에러' },
  onboarding:     { kr: '진행',        en: 'Onboarding',       context: '온보딩 단계 진입' },
  archive:        { kr: '아카이브',    en: 'Archive',          context: '저장 마일스톤 / 컬렉션' },
};

// ── Per-scenario style mapping (Round 1 — 일러스트 결정) ─────────
// Default: lineart. Exceptions: welcome(#01), emptyDiscover(#02) → geometric.
const ILLUST_STYLE_MAP = {
  welcome:        'geometric',
  emptyDiscover:  'geometric',
  // rest fall through to default
};
const ILLUST_DEFAULT_STYLE = 'lineart';

function styleFor(name) {
  return ILLUST_STYLE_MAP[name] || ILLUST_DEFAULT_STYLE;
}

function Illust({ name, style = 'auto', size = 200 }) {
  const resolved = style === 'auto' ? styleFor(name) : style;
  const set = STYLES[resolved] || STYLES[ILLUST_DEFAULT_STYLE] || G;
  const C = set[name] || G[name];
  if (!C) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" style={{ display: 'block' }}>
      <C/>
    </svg>
  );
}

window.NekoIllust = Illust;
window.NekoIllusts = ILLUSTS;
window.NekoIllustStyles = ['geometric', 'editorial', 'letterpress', 'lineart'];
window.NekoStyleFor = styleFor;
window.NekoIllustStyleMap = ILLUST_STYLE_MAP;
window.NekoIllustDefaultStyle = ILLUST_DEFAULT_STYLE;

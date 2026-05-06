// neko-poster.jsx — generates stylized SVG poster placeholders as data URLs
// Each work gets a deterministic poster based on title + cat + year.
// Editorial style: textured gradient, big Fraunces title, year mark, ink dot.

const _POSTER_PALETTES = [
  // [bg-deep, bg-mid, accent, ink]
  ['#1a1410', '#3d2818', '#c4a35a', '#0a0805'], // amber dusk
  ['#0f1418', '#1f2c38', '#7ba3d4', '#050708'], // cool blue
  ['#1a0f14', '#3a1f2c', '#e08a6c', '#0a0507'], // rust coral
  ['#0f1a14', '#1f3a2c', '#7ec4a0', '#050a07'], // moss green
  ['#14141a', '#28283a', '#9b8ae0', '#070708'], // violet
  ['#1a1814', '#3a3528', '#d4a245', '#0a0907'], // golden
  ['#181014', '#2c1e2c', '#c47b9b', '#080507'], // mauve
  ['#101418', '#1e2c3a', '#5b9bc4', '#050708'], // steel blue
];

function _hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function _esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Generate a poster SVG and return as data URL.
function makePoster(work, w = 342, h = 513) {
  const pal = _POSTER_PALETTES[_hash(work.id) % _POSTER_PALETTES.length];
  const [deep, mid, accent, ink] = pal;
  const angle = (_hash(work.id + 'a') % 60) - 30; // -30..30
  const dotX = 30 + (_hash(work.id + 'd') % (w - 60));
  const dotY = 60 + (_hash(work.id + 'e') % 80);
  const seed = _hash(work.id + 's') % 999;

  // Hand-feel hatching lines (deterministic)
  const hatches = Array.from({ length: 8 }, (_, i) => {
    const y = h - 200 + i * 18 + (_hash(work.id + i) % 6) - 3;
    const x1 = 24 + (_hash(work.id + 'x' + i) % 30);
    const x2 = w - 24 - (_hash(work.id + 'y' + i) % 60);
    return `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${ink}" stroke-width="0.5" opacity="0.25"/>`;
  }).join('');

  const splat = Array.from({ length: 6 }, (_, i) => {
    const cx = 30 + (_hash(work.id + 'sp' + i) % (w - 60));
    const cy = 30 + (_hash(work.id + 'sq' + i) % (h - 60));
    const r = 1 + (_hash(work.id + 'sr' + i) % 3);
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${accent}" opacity="${0.15 + (_hash(work.id + 'so' + i) % 30) / 100}"/>`;
  }).join('');

  // Title — split Korean characters vertically big at top, year/category small
  const title = _esc(work.title);
  const titleEn = _esc(work.titleEn);
  const catLabel = _esc(window.NekoData.CATS[work.cat]?.ko || '');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs>
      <linearGradient id="bg-${seed}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${deep}"/>
        <stop offset="50%" stop-color="${mid}"/>
        <stop offset="100%" stop-color="${ink}"/>
      </linearGradient>
      <radialGradient id="vig-${seed}" cx="50%" cy="40%" r="80%">
        <stop offset="0%" stop-color="rgba(255,255,255,0)"/>
        <stop offset="100%" stop-color="rgba(0,0,0,0.6)"/>
      </radialGradient>
      <filter id="grain-${seed}">
        <feTurbulence baseFrequency="0.9" numOctaves="2" seed="${seed}"/>
        <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.08 0"/>
        <feComposite in2="SourceGraphic" operator="in"/>
      </filter>
    </defs>
    <!-- bg -->
    <rect width="${w}" height="${h}" fill="url(#bg-${seed})"/>
    <!-- big amber ring (editorial spot mark) -->
    <circle cx="${dotX}" cy="${dotY}" r="${48 + (seed % 30)}" fill="none" stroke="${accent}" stroke-width="1" opacity="0.4" transform="rotate(${angle} ${dotX} ${dotY})"/>
    <circle cx="${dotX}" cy="${dotY}" r="${28 + (seed % 14)}" fill="${accent}" opacity="0.18"/>
    <!-- diagonal stroke -->
    <line x1="${-20}" y1="${h * 0.55}" x2="${w + 20}" y2="${h * 0.45}" stroke="${accent}" stroke-width="1" opacity="0.25" transform="rotate(${angle * 0.2} ${w/2} ${h/2})"/>
    <!-- ink splats -->
    ${splat}
    <!-- vignette -->
    <rect width="${w}" height="${h}" fill="url(#vig-${seed})"/>
    <!-- grain -->
    <rect width="${w}" height="${h}" filter="url(#grain-${seed})" opacity="0.6"/>
    <!-- top tag — category + year -->
    <text x="22" y="34" font-family="Geist Mono, monospace" font-size="11" font-weight="600" fill="${accent}" letter-spacing="2">${catLabel.toUpperCase()} · ${work.year}</text>
    <!-- big Korean title — Pretendard Bold -->
    <text x="22" y="${h - 130}" font-family="Pretendard Variable, sans-serif" font-size="42" font-weight="700" fill="#EDEDEF" letter-spacing="-2">${title}</text>
    <!-- italic English title — Fraunces -->
    <text x="22" y="${h - 100}" font-family="Fraunces, serif" font-style="italic" font-size="15" fill="${accent}" letter-spacing="1" opacity="0.85">${titleEn}</text>
    <!-- hatch lines bottom -->
    ${hatches}
    <!-- corner number -->
    <text x="${w - 22}" y="${h - 22}" font-family="Geist Mono, monospace" font-size="10" font-weight="500" fill="${accent}" text-anchor="end" letter-spacing="2" opacity="0.6">№ ${String(_hash(work.id) % 999).padStart(3, '0')}</text>
  </svg>`;

  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

// Generate a backdrop — wider, more textural
function makeBackdrop(work, w = 780, h = 439) {
  const pal = _POSTER_PALETTES[_hash(work.id) % _POSTER_PALETTES.length];
  const [deep, mid, accent, ink] = pal;
  const seed = _hash(work.id + 's') % 999;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs>
      <linearGradient id="bd-${seed}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${deep}"/>
        <stop offset="100%" stop-color="${ink}"/>
      </linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#bd-${seed})"/>
    <circle cx="${w * 0.7}" cy="${h * 0.4}" r="160" fill="${accent}" opacity="0.25"/>
    <circle cx="${w * 0.7}" cy="${h * 0.4}" r="200" fill="none" stroke="${accent}" stroke-width="1" opacity="0.4"/>
  </svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

window.NekoMakePoster = makePoster;
window.NekoMakeBackdrop = makeBackdrop;

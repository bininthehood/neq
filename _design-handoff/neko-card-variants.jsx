// neko-card-variants.jsx — 3 Discover card variants (A/B/C)
// All variants accept the same `work` prop; only visual presentation differs.

const _OttChip = ({ ott }) => {
  const data = window.NekoData.OTTS[ott];
  if (!data) return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 22, height: 22, borderRadius: 4,
      background: data.color, color: '#fff',
      fontFamily: 'Geist Mono, monospace', fontSize: 10, fontWeight: 700,
      letterSpacing: '-0.02em',
    }}>{data.short}</span>
  );
};

const _CatChip = ({ cat }) => {
  const data = window.NekoData.CATS[cat];
  if (!data) return null;
  return (
    <span style={{
      display: 'inline-flex', padding: '4px 10px', borderRadius: 4,
      background: 'rgba(18,17,14,0.7)', backdropFilter: 'blur(8px)',
      color: data.color,
      fontFamily: 'Pretendard Variable, sans-serif', fontSize: 11, fontWeight: 600,
      border: `1px solid ${data.color}40`,
    }}>{data.ko}</span>
  );
};

const _Rating = ({ value, color = '#C4A35A' }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 3,
    fontFamily: 'Geist Mono, monospace', fontSize: 12, fontWeight: 600,
    color,
  }}>
    <svg width="11" height="11" viewBox="0 0 24 24" fill={color}>
      <path d="M12 2 L14.5 9 L22 9.3 L16 14 L18 21.5 L12 17.3 L6 21.5 L8 14 L2 9.3 L9.5 9 Z"/>
    </svg>
    {value.toFixed(1)}
  </span>
);

// ─── Variant A — Poster-led (사진 잡지 톤) ───────────────────
function CardVariantA({ work, w = 320, h = 480 }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: 16, overflow: 'hidden',
      background: '#1A1916', position: 'relative',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    }}>
      {/* full-bleed poster */}
      <img src={work.poster} alt={work.title} style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        objectFit: 'cover',
      }}/>
      {/* gradient overlay bottom */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(180deg, rgba(0,0,0,0) 50%, rgba(0,0,0,0.85) 92%, rgba(0,0,0,0.95) 100%)',
      }}/>
      {/* top row — cat + rating */}
      <div style={{
        position: 'absolute', top: 14, left: 14, right: 14,
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
      }}>
        <_CatChip cat={work.cat}/>
        <div style={{
          padding: '4px 10px', borderRadius: 4,
          background: 'rgba(18,17,14,0.7)', backdropFilter: 'blur(8px)',
        }}>
          <_Rating value={work.rating}/>
        </div>
      </div>
      {/* bottom — title + reason + otts */}
      <div style={{ position: 'absolute', left: 18, right: 18, bottom: 16, color: '#EDEDEF' }}>
        <div style={{
          fontFamily: 'Fraunces, serif', fontSize: 13, fontStyle: 'italic',
          color: '#C4A35A', letterSpacing: '0.02em', marginBottom: 6,
        }}>{work.year} · {work.titleEn}</div>
        <div style={{
          fontFamily: 'Pretendard Variable, sans-serif', fontSize: 26, fontWeight: 700,
          letterSpacing: '-0.025em', lineHeight: 1.15, marginBottom: 10,
        }}>{work.title}</div>
        <div style={{
          fontFamily: 'Pretendard Variable, sans-serif', fontSize: 13, fontWeight: 400,
          color: 'rgba(237,237,239,0.85)', lineHeight: 1.4, marginBottom: 12,
          maxWidth: '85%',
        }}>{work.reason}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {work.otts.map(o => <_OttChip key={o} ott={o}/>)}
        </div>
      </div>
    </div>
  );
}

// ─── Variant B — Typography-led (제목·이유가 위계 상위) ──────
function CardVariantB({ work, w = 320, h = 480 }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: 16, overflow: 'hidden',
      background: '#1A1916', position: 'relative',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* small poster strip on top */}
      <div style={{ position: 'relative', height: 200, overflow: 'hidden' }}>
        <img src={work.poster} alt={work.title} style={{
          width: '100%', height: '100%', objectFit: 'cover', filter: 'saturate(0.85)',
        }}/>
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, rgba(26,25,22,0) 60%, #1A1916 100%)',
        }}/>
        {/* tiny meta over poster */}
        <div style={{ position: 'absolute', top: 12, left: 14 }}>
          <_CatChip cat={work.cat}/>
        </div>
        <div style={{ position: 'absolute', top: 14, right: 14 }}>
          <_Rating value={work.rating}/>
        </div>
      </div>
      {/* big typography block */}
      <div style={{ flex: 1, padding: '14px 22px 22px', display: 'flex', flexDirection: 'column' }}>
        {/* italic Fraunces year + en */}
        <div style={{
          fontFamily: 'Fraunces, serif', fontSize: 12, fontStyle: 'italic',
          color: '#8E8F9A', letterSpacing: '0.04em',
          textTransform: 'uppercase', marginBottom: 8,
        }}>
          {work.titleEn} · {work.year}
        </div>
        {/* title — display Fraunces */}
        <div style={{
          fontFamily: 'Pretendard Variable, sans-serif', fontSize: 32, fontWeight: 700,
          letterSpacing: '-0.03em', lineHeight: 1.05, color: '#EDEDEF',
          marginBottom: 14,
        }}>{work.title}</div>
        {/* pull quote — reason in serif italic */}
        <div style={{
          fontFamily: 'Fraunces, Pretendard Variable, serif',
          fontSize: 17, fontStyle: 'italic', fontWeight: 400,
          letterSpacing: '-0.01em', lineHeight: 1.4, color: '#C4A35A',
          paddingLeft: 12, borderLeft: '2px solid #C4A35A',
          marginBottom: 'auto',
        }}>"{work.reason}"</div>
        {/* bottom row — otts + dot meta */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: 16, paddingTop: 12, borderTop: '1px solid #2E2D27',
        }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {work.otts.map(o => <_OttChip key={o} ott={o}/>)}
          </div>
          <div style={{
            fontFamily: 'Geist Mono, monospace', fontSize: 10, color: '#6B6C75',
            letterSpacing: '0.05em',
          }}>
            {work.runtime ? `${work.runtime}분` : `시즌 ${work.seasons}`}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Variant C — Cinematic (어두운 백드롭 + 영화관) ──────────
function CardVariantC({ work, w = 320, h = 480 }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: 16, overflow: 'hidden',
      background: '#0B0A07', position: 'relative',
      boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
    }}>
      {/* backdrop image — heavy darkening */}
      <img src={work.backdrop || work.poster} alt={work.title} style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        objectFit: 'cover', filter: 'brightness(0.35) saturate(0.6) contrast(1.1)',
      }}/>
      {/* film grain overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)',
        backgroundSize: '3px 3px', mixBlendMode: 'overlay', pointerEvents: 'none',
      }}/>
      {/* vignette */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 30%, rgba(0,0,0,0.6) 100%)',
      }}/>
      {/* center poster — small & framed */}
      <div style={{
        position: 'absolute', top: '42%', left: '50%',
        transform: 'translate(-50%, -50%)', width: 152, height: 228,
        boxShadow: '0 20px 50px rgba(0,0,0,0.8), 0 0 0 1px rgba(196,163,90,0.2)',
        borderRadius: 4, overflow: 'hidden',
      }}>
        <img src={work.poster} alt={work.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
        {/* mask the poster's baked-in title bar so it doesn't clash with the card's title */}
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, height: '38%',
          background: 'linear-gradient(to bottom, transparent 0%, rgba(11,10,7,0.4) 35%, rgba(11,10,7,0.95) 100%)',
          pointerEvents: 'none',
        }}/>
      </div>
      {/* top — cat + rating */}
      <div style={{
        position: 'absolute', top: 16, left: 18, right: 18,
        display: 'flex', justifyContent: 'space-between',
      }}>
        <_CatChip cat={work.cat}/>
        <div style={{
          padding: '4px 10px', borderRadius: 4,
          background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(196,163,90,0.3)',
        }}>
          <_Rating value={work.rating}/>
        </div>
      </div>
      {/* bottom — caption block, marquee feel */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 18, textAlign: 'center' }}>
        <div style={{
          fontFamily: 'Fraunces, serif', fontSize: 11, fontStyle: 'italic',
          color: '#C4A35A', letterSpacing: '0.18em', textTransform: 'uppercase',
          marginBottom: 6,
        }}>— Now Showing —</div>
        <div style={{
          fontFamily: 'Pretendard Variable, sans-serif', fontSize: 22, fontWeight: 700,
          color: '#EDEDEF', letterSpacing: '-0.02em', marginBottom: 6,
        }}>{work.title}</div>
        <div style={{
          fontFamily: 'Pretendard Variable, sans-serif', fontSize: 12,
          color: 'rgba(237,237,239,0.7)', marginBottom: 12, fontStyle: 'italic',
        }}>{work.reason}</div>
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 10, alignItems: 'center',
          fontFamily: 'Geist Mono, monospace', fontSize: 10, color: '#8E8F9A',
          letterSpacing: '0.08em',
        }}>
          <span>{work.year}</span>
          <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#C4A35A' }}/>
          <span>{work.runtime ? `${work.runtime}MIN` : `S${work.seasons}`}</span>
          <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#C4A35A' }}/>
          <div style={{ display: 'flex', gap: 4 }}>
            {work.otts.map(o => <_OttChip key={o} ott={o}/>)}
          </div>
        </div>
      </div>
    </div>
  );
}

window.NekoCards = { A: CardVariantA, B: CardVariantB, C: CardVariantC };

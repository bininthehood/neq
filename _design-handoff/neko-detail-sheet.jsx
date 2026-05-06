// neko-detail-sheet.jsx — Apple Music–style hero morph detail sheet
// 3 variants: standard / minimal-thumb / blur-bg

const DT_COLORS = {
  bg: '#0B0A07',
  surface: '#12110E',
  surface2: '#1A1812',
  ink: '#EDEDEF',
  inkDim: '#8E8F9A',
  inkMute: '#6B6C75',
  hair: '#2A2823',
  amber: '#C4A35A',
  amberDim: 'rgba(196,163,90,0.15)',
};

// ───────────────────────────────────────────────────────────
// Helper: OTT chip
// ───────────────────────────────────────────────────────────
function OTTChip({ ott }) {
  const o = window.NekoData.OTTS[ott];
  if (!o) return null;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '6px 10px', borderRadius: 6,
      background: 'rgba(255,255,255,0.04)',
      border: `1px solid ${DT_COLORS.hair}`,
      fontFamily: 'Pretendard Variable', fontSize: 11, color: DT_COLORS.ink,
    }}>
      <div style={{ width: 14, height: 14, borderRadius: 3, background: o.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 8, fontWeight: 700 }}>{o.short}</div>
      <span>{o.name}</span>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Hero — A: large hero (default standard)
// ───────────────────────────────────────────────────────────
function HeroLarge({ work, scrollY, onClose }) {
  // parallax-ish: hero shrinks slightly as scroll increases
  const scale = 1 - Math.min(scrollY / 800, 0.08);
  const opacity = 1 - Math.min(scrollY / 400, 0.3);
  return (
    <div style={{
      width: '100%', aspectRatio: '3/4',
      position: 'relative', overflow: 'hidden',
      background: DT_COLORS.surface,
    }}>
      <img src={work.poster} alt="" style={{
        width: '100%', height: '100%', objectFit: 'cover',
        transform: `scale(${scale})`, opacity,
        transition: 'transform 0.3s ease-out, opacity 0.3s ease-out',
      }}/>
      {/* gradient bottom for legibility */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `linear-gradient(to bottom, transparent 40%, ${DT_COLORS.bg} 100%)`,
        pointerEvents: 'none',
      }}/>
      {/* close button */}
      <div style={{
        position: 'absolute', top: 14, right: 14,
        width: 32, height: 32, borderRadius: 16,
        background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: 18, cursor: 'pointer',
      }} onClick={onClose}>×</div>
      {/* №xxx mark */}
      <div style={{
        position: 'absolute', top: 18, left: 18,
        fontFamily: 'Geist Mono, ui-monospace, monospace',
        fontSize: 9, color: 'rgba(255,255,255,0.6)',
        letterSpacing: '0.08em',
      }}>№ {String(work.id.slice(0,6)).padStart(3,'0')}</div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Hero — B: blur background + small thumb (variant)
// ───────────────────────────────────────────────────────────
function HeroBlur({ work, onClose }) {
  return (
    <div style={{
      width: '100%', height: 320,
      position: 'relative', overflow: 'hidden',
      background: DT_COLORS.surface,
    }}>
      <img src={work.poster} alt="" style={{
        position: 'absolute', inset: -20,
        width: 'calc(100% + 40px)', height: 'calc(100% + 40px)',
        objectFit: 'cover',
        filter: 'blur(28px) saturate(1.1)',
        transform: 'scale(1.15)',
        opacity: 0.6,
      }}/>
      <div style={{
        position: 'absolute', inset: 0,
        background: `linear-gradient(to bottom, rgba(11,10,7,0.3) 0%, ${DT_COLORS.bg} 100%)`,
      }}/>
      {/* close */}
      <div style={{
        position: 'absolute', top: 14, right: 14,
        width: 32, height: 32, borderRadius: 16,
        background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: 18, cursor: 'pointer', zIndex: 2,
      }} onClick={onClose}>×</div>
      {/* small thumb floating bottom */}
      <div style={{
        position: 'absolute', bottom: 24, left: 24,
        width: 100, height: 140, borderRadius: 6, overflow: 'hidden',
        boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
        zIndex: 2,
      }}>
        <img src={work.poster} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Section header
// ───────────────────────────────────────────────────────────
function Section({ label, children, dense }) {
  return (
    <div style={{ padding: dense ? '16px 22px' : '24px 22px', borderTop: `1px solid ${DT_COLORS.hair}` }}>
      <div style={{
        fontFamily: 'Geist Mono, ui-monospace, monospace',
        fontSize: 10, color: DT_COLORS.amber,
        letterSpacing: '0.12em', textTransform: 'uppercase',
        marginBottom: 12,
      }}>{label}</div>
      {children}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Watch history visualizations
// ───────────────────────────────────────────────────────────
function WatchHistoryCalendar({ history }) {
  // 12-week grid (84 cells), each cell ≈ a day
  const cells = Array.from({ length: 84 }, (_, i) => {
    const intensity = history.includes(i) ? 1 : (Math.random() < 0.06 ? 0.4 : 0);
    return intensity;
  });
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 4, marginBottom: 10 }}>
        {cells.map((v, i) => (
          <div key={i} style={{
            aspectRatio: '1', borderRadius: 2,
            background: v > 0 ? `rgba(196,163,90,${v})` : 'rgba(255,255,255,0.04)',
            border: v >= 1 ? `1px solid ${DT_COLORS.amber}` : 'none',
          }}/>
        ))}
      </div>
      <div style={{ fontFamily: 'Pretendard Variable', fontSize: 11, color: DT_COLORS.inkMute }}>
        지난 12주 · <span style={{ color: DT_COLORS.amber }}>3회</span> 시청
      </div>
    </div>
  );
}

function WatchHistoryTimeline({ entries }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {entries.map((e, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{
            width: 6, height: 6, borderRadius: 3, marginTop: 6, flexShrink: 0,
            background: e.complete ? DT_COLORS.amber : DT_COLORS.inkMute,
          }}/>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'Pretendard Variable', fontSize: 12, color: DT_COLORS.ink, fontWeight: 500 }}>{e.label}</div>
            <div style={{ fontFamily: 'Geist Mono, ui-monospace, monospace', fontSize: 10, color: DT_COLORS.inkMute, marginTop: 2 }}>{e.date}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Cast row
// ───────────────────────────────────────────────────────────
function CastRow({ cast }) {
  return (
    <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4, marginRight: -22 }}>
      {cast.map((name, i) => (
        <div key={i} style={{ flexShrink: 0, width: 64, textAlign: 'center' }}>
          <div style={{
            width: 64, height: 64, borderRadius: 32,
            background: `linear-gradient(135deg, hsl(${(i*47)%360},22%,28%), hsl(${(i*47+90)%360},20%,18%))`,
            border: `1px solid ${DT_COLORS.hair}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Fraunces, serif', fontStyle: 'italic',
            fontSize: 22, color: DT_COLORS.amber,
            marginBottom: 6,
          }}>{name.charAt(0)}</div>
          <div style={{ fontFamily: 'Pretendard Variable', fontSize: 10, color: DT_COLORS.ink, fontWeight: 500, lineHeight: 1.2 }}>{name}</div>
        </div>
      ))}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Similar works strip
// ───────────────────────────────────────────────────────────
function SimilarStrip({ works }) {
  return (
    <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4, marginRight: -22 }}>
      {works.map(w => (
        <div key={w.id} style={{ flexShrink: 0, width: 90 }}>
          <div style={{
            width: 90, height: 132, borderRadius: 4, overflow: 'hidden',
            border: `1px solid ${DT_COLORS.hair}`, marginBottom: 6,
          }}>
            <img src={w.poster} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
          </div>
          <div style={{ fontFamily: 'Pretendard Variable', fontSize: 10, color: DT_COLORS.ink, lineHeight: 1.2, fontWeight: 500 }}>{w.title}</div>
          <div style={{ fontFamily: 'Geist Mono, ui-monospace, monospace', fontSize: 9, color: DT_COLORS.inkMute, marginTop: 2 }}>{w.year}</div>
        </div>
      ))}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Detail sheet — composable
// variant: { hero: 'large'|'blur', history: 'calendar'|'timeline'|'hidden', save: 'top'|'fab'|'inline' }
// ───────────────────────────────────────────────────────────
function NekoDetailSheet({ workId = 'past-lives', variant = {}, onClose }) {
  const v = { hero: 'large', history: 'calendar', save: 'top', ...variant };
  const work = window.NekoData.WORKS.find(w => w.id === workId) || window.NekoData.WORKS[0];
  const cat = window.NekoData.CATS[work.cat];

  const [scrollY, setScrollY] = React.useState(0);
  const [saved, setSaved] = React.useState(true);
  const scrollRef = React.useRef(null);

  // mock similar works (other 4 from same category)
  const similar = window.NekoData.WORKS.filter(w => w.id !== work.id && w.cat === work.cat).slice(0, 6);

  // mock watch history
  const calendarHistory = [3, 14, 47];
  const timelineEntries = [
    { date: '2024.11.14', label: '시청 완료 · 138분', complete: true },
    { date: '2024.11.10', label: 'Saved', complete: false },
    { date: '2024.11.10', label: 'Discover에서 발견', complete: false },
  ];

  const onScroll = (e) => setScrollY(e.target.scrollTop);

  return (
    <div style={{
      width: '100%', height: '100%',
      background: DT_COLORS.bg,
      position: 'relative',
      overflow: 'hidden',
      borderRadius: 'inherit',
    }}>
      {/* Top nav (sticky over hero) */}
      {v.save === 'top' && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
          padding: '14px 16px',
          display: 'flex', justifyContent: 'flex-end', gap: 8,
          background: scrollY > 200 ? 'rgba(11,10,7,0.92)' : 'transparent',
          backdropFilter: scrollY > 200 ? 'blur(20px)' : 'none',
          transition: 'background 0.2s, backdrop-filter 0.2s',
          pointerEvents: 'none',
        }}>
          <div onClick={() => setSaved(!saved)} style={{
            pointerEvents: 'auto',
            padding: '8px 14px', borderRadius: 18,
            background: saved ? DT_COLORS.amber : 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(10px)',
            color: saved ? DT_COLORS.bg : '#fff',
            fontFamily: 'Pretendard Variable', fontSize: 12, fontWeight: 600,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ fontSize: 14 }}>{saved ? '✓' : '+'}</span>
            <span>{saved ? 'Saved' : 'Save'}</span>
          </div>
        </div>
      )}

      {/* Scroll body */}
      <div ref={scrollRef} onScroll={onScroll} style={{
        width: '100%', height: '100%', overflowY: 'auto',
        scrollbarWidth: 'none',
      }}>
        <style>{`div::-webkit-scrollbar { display: none; }`}</style>

        {/* Hero */}
        {v.hero === 'large' ? <HeroLarge work={work} scrollY={scrollY} onClose={onClose}/> : <HeroBlur work={work} onClose={onClose}/>}

        {/* Title block */}
        <div style={{
          padding: v.hero === 'blur' ? '0 22px 24px 140px' : '24px 22px 18px',
          marginTop: v.hero === 'blur' ? -120 : 0,
          position: 'relative', zIndex: 2,
        }}>
          <div style={{
            display: 'inline-block', padding: '3px 8px',
            background: DT_COLORS.amberDim, color: DT_COLORS.amber,
            fontFamily: 'Geist Mono, ui-monospace, monospace', fontSize: 9,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            borderRadius: 3, marginBottom: 12,
          }}>{cat.en} · {work.year}</div>
          <h1 style={{
            margin: 0,
            fontFamily: 'Pretendard Variable', fontSize: 26, fontWeight: 700,
            color: DT_COLORS.ink, lineHeight: 1.15, letterSpacing: '-0.02em',
          }}>{work.title}</h1>
          <div style={{
            fontFamily: 'Fraunces, serif', fontStyle: 'italic',
            fontSize: 15, color: DT_COLORS.inkDim,
            marginTop: 4, letterSpacing: '-0.01em',
          }}>{work.titleEn}</div>

          {/* meta row */}
          <div style={{
            display: 'flex', gap: 12, marginTop: 14,
            fontFamily: 'Geist Mono, ui-monospace, monospace', fontSize: 11,
            color: DT_COLORS.inkDim,
          }}>
            <span>★ {work.rating}</span>
            <span>·</span>
            <span>{work.runtime ? `${work.runtime}분` : `${work.seasons}시즌`}</span>
            <span>·</span>
            <span>{work.director}</span>
          </div>

          {/* inline save button */}
          {v.save === 'inline' && (
            <button onClick={() => setSaved(!saved)} style={{
              marginTop: 16, width: '100%',
              padding: '13px 16px', borderRadius: 8,
              background: saved ? DT_COLORS.amber : 'transparent',
              border: saved ? 'none' : `1px solid ${DT_COLORS.hair}`,
              color: saved ? DT_COLORS.bg : DT_COLORS.ink,
              fontFamily: 'Pretendard Variable', fontSize: 13, fontWeight: 600,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              <span>{saved ? '✓' : '+'}</span>
              <span>{saved ? '저장됨' : '저장'}</span>
            </button>
          )}
        </div>

        {/* Synopsis */}
        <Section label="Synopsis · 시놉시스">
          <div style={{
            fontFamily: 'Pretendard Variable', fontSize: 13, color: DT_COLORS.ink,
            lineHeight: 1.7, letterSpacing: '-0.005em',
          }}>{work.overview}</div>
          {work.reason && (
            <div style={{
              marginTop: 14, padding: '10px 12px',
              borderLeft: `2px solid ${DT_COLORS.amber}`,
              background: DT_COLORS.amberDim,
              fontFamily: 'Fraunces, serif', fontStyle: 'italic',
              fontSize: 13, color: DT_COLORS.ink, lineHeight: 1.5,
            }}>"{work.reason}"</div>
          )}
        </Section>

        {/* Cast */}
        <Section label="Cast · 캐스트">
          <CastRow cast={[work.director, ...work.cast].slice(0, 6)}/>
        </Section>

        {/* OTT */}
        <Section label="Where to watch · OTT">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {work.otts.map(o => <OTTChip key={o} ott={o}/>)}
          </div>
        </Section>

        {/* Watch history (variant-controlled) */}
        {v.history === 'calendar' && (
          <Section label="Your record · 감상 기록">
            <WatchHistoryCalendar history={calendarHistory}/>
          </Section>
        )}
        {v.history === 'timeline' && (
          <Section label="Your record · 감상 기록">
            <WatchHistoryTimeline entries={timelineEntries}/>
          </Section>
        )}

        {/* Similar */}
        <Section label="Similar · 비슷한 작품">
          <SimilarStrip works={similar}/>
        </Section>

        {/* bottom spacer for FAB */}
        <div style={{ height: v.save === 'fab' ? 100 : 32 }}/>
      </div>

      {/* FAB save button */}
      {v.save === 'fab' && (
        <div style={{
          position: 'absolute', bottom: 20, left: 22, right: 22,
          zIndex: 10, pointerEvents: 'none',
        }}>
          <button onClick={() => setSaved(!saved)} style={{
            pointerEvents: 'auto',
            width: '100%', padding: '15px 16px', borderRadius: 12,
            background: saved ? DT_COLORS.amber : DT_COLORS.surface2,
            border: saved ? 'none' : `1px solid ${DT_COLORS.hair}`,
            backdropFilter: 'blur(20px)',
            color: saved ? DT_COLORS.bg : DT_COLORS.ink,
            fontFamily: 'Pretendard Variable', fontSize: 14, fontWeight: 600,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}>
            <span style={{ fontSize: 16 }}>{saved ? '✓' : '+'}</span>
            <span>{saved ? '저장됨 — 탭해서 해제' : '저장하기'}</span>
          </button>
        </div>
      )}
    </div>
  );
}

window.NekoDetailSheet = NekoDetailSheet;

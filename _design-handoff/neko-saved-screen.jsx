// neko-saved-screen.jsx — Saved screen with OTT grouping
const { useState: useStateSv } = React;

function PosterMini({ work, watched }) {
  return (
    <div style={{ width: 120, flexShrink: 0, position: 'relative', cursor: 'pointer' }}>
      <div style={{
        width: 120, height: 180, borderRadius: 8, overflow: 'hidden',
        position: 'relative',
        boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
      }}>
        <img src={work.poster} alt={work.title} style={{
          width: '100%', height: '100%', objectFit: 'cover',
          filter: watched ? 'grayscale(0.5) brightness(0.65)' : 'none',
        }}/>
        {watched && (
          <div style={{
            position: 'absolute', top: 8, right: 8,
            padding: '3px 7px', borderRadius: 3,
            background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
            fontFamily: 'Pretendard Variable', fontSize: 10, fontWeight: 600,
            color: '#EDEDEF',
          }}>봤어요</div>
        )}
        {work.isNew && !watched && (
          <div style={{
            position: 'absolute', top: 8, left: 8,
            padding: '3px 7px', borderRadius: 3,
            background: '#C4A35A', color: '#12110E',
            fontFamily: 'Pretendard Variable', fontSize: 10, fontWeight: 700,
            letterSpacing: '-0.01em',
          }}>NEW</div>
        )}
      </div>
      <div style={{
        marginTop: 8,
        fontFamily: 'Pretendard Variable, sans-serif', fontSize: 13, fontWeight: 600,
        color: '#EDEDEF', letterSpacing: '-0.01em', lineHeight: 1.3,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{work.title}</div>
      <div style={{
        marginTop: 2, fontFamily: 'Geist Mono, monospace', fontSize: 10,
        color: '#6B6C75', letterSpacing: '0.02em',
      }}>
        {work.savedDaysAgo === 0 ? '오늘 저장' : `${work.savedDaysAgo}일 전 저장`}
      </div>
    </div>
  );
}

function OttGroup({ ottId, works }) {
  const ott = window.NekoData.OTTS[ottId];
  if (!ott || works.length === 0) return null;
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 10,
        padding: '0 20px', marginBottom: 14,
      }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 28, height: 28, borderRadius: 6,
          background: ott.color, color: '#fff',
          fontFamily: 'Geist Mono, monospace', fontSize: 12, fontWeight: 700,
        }}>{ott.short}</span>
        <span style={{
          fontFamily: 'Fraunces, serif', fontSize: 22, fontWeight: 500,
          color: '#EDEDEF', letterSpacing: '-0.01em',
        }}>{ott.name}</span>
        <span style={{
          fontFamily: 'Geist Mono, monospace', fontSize: 11, color: '#8E8F9A',
          letterSpacing: '0.05em',
        }}>· {works.length}개</span>
      </div>
      <div style={{
        display: 'flex', gap: 12, padding: '0 20px',
        overflowX: 'auto', overflowY: 'hidden',
        scrollbarWidth: 'none',
      }}>
        {works.map(w => <PosterMini key={w.id} work={w} watched={w.watched}/>)}
      </div>
    </div>
  );
}

function SavedScreen({ filterEmpty = false }) {
  const [filter, setFilter] = useStateSv('all'); // all / unwatched / watched
  const [groupMode, setGroupMode] = useStateSv('mood'); // Round 1: default = mood
  const works = window.NekoData.WORKS;

  let filtered = works;
  if (filterEmpty) filtered = [];
  else if (filter === 'unwatched') filtered = works.filter(w => !w.watched);
  else if (filter === 'watched')   filtered = works.filter(w => w.watched);

  // ── Mood mapping (Round 1) ─────────────────────────────
  // genres → mood bucket
  function moodOf(work) {
    const g = (work.genres || []).join(' ');
    if (/스릴러|미스터리|범죄|느와르/.test(g)) return 'thrill';
    if (/액션|블록버스터/.test(g)) return 'action';
    if (/로맨스|멜로|연애/.test(g)) return 'tender';
    if (/코미디|예능|블랙코미디/.test(g)) return 'lighten';
    if (/다큐|시사/.test(g)) return 'reflect';
    return 'slow'; // 드라마/그 외 → 잔잔한 음미
  }
  const MOOD_META = {
    slow:    { ko: '천천히 음미하는',   en: 'Slow & Savory',  hint: '쉬는 날, 한 잔 곁들여' },
    tender:  { ko: '잔잔한 위로',        en: 'Quiet Comfort',   hint: '울적한 저녁의 동반자' },
    thrill:  { ko: '짜릿한 긴장',        en: 'On the Edge',     hint: '잠 안 오는 새벽에' },
    action:  { ko: '에너지가 필요할 때', en: 'Pulse Up',        hint: '운동 끝나고 한 편' },
    lighten: { ko: '가볍게 웃고 싶을 때',en: 'Levity',          hint: '머리 비우는 30분' },
    reflect: { ko: '세상을 들여다볼 때', en: 'Lens on World',   hint: '화제가 필요할 때' },
  };
  const MOOD_ORDER = ['slow', 'tender', 'thrill', 'action', 'lighten', 'reflect'];

  // ── Calendar bucketing ─────────────────────────────────
  function calOf(d) {
    if (d <= 7) return 'thisweek';
    if (d <= 30) return 'thismonth';
    return 'older';
  }
  const CAL_META = {
    thisweek:  { ko: '이번 주 저장',   en: 'This Week' },
    thismonth: { ko: '지난 한 달',      en: 'This Month' },
    older:     { ko: '오래 전부터',     en: 'A While Ago' },
  };
  const CAL_ORDER = ['thisweek', 'thismonth', 'older'];

  // ── OTT bucketing ──────────────────────────────────────
  const ottOrder = ['netflix', 'tving', 'wavve', 'watcha', 'disney'];

  // ── Derive groups by mode ──────────────────────────────
  const groups = {};
  if (groupMode === 'mood') {
    filtered.forEach(w => {
      const k = moodOf(w);
      if (!groups[k]) groups[k] = [];
      groups[k].push(w);
    });
  } else if (groupMode === 'ott') {
    filtered.forEach(w => {
      const k = w.otts[0];
      if (!groups[k]) groups[k] = [];
      groups[k].push(w);
    });
  } else if (groupMode === 'calendar') {
    filtered.forEach(w => {
      const k = calOf(w.savedDaysAgo || 0);
      if (!groups[k]) groups[k] = [];
      groups[k].push(w);
    });
  } else {
    // default: single group, saved order
    groups.all = [...filtered].sort((a,b) => (a.savedDaysAgo||0) - (b.savedDaysAgo||0));
  }

  return (
    <div style={{
      width: '100%', height: '100%', background: '#12110E',
      overflow: 'auto', color: '#EDEDEF',
      paddingBottom: 80,
    }}>
      {/* Header */}
      <div style={{ padding: '20px 20px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <div style={{
            fontFamily: 'Fraunces, serif', fontSize: 40, fontWeight: 500,
            letterSpacing: '-0.025em', color: '#EDEDEF',
          }}>Saved</div>
          <div style={{ fontFamily: 'Pretendard Variable', fontSize: 12, color: '#6B6C75', marginTop: 2 }}>
            저장 {filtered.length}편 · 오늘 그 중 어떤 게 끌려요?
          </div>
        </div>
      </div>

      {/* Grouping segmented control — Round 1 default = Mood */}
      <div style={{
        display: 'flex', gap: 4, padding: '14px 20px 8px',
        overflowX: 'auto', scrollbarWidth: 'none',
      }}>
        {[
          { id: 'mood',     label: 'Mood' },
          { id: 'ott',      label: 'OTT별' },
          { id: 'calendar', label: '저장 시점' },
          { id: 'default',  label: '저장순' },
        ].map(g => (
          <button key={g.id} onClick={() => setGroupMode(g.id)} style={{
            padding: '7px 12px', borderRadius: 8,
            background: groupMode === g.id ? 'rgba(196,163,90,0.15)' : 'transparent',
            color: groupMode === g.id ? '#C4A35A' : '#8E8F9A',
            border: `1px solid ${groupMode === g.id ? 'rgba(196,163,90,0.35)' : '#2E2D27'}`,
            fontFamily: 'Pretendard Variable', fontSize: 12, fontWeight: 600,
            letterSpacing: '-0.01em', cursor: 'pointer', whiteSpace: 'nowrap',
          }}>{g.label}</button>
        ))}
      </div>

      {/* Filter chips */}
      <div style={{
        display: 'flex', gap: 6, padding: '6px 20px 18px',
        overflowX: 'auto', scrollbarWidth: 'none',
      }}>
        {[
          { id: 'all', label: '전체' },
          { id: 'unwatched', label: '안 본 작품' },
          { id: 'watched', label: '시청 완료' },
        ].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} style={{
            padding: '6px 12px', borderRadius: 999,
            background: filter === f.id ? '#C4A35A' : 'transparent',
            color: filter === f.id ? '#12110E' : '#8E8F9A',
            border: `1px solid ${filter === f.id ? '#C4A35A' : '#2E2D27'}`,
            fontFamily: 'Pretendard Variable', fontSize: 12, fontWeight: 500,
            letterSpacing: '-0.01em', cursor: 'pointer', whiteSpace: 'nowrap',
          }}>{f.label}</button>
        ))}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <div style={{ marginBottom: 16 }}>
            <window.NekoIllust name={filterEmpty ? 'noResults' : 'emptySaved'} style="auto" size={180}/>
          </div>
          <div style={{ fontFamily: 'Fraunces, serif', fontStyle: 'italic', fontSize: 22, color: '#EDEDEF', marginBottom: 8 }}>
            {filterEmpty ? '이 조건엔 아무것도' : '책장이 비어 있어요'}
          </div>
          <div style={{ fontFamily: 'Pretendard Variable', fontSize: 13, color: '#8E8F9A', lineHeight: 1.5, whiteSpace: 'pre-line' }}>
            {filterEmpty ? '필터를 조금만 느슨해 보세요' : 'Discover에서 마음에 드는 걸\n하나씩 담아 보세요'}
          </div>
        </div>
      )}

      {/* Groups by mode */}
      {filtered.length > 0 && groupMode === 'mood' && MOOD_ORDER.map(k => groups[k] && (
        <MoodGroup key={k} meta={MOOD_META[k]} works={groups[k]}/>
      ))}
      {filtered.length > 0 && groupMode === 'ott' && ottOrder.map(o => groups[o] && (
        <OttGroup key={o} ottId={o} works={groups[o]}/>
      ))}
      {filtered.length > 0 && groupMode === 'calendar' && CAL_ORDER.map(k => groups[k] && (
        <CalGroup key={k} meta={CAL_META[k]} works={groups[k]}/>
      ))}
      {filtered.length > 0 && groupMode === 'default' && (
        <DefaultGroup works={groups.all}/>
      )}
    </div>
  );
}

// ── Mood group renderer (Round 1) ─────────────────────
function MoodGroup({ meta, works }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ padding: '0 20px', marginBottom: 14 }}>
        <div style={{
          fontFamily: 'Geist Mono, monospace', fontSize: 9,
          color: '#C4A35A', letterSpacing: '0.18em',
          textTransform: 'uppercase', marginBottom: 4,
        }}>{meta.en} · {works.length}편</div>
        <div style={{
          fontFamily: 'Fraunces, serif', fontStyle: 'italic',
          fontSize: 22, color: '#EDEDEF', letterSpacing: '-0.015em',
          lineHeight: 1.2,
        }}>{meta.ko}</div>
        <div style={{
          fontFamily: 'Pretendard Variable', fontSize: 11.5, color: '#6B6C75',
          marginTop: 3,
        }}>— {meta.hint}</div>
      </div>
      <div style={{
        display: 'flex', gap: 12, padding: '0 20px',
        overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'none',
      }}>
        {works.map(w => <PosterMini key={w.id} work={w} watched={w.watched}/>)}
      </div>
    </div>
  );
}
function CalGroup({ meta, works }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ padding: '0 20px', marginBottom: 14 }}>
        <div style={{
          fontFamily: 'Geist Mono, monospace', fontSize: 9,
          color: '#C4A35A', letterSpacing: '0.18em',
          textTransform: 'uppercase', marginBottom: 4,
        }}>{meta.en} · {works.length}편</div>
        <div style={{
          fontFamily: 'Fraunces, serif', fontStyle: 'italic',
          fontSize: 22, color: '#EDEDEF', letterSpacing: '-0.015em',
        }}>{meta.ko}</div>
      </div>
      <div style={{
        display: 'flex', gap: 12, padding: '0 20px',
        overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'none',
      }}>
        {works.map(w => <PosterMini key={w.id} work={w} watched={w.watched}/>)}
      </div>
    </div>
  );
}
function DefaultGroup({ works }) {
  return (
    <div style={{ padding: '0 20px' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 14,
      }}>
        {works.map(w => <PosterMini key={w.id} work={w} watched={w.watched}/>)}
      </div>
    </div>
  );
}

window.NekoSavedScreen = SavedScreen;

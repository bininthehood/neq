// neko-search-screen.jsx — Search with grouping, voice, recent
// 2 variants: classic (단순 결과) / grouped (작품/배우/감독 섹션 분리)

const SC_COLORS = {
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

const RECENT_QUERIES = ['박찬욱', '느릿한 영화', '이정재', '해외 시리즈', '주말'];
const TRENDING = ['듄: 파트2', '셀린 송', '범죄 시리즈', '봉준호', '오자크'];

// Mock people
const PEOPLE = {
  '박찬욱':   { name: '박찬욱',   role: '감독', works: ['헤어질 결심', '올드보이'] },
  '봉준호':   { name: '봉준호',   role: '감독', works: ['기생충'] },
  '이정재':   { name: '이정재',   role: '배우', works: ['오징어 게임'] },
  '탕웨이':   { name: '탕웨이',   role: '배우', works: ['헤어질 결심'] },
  '셀린 송':  { name: '셀린 송',  role: '감독', works: ['패스트 라이브즈'] },
};

// ──────────────────────────────────────────────────────────
// Search bar (entry / focused state)
// ──────────────────────────────────────────────────────────
function SearchBar({ value, onChange, onFocus, focused, listening, onMic }) {
  return (
    <div style={{
      margin: '8px 16px 14px',
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '11px 14px',
      background: focused ? SC_COLORS.surface2 : SC_COLORS.surface,
      border: `1px solid ${focused ? SC_COLORS.amberDim : SC_COLORS.hair}`,
      borderRadius: 10,
      transition: 'background 0.15s, border-color 0.15s',
    }}>
      {/* search glyph */}
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="6" cy="6" r="4.5" stroke={SC_COLORS.inkDim} strokeWidth="1.4"/>
        <path d="M9.5 9.5L13 13" stroke={SC_COLORS.inkDim} strokeWidth="1.4" strokeLinecap="round"/>
      </svg>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={onFocus}
        placeholder="작품, 배우, 감독, 장르"
        style={{
          flex: 1, background: 'transparent', border: 'none', outline: 'none',
          fontFamily: 'Pretendard Variable', fontSize: 14, color: SC_COLORS.ink,
        }}
      />
      {value && (
        <div onClick={() => onChange('')} style={{
          width: 18, height: 18, borderRadius: 9, cursor: 'pointer',
          background: SC_COLORS.inkMute, color: SC_COLORS.bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, lineHeight: 1,
        }}>×</div>
      )}
      <div onClick={onMic} style={{
        width: 26, height: 26, borderRadius: 13, cursor: 'pointer',
        background: listening ? SC_COLORS.amber : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.15s',
      }}>
        <svg width="12" height="14" viewBox="0 0 12 14" fill="none">
          <rect x="3" y="0.5" width="6" height="9" rx="3" stroke={listening ? SC_COLORS.bg : SC_COLORS.inkDim} strokeWidth="1.4" fill={listening ? SC_COLORS.bg : 'none'}/>
          <path d="M1 7C1 9.76142 3.23858 12 6 12V13.5M11 7C11 9.76142 8.76142 12 6 12" stroke={listening ? SC_COLORS.bg : SC_COLORS.inkDim} strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Chip (recent / trending)
// ──────────────────────────────────────────────────────────
function Chip({ children, onClick, mono, accent }) {
  return (
    <div onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '7px 12px',
      background: accent ? SC_COLORS.amberDim : SC_COLORS.surface,
      border: `1px solid ${accent ? SC_COLORS.amberDim : SC_COLORS.hair}`,
      borderRadius: 16,
      fontFamily: mono ? 'Geist Mono, ui-monospace, monospace' : 'Pretendard Variable',
      fontSize: mono ? 10 : 12,
      color: accent ? SC_COLORS.amber : SC_COLORS.ink,
      cursor: 'pointer',
      letterSpacing: mono ? '0.05em' : 'normal',
    }}>{children}</div>
  );
}

// ──────────────────────────────────────────────────────────
// Section heading inside results
// ──────────────────────────────────────────────────────────
function SectionHead({ label, count }) {
  return (
    <div style={{
      padding: '14px 20px 10px',
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
    }}>
      <div style={{
        fontFamily: 'Geist Mono, ui-monospace, monospace',
        fontSize: 10, color: SC_COLORS.amber,
        letterSpacing: '0.12em', textTransform: 'uppercase',
      }}>{label}</div>
      {typeof count === 'number' && (
        <div style={{
          fontFamily: 'Geist Mono, ui-monospace, monospace',
          fontSize: 10, color: SC_COLORS.inkMute,
        }}>{count}</div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Result row — work
// ──────────────────────────────────────────────────────────
function WorkRow({ work, query }) {
  const cat = window.NekoData.CATS[work.cat];
  return (
    <div style={{
      display: 'flex', gap: 12, padding: '10px 20px',
      cursor: 'pointer',
    }}>
      <div style={{
        width: 56, height: 80, borderRadius: 4, overflow: 'hidden',
        border: `1px solid ${SC_COLORS.hair}`, flexShrink: 0,
      }}>
        <img src={work.poster} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
      </div>
      <div style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
        <div style={{
          fontFamily: 'Pretendard Variable', fontSize: 14, fontWeight: 600,
          color: SC_COLORS.ink, lineHeight: 1.25,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{work.title}</div>
        <div style={{
          fontFamily: 'Fraunces, serif', fontStyle: 'italic',
          fontSize: 12, color: SC_COLORS.inkDim,
          marginTop: 2,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{work.titleEn}</div>
        <div style={{
          marginTop: 6, display: 'flex', gap: 8,
          fontFamily: 'Geist Mono, ui-monospace, monospace', fontSize: 10,
          color: SC_COLORS.inkMute, letterSpacing: '0.05em',
        }}>
          <span style={{ color: cat.color }}>{cat.en.toUpperCase()}</span>
          <span>·</span>
          <span>{work.year}</span>
          <span>·</span>
          <span>{work.director}</span>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Result row — person
// ──────────────────────────────────────────────────────────
function PersonRow({ person, idx }) {
  return (
    <div style={{
      display: 'flex', gap: 12, padding: '10px 20px',
      alignItems: 'center', cursor: 'pointer',
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 22, flexShrink: 0,
        background: `linear-gradient(135deg, hsl(${(idx*73)%360},22%,28%), hsl(${(idx*73+90)%360},20%,18%))`,
        border: `1px solid ${SC_COLORS.hair}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Fraunces, serif', fontStyle: 'italic',
        fontSize: 18, color: SC_COLORS.amber,
      }}>{person.name.charAt(0)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: 'Pretendard Variable', fontSize: 14, fontWeight: 600,
          color: SC_COLORS.ink, lineHeight: 1.25,
        }}>{person.name}</div>
        <div style={{
          fontFamily: 'Pretendard Variable', fontSize: 11, color: SC_COLORS.inkMute,
          marginTop: 2,
        }}>{person.role} · {person.works.join(', ')}</div>
      </div>
      <div style={{ color: SC_COLORS.inkMute, fontSize: 14 }}>›</div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Voice listening state
// ──────────────────────────────────────────────────────────
function VoiceListening() {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '40px 24px',
      background: 'radial-gradient(circle at center, rgba(196,163,90,0.12) 0%, transparent 70%)',
    }}>
      <div style={{ position: 'relative', width: 120, height: 120, marginBottom: 28 }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{
            position: 'absolute', inset: 0,
            border: `1px solid ${SC_COLORS.amber}`, borderRadius: '50%',
            opacity: 0.4 / i,
            animation: `pulse-ring 2s ${i * 0.4}s ease-out infinite`,
          }}/>
        ))}
        <div style={{
          position: 'absolute', inset: 30,
          background: SC_COLORS.amber, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="22" height="26" viewBox="0 0 22 26" fill="none">
            <rect x="6" y="1" width="10" height="14" rx="5" fill={SC_COLORS.bg}/>
            <path d="M2 12C2 16.9706 6.02944 21 11 21V25M20 12C20 16.9706 15.9706 21 11 21" stroke={SC_COLORS.bg} strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </div>
      </div>
      <div style={{
        fontFamily: 'Fraunces, serif', fontStyle: 'italic',
        fontSize: 22, color: SC_COLORS.ink, marginBottom: 8,
      }}>듣는 중…</div>
      <div style={{
        fontFamily: 'Pretendard Variable', fontSize: 12, color: SC_COLORS.inkMute,
        textAlign: 'center', maxWidth: 220, lineHeight: 1.5,
      }}>"토요일 느릿한 한국 영화" 처럼 말해 보세요</div>
      <style>{`
        @keyframes pulse-ring {
          0% { transform: scale(0.6); opacity: 0.6; }
          100% { transform: scale(1.4); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Main screen
// variant: 'classic' | 'grouped'
// state:   'intro' | 'results' | 'empty' | 'voice'
// ──────────────────────────────────────────────────────────
function NekoSearchScreen({ variant = 'grouped', initialState = 'intro' }) {
  const [query, setQuery] = React.useState(initialState === 'results' ? '박찬욱' : initialState === 'empty' ? '존재하지않는검색어' : '');
  const [state, setState] = React.useState(initialState);
  const [listening, setListening] = React.useState(initialState === 'voice');

  const onChange = (v) => {
    setQuery(v);
    setListening(false);
    if (!v) setState('intro');
    else setState('results');
  };

  // Filter results by query (very loose — title/director/cast match)
  const queryLower = query.trim().toLowerCase();
  const matches = window.NekoData.WORKS.filter(w => {
    if (!queryLower) return false;
    return [w.title, w.titleEn, w.director, ...w.cast, ...w.genres].some(s => s.toLowerCase().includes(queryLower));
  });
  const matchedPeople = Object.values(PEOPLE).filter(p => queryLower && p.name.toLowerCase().includes(queryLower));
  const directors = matchedPeople.filter(p => p.role === '감독');
  const actors = matchedPeople.filter(p => p.role === '배우');

  const totalResults = matches.length + matchedPeople.length;
  const showEmpty = state === 'results' && totalResults === 0;

  const onMic = () => {
    setListening(true);
    setState('voice');
  };

  return (
    <div style={{
      width: '100%', height: '100%',
      background: SC_COLORS.bg,
      display: 'flex', flexDirection: 'column',
      borderRadius: 'inherit', overflow: 'hidden',
    }}>
      {/* Top header */}
      <div style={{
        padding: '16px 20px 0',
      }}>
        <div style={{
          fontFamily: 'Fraunces, serif', fontStyle: 'italic',
          fontSize: 28, color: SC_COLORS.ink, letterSpacing: '-0.02em',
        }}>Search</div>
      </div>
      <SearchBar
        value={query}
        onChange={onChange}
        onFocus={() => state === 'voice' && setState('intro')}
        focused={state !== 'voice'}
        listening={listening}
        onMic={onMic}
      />

      {/* Content area */}
      <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none' }}>
        <style>{`div::-webkit-scrollbar { display: none; }`}</style>

        {/* INTRO state */}
        {state === 'intro' && (
          <>
            <SectionHead label="Recent · 최근 검색"/>
            <div style={{ padding: '0 20px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {RECENT_QUERIES.map((q, i) => (
                <Chip key={i} mono onClick={() => onChange(q)}>↺ {q}</Chip>
              ))}
            </div>
            <SectionHead label="Trending · 지금 떠오르는"/>
            <div style={{ padding: '0 20px 20px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {TRENDING.map((q, i) => (
                <Chip key={i} accent onClick={() => onChange(q)}>{q}</Chip>
              ))}
            </div>

            <SectionHead label="Browse · 카테고리"/>
            <div style={{ padding: '0 20px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { ko: '영화',    en: 'Movies',  color: '#C4A35A' },
                { ko: '시리즈',  en: 'Series',  color: '#9B8AE0' },
                { ko: '예능',    en: 'Variety', color: '#E08A6C' },
                { ko: '다큐',    en: 'Docs',    color: '#7BA08A' },
              ].map((c, i) => (
                <div key={i} style={{
                  padding: '20px 14px', borderRadius: 8,
                  background: SC_COLORS.surface,
                  border: `1px solid ${SC_COLORS.hair}`,
                  borderLeft: `3px solid ${c.color}`,
                  cursor: 'pointer',
                }}>
                  <div style={{
                    fontFamily: 'Fraunces, serif', fontStyle: 'italic',
                    fontSize: 18, color: SC_COLORS.ink,
                  }}>{c.en}</div>
                  <div style={{
                    fontFamily: 'Pretendard Variable', fontSize: 11, color: SC_COLORS.inkMute,
                    marginTop: 2,
                  }}>{c.ko}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* VOICE state */}
        {state === 'voice' && <VoiceListening/>}

        {/* RESULTS state */}
        {state === 'results' && !showEmpty && (
          <>
            {variant === 'grouped' ? (
              <>
                {matches.length > 0 && (
                  <>
                    <SectionHead label="Works · 작품" count={matches.length}/>
                    {matches.map(w => <WorkRow key={w.id} work={w} query={query}/>)}
                  </>
                )}
                {directors.length > 0 && (
                  <>
                    <SectionHead label="Directors · 감독" count={directors.length}/>
                    {directors.map((p, i) => <PersonRow key={p.name} person={p} idx={i}/>)}
                  </>
                )}
                {actors.length > 0 && (
                  <>
                    <SectionHead label="Actors · 배우" count={actors.length}/>
                    {actors.map((p, i) => <PersonRow key={p.name} person={p} idx={i + 10}/>)}
                  </>
                )}
              </>
            ) : (
              <>
                <SectionHead label={`Results · ${totalResults}건`}/>
                {[...matches.map(w => ({ kind: 'work', data: w })),
                  ...matchedPeople.map((p, i) => ({ kind: 'person', data: p, idx: i }))].map((r, i) =>
                  r.kind === 'work'
                    ? <WorkRow key={`w-${r.data.id}`} work={r.data} query={query}/>
                    : <PersonRow key={`p-${r.data.name}`} person={r.data} idx={r.idx}/>
                )}
              </>
            )}
            <div style={{ height: 32 }}/>
          </>
        )}

        {/* EMPTY state */}
        {showEmpty && (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '40px 24px', textAlign: 'center',
          }}>
            <div style={{ marginBottom: 16, opacity: 0.85 }}>
              <window.NekoIllust name="noResults" style="auto" size={140}/>
            </div>
            <div style={{
              fontFamily: 'Fraunces, serif', fontStyle: 'italic',
              fontSize: 20, color: SC_COLORS.ink, marginBottom: 6,
            }}>"{query}"와 겹치는 게 없어요</div>
            <div style={{
              fontFamily: 'Pretendard Variable', fontSize: 12,
              color: SC_COLORS.inkMute, lineHeight: 1.55, maxWidth: 240,
            }}>단어를 조금 바꿔 보세요.\n감독 이름이나 분위기도 좋아요</div>
          </div>
        )}
      </div>
    </div>
  );
}

window.NekoSearchScreen = NekoSearchScreen;

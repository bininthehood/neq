// neko-onboarding.jsx — 5-step full onboarding flow
// Steps: welcome → intro → taste (genre chips) → OTT → notifications
// 2 variants: classic (linear progress) / editorial (each step a chapter)

const OB_COLORS = {
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

const GENRE_CHIPS = [
  { id: 'drama',     ko: '드라마',     en: 'Drama' },
  { id: 'thriller',  ko: '스릴러',     en: 'Thriller' },
  { id: 'romance',   ko: '로맨스',     en: 'Romance' },
  { id: 'comedy',    ko: '코미디',     en: 'Comedy' },
  { id: 'sf',        ko: 'SF',         en: 'Sci-Fi' },
  { id: 'mystery',   ko: '미스터리',   en: 'Mystery' },
  { id: 'crime',     ko: '범죄',       en: 'Crime' },
  { id: 'doc',       ko: '다큐',       en: 'Documentary' },
  { id: 'action',    ko: '액션',       en: 'Action' },
  { id: 'fantasy',   ko: '판타지',     en: 'Fantasy' },
  { id: 'horror',    ko: '호러',       en: 'Horror' },
  { id: 'animation', ko: '애니메이션', en: 'Animation' },
  { id: 'variety',   ko: '예능',       en: 'Variety' },
  { id: 'history',   ko: '시대극',     en: 'Period' },
  { id: 'music',     ko: '음악',       en: 'Music' },
];

const OTTS_LIST = [
  { id: 'netflix', name: 'Netflix',  color: '#E50914', short: 'N' },
  { id: 'wavve',   name: 'Wavve',    color: '#1351F9', short: 'W' },
  { id: 'tving',   name: 'TVING',    color: '#FF153C', short: 'T' },
  { id: 'watcha',  name: 'Watcha',   color: '#FF0558', short: 'W' },
  { id: 'disney',  name: 'Disney+',  color: '#0E47BA', short: 'D+' },
  { id: 'apple',   name: 'Apple TV+', color: '#000000', short: 'A' },
];

const NOTIF_OPTIONS = [
  { id: 'recs',    title: '주간 추천',     desc: '매주 월요일 아침, 취향에 맞는 작품 5개', defaultOn: true },
  { id: 'new',     title: '새 작품 알림',  desc: '저장한 감독·배우의 새 작품이 공개될 때',   defaultOn: true },
  { id: 'expire',  title: 'OTT 만료',      desc: '저장한 작품이 OTT에서 곧 내려갈 때',      defaultOn: false },
  { id: 'report',  title: '월간 리포트',   desc: '매월 1일, 한 달간 본 작품 요약',          defaultOn: true },
];

// ──────────────────────────────────────────────────────────
// Progress bar (classic variant)
// ──────────────────────────────────────────────────────────
function StepProgress({ current, total }) {
  return (
    <div style={{ display: 'flex', gap: 6, padding: '20px 24px 0' }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={{
          flex: 1, height: 3, borderRadius: 2,
          background: i < current ? OB_COLORS.amber :
                       i === current ? OB_COLORS.amber :
                       OB_COLORS.hair,
          opacity: i === current ? 1 : i < current ? 0.7 : 1,
          transition: 'background 0.3s, opacity 0.3s',
        }}/>
      ))}
    </div>
  );
}

// Editorial chapter mark
function ChapterMark({ index, total, label }) {
  return (
    <div style={{
      padding: '24px 24px 0', display: 'flex',
      alignItems: 'baseline', justifyContent: 'space-between',
    }}>
      <div style={{
        fontFamily: 'Geist Mono, ui-monospace, monospace',
        fontSize: 10, color: OB_COLORS.amber,
        letterSpacing: '0.15em', textTransform: 'uppercase',
      }}>Chapter {String(index + 1).padStart(2, '0')} · {label}</div>
      <div style={{
        fontFamily: 'Geist Mono, ui-monospace, monospace',
        fontSize: 10, color: OB_COLORS.inkMute,
        letterSpacing: '0.05em',
      }}>{index + 1} / {total}</div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Bottom CTA
// ──────────────────────────────────────────────────────────
function CTA({ label, onClick, disabled, secondary, onSecondary, secondaryLabel }) {
  return (
    <div style={{
      padding: '12px 24px 26px',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <button onClick={disabled ? null : onClick} style={{
        width: '100%', padding: '15px 16px', borderRadius: 10,
        background: disabled ? OB_COLORS.surface2 : OB_COLORS.amber,
        border: 'none',
        color: disabled ? OB_COLORS.inkMute : OB_COLORS.bg,
        fontFamily: 'Pretendard Variable', fontSize: 14, fontWeight: 600,
        cursor: disabled ? 'default' : 'pointer',
        transition: 'background 0.15s',
      }}>{label}</button>
      {secondary && (
        <button onClick={onSecondary} style={{
          width: '100%', padding: '12px 16px',
          background: 'transparent', border: 'none',
          color: OB_COLORS.inkDim,
          fontFamily: 'Pretendard Variable', fontSize: 12,
          cursor: 'pointer',
        }}>{secondaryLabel}</button>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// STEP 1 — Welcome
// ──────────────────────────────────────────────────────────
function StepWelcome({ variant, onNext }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '40px 32px', textAlign: 'center',
      }}>
        <div style={{ marginBottom: 32 }}>
          <window.NekoIllust name="welcome" style="auto" size={180}/>
        </div>
        {variant === 'editorial' && (
          <div style={{
            fontFamily: 'Geist Mono, ui-monospace, monospace',
            fontSize: 10, color: OB_COLORS.amber,
            letterSpacing: '0.15em', textTransform: 'uppercase',
            marginBottom: 12,
          }}>An invitation</div>
        )}
        <div style={{
          fontFamily: 'Fraunces, serif', fontStyle: 'italic',
          fontSize: 32, color: OB_COLORS.ink,
          letterSpacing: '-0.02em', lineHeight: 1.15,
          marginBottom: 14,
        }}>오늘의 한 편을<br/>고르는 시간</div>
        <div style={{
          fontFamily: 'Pretendard Variable', fontSize: 14,
          color: OB_COLORS.inkDim, lineHeight: 1.6, maxWidth: 280,
        }}>알고리즘 대신, 큐레이션.<br/>당신의 취향에 맞춰 매일 한 작품씩.</div>
      </div>
      <CTA label="시작하기" onClick={onNext}/>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// STEP 2 — Intro (이름 + 어떻게 부를까)
// ──────────────────────────────────────────────────────────
function StepIntro({ variant, onNext, onSkip }) {
  const [name, setName] = React.useState('');
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, padding: '32px 28px 0' }}>
        <div style={{
          fontFamily: 'Fraunces, serif', fontStyle: 'italic',
          fontSize: 26, color: OB_COLORS.ink, lineHeight: 1.2,
          letterSpacing: '-0.02em', marginBottom: 10,
        }}>먼저, 어떻게 부를까요?</div>
        <div style={{
          fontFamily: 'Pretendard Variable', fontSize: 13,
          color: OB_COLORS.inkDim, lineHeight: 1.55, marginBottom: 32,
        }}>리포트와 추천 메시지에 사용해요</div>

        <div style={{
          padding: '14px 16px',
          background: OB_COLORS.surface,
          border: `1px solid ${name ? OB_COLORS.amberDim : OB_COLORS.hair}`,
          borderRadius: 10,
        }}>
          <div style={{
            fontFamily: 'Geist Mono, ui-monospace, monospace',
            fontSize: 9, color: OB_COLORS.inkMute,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            marginBottom: 4,
          }}>Name · 이름</div>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="예: 민지"
            style={{
              width: '100%', background: 'transparent', border: 'none', outline: 'none',
              fontFamily: 'Pretendard Variable', fontSize: 18, fontWeight: 500,
              color: OB_COLORS.ink, padding: 0,
            }}
          />
        </div>

        <div style={{
          marginTop: 24, padding: '14px 16px',
          background: OB_COLORS.amberDim, borderRadius: 8,
          fontFamily: 'Fraunces, serif', fontStyle: 'italic',
          fontSize: 14, color: OB_COLORS.ink, lineHeight: 1.5,
        }}>"{name || '○○○'} 님, 이번 주 한 편 어떠세요?"</div>
      </div>
      <CTA
        label="다음"
        onClick={onNext}
        disabled={!name}
        secondary
        onSecondary={onSkip}
        secondaryLabel="건너뛰기"
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// STEP 3 — Taste (genre chips multi-select)
// ──────────────────────────────────────────────────────────
function StepTaste({ variant, onNext }) {
  const [selected, setSelected] = React.useState(new Set());
  const minRequired = 3;
  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  const enough = selected.size >= minRequired;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '32px 28px 0' }}>
        <div style={{
          fontFamily: 'Fraunces, serif', fontStyle: 'italic',
          fontSize: 26, color: OB_COLORS.ink, lineHeight: 1.2,
          letterSpacing: '-0.02em', marginBottom: 10,
        }}>어떤 장르를 좋아하세요?</div>
        <div style={{
          fontFamily: 'Pretendard Variable', fontSize: 13,
          color: OB_COLORS.inkDim, lineHeight: 1.55, marginBottom: 4,
        }}>3개 이상 골라 주세요</div>
        <div style={{
          fontFamily: 'Geist Mono, ui-monospace, monospace',
          fontSize: 11, color: enough ? OB_COLORS.amber : OB_COLORS.inkMute,
          letterSpacing: '0.05em',
        }}>{selected.size} / {minRequired}+</div>
      </div>

      <div style={{
        flex: 1, padding: '24px 24px 16px',
        display: 'flex', flexWrap: 'wrap', gap: 8, alignContent: 'flex-start',
        overflowY: 'auto',
      }}>
        {GENRE_CHIPS.map(g => {
          const on = selected.has(g.id);
          return (
            <div key={g.id} onClick={() => toggle(g.id)} style={{
              padding: '11px 16px', borderRadius: 22,
              background: on ? OB_COLORS.amber : OB_COLORS.surface,
              border: `1px solid ${on ? OB_COLORS.amber : OB_COLORS.hair}`,
              color: on ? OB_COLORS.bg : OB_COLORS.ink,
              fontFamily: 'Pretendard Variable', fontSize: 13,
              fontWeight: on ? 600 : 500,
              cursor: 'pointer',
              transition: 'background 0.15s, border-color 0.15s',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {on && <span style={{ fontSize: 11 }}>✓</span>}
              {g.ko}
            </div>
          );
        })}
      </div>

      <CTA label={enough ? '다음' : `${minRequired - selected.size}개만 더`} onClick={onNext} disabled={!enough}/>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// STEP 4 — OTT 선택
// ──────────────────────────────────────────────────────────
function StepOTT({ variant, onNext }) {
  const [selected, setSelected] = React.useState(new Set());
  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '32px 28px 0' }}>
        <div style={{
          fontFamily: 'Fraunces, serif', fontStyle: 'italic',
          fontSize: 26, color: OB_COLORS.ink, lineHeight: 1.2,
          letterSpacing: '-0.02em', marginBottom: 10,
        }}>어디서 보세요?</div>
        <div style={{
          fontFamily: 'Pretendard Variable', fontSize: 13,
          color: OB_COLORS.inkDim, lineHeight: 1.55,
        }}>구독 중인 OTT를 알려 주시면<br/>지금 바로 볼 수 있는 작품만 추천해요</div>
      </div>

      <div style={{
        flex: 1, padding: '24px 24px 16px',
        display: 'flex', flexDirection: 'column', gap: 8,
        overflowY: 'auto',
      }}>
        {OTTS_LIST.map(o => {
          const on = selected.has(o.id);
          return (
            <div key={o.id} onClick={() => toggle(o.id)} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '12px 14px', borderRadius: 10,
              background: on ? OB_COLORS.surface2 : OB_COLORS.surface,
              border: `1px solid ${on ? OB_COLORS.amber : OB_COLORS.hair}`,
              cursor: 'pointer',
              transition: 'background 0.15s, border-color 0.15s',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: o.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontFamily: 'Pretendard Variable',
                fontSize: 13, fontWeight: 700,
              }}>{o.short}</div>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontFamily: 'Pretendard Variable', fontSize: 14, fontWeight: 600,
                  color: OB_COLORS.ink,
                }}>{o.name}</div>
              </div>
              <div style={{
                width: 22, height: 22, borderRadius: 11,
                background: on ? OB_COLORS.amber : 'transparent',
                border: `1.5px solid ${on ? OB_COLORS.amber : OB_COLORS.hair}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: OB_COLORS.bg, fontSize: 12,
              }}>{on ? '✓' : ''}</div>
            </div>
          );
        })}
      </div>

      <CTA label="다음" onClick={onNext} disabled={selected.size === 0}/>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// STEP 5 — Notifications
// ──────────────────────────────────────────────────────────
function StepNotif({ variant, onNext }) {
  const [settings, setSettings] = React.useState(
    Object.fromEntries(NOTIF_OPTIONS.map(n => [n.id, n.defaultOn]))
  );
  const toggle = (id) => setSettings(s => ({ ...s, [id]: !s[id] }));

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '32px 28px 0' }}>
        <div style={{
          fontFamily: 'Fraunces, serif', fontStyle: 'italic',
          fontSize: 26, color: OB_COLORS.ink, lineHeight: 1.2,
          letterSpacing: '-0.02em', marginBottom: 10,
        }}>어떤 알림을 받을까요?</div>
        <div style={{
          fontFamily: 'Pretendard Variable', fontSize: 13,
          color: OB_COLORS.inkDim, lineHeight: 1.55,
        }}>나중에 설정에서 언제든 바꿀 수 있어요</div>
      </div>

      <div style={{
        flex: 1, padding: '24px 24px 16px',
        display: 'flex', flexDirection: 'column', gap: 6,
        overflowY: 'auto',
      }}>
        {NOTIF_OPTIONS.map(n => {
          const on = settings[n.id];
          return (
            <div key={n.id} onClick={() => toggle(n.id)} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '14px 14px',
              borderBottom: `1px solid ${OB_COLORS.hair}`,
              cursor: 'pointer',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontFamily: 'Pretendard Variable', fontSize: 14, fontWeight: 600,
                  color: OB_COLORS.ink, marginBottom: 3,
                }}>{n.title}</div>
                <div style={{
                  fontFamily: 'Pretendard Variable', fontSize: 11, color: OB_COLORS.inkMute,
                  lineHeight: 1.45,
                }}>{n.desc}</div>
              </div>
              {/* iOS-style switch */}
              <div style={{
                width: 44, height: 26, borderRadius: 13,
                background: on ? OB_COLORS.amber : OB_COLORS.hair,
                position: 'relative', flexShrink: 0,
                transition: 'background 0.2s',
              }}>
                <div style={{
                  position: 'absolute', top: 2, left: on ? 20 : 2,
                  width: 22, height: 22, borderRadius: 11,
                  background: '#fff',
                  transition: 'left 0.2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                }}/>
              </div>
            </div>
          );
        })}
      </div>

      <CTA label="시작하기" onClick={onNext}/>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Step 6 — Done celebration (auto-shown after step 5)
// ──────────────────────────────────────────────────────────
function StepDone() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '40px 32px', textAlign: 'center',
      }}>
        <div style={{ marginBottom: 28 }}>
          <window.NekoIllust name="onboarding" style="auto" size={160}/>
        </div>
        <div style={{
          fontFamily: 'Geist Mono, ui-monospace, monospace',
          fontSize: 10, color: OB_COLORS.amber,
          letterSpacing: '0.15em', textTransform: 'uppercase',
          marginBottom: 12,
        }}>Ready</div>
        <div style={{
          fontFamily: 'Fraunces, serif', fontStyle: 'italic',
          fontSize: 28, color: OB_COLORS.ink,
          letterSpacing: '-0.02em', lineHeight: 1.2, marginBottom: 14,
        }}>오늘의 한 편이<br/>준비됐어요</div>
        <div style={{
          fontFamily: 'Pretendard Variable', fontSize: 13,
          color: OB_COLORS.inkDim, lineHeight: 1.6, maxWidth: 240,
        }}>매일 자정, 새 큐레이션이 도착해요</div>
      </div>
      <CTA label="Discover로 가기"/>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Main onboarding
// variant: 'classic' | 'editorial'
// ──────────────────────────────────────────────────────────
function NekoOnboarding({ variant = 'classic', initialStep = 0, onComplete }) {
  const [step, setStep] = React.useState(initialStep);
  const total = 5;
  const next = () => setStep(s => {
    const n = Math.min(s + 1, total);
    if (n >= total && onComplete) setTimeout(onComplete, 1200);
    return n;
  });
  const skip = () => next();
  const labels = ['Welcome', 'Hello', 'Taste', 'Where', 'Notify'];

  return (
    <div style={{
      width: '100%', height: '100%',
      background: OB_COLORS.bg,
      display: 'flex', flexDirection: 'column',
      borderRadius: 'inherit', overflow: 'hidden',
      position: 'relative',
    }}>
      {/* Progress / Chapter mark */}
      {step < total && (
        variant === 'classic'
          ? <StepProgress current={step} total={total}/>
          : <ChapterMark index={step} total={total} label={labels[step]}/>
      )}

      {/* Steps */}
      {step === 0 && <StepWelcome variant={variant} onNext={next}/>}
      {step === 1 && <StepIntro   variant={variant} onNext={next} onSkip={skip}/>}
      {step === 2 && <StepTaste   variant={variant} onNext={next}/>}
      {step === 3 && <StepOTT     variant={variant} onNext={next}/>}
      {step === 4 && <StepNotif   variant={variant} onNext={next}/>}
      {step >= total && <StepDone/>}

      {/* Back button (top-left, visible from step 1) */}
      {step > 0 && step < total && (
        <div onClick={() => setStep(s => s - 1)} style={{
          position: 'absolute', top: 14, left: 14,
          width: 32, height: 32, borderRadius: 16,
          background: OB_COLORS.surface,
          border: `1px solid ${OB_COLORS.hair}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: OB_COLORS.inkDim, fontSize: 14, cursor: 'pointer',
        }}>‹</div>
      )}
    </div>
  );
}

window.NekoOnboarding = NekoOnboarding;

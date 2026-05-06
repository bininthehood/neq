// neko-edge-cases.jsx
// Round 2 — Edge case screens.
// 3 priority states: Loading / Network Error / Exhausted (오늘의 5선 끝).

const NEKO_C = {
  bg: '#0B0A07', surface: '#12110E', surface2: '#1A1812',
  ink: '#EDEDEF', inkDim: '#8E8F9A', inkMute: '#6B6C75',
  hair: '#2A2823', amber: '#C4A35A', amberDim: 'rgba(196,163,90,0.15)',
  warn: '#D4A245', error: '#C87A6C',
};

// ─────────────────────────────────────────────────────────────
// Skeleton primitive — shimmer pulse
// ─────────────────────────────────────────────────────────────
function Skel({ w = '100%', h = 12, r = 4, style }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: r,
      background: 'linear-gradient(90deg, #1A1812 0%, #24221C 50%, #1A1812 100%)',
      backgroundSize: '200% 100%',
      animation: 'nekoSkelShimmer 1.4s ease-in-out infinite',
      ...style,
    }}/>
  );
}

// Inject keyframes once
(function ensureSkelKeyframes() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('neko-skel-kf')) return;
  const s = document.createElement('style');
  s.id = 'neko-skel-kf';
  s.textContent = `
    @keyframes nekoSkelShimmer {
      0%   { background-position: 100% 0; }
      100% { background-position: -100% 0; }
    }
    @keyframes nekoSpinDots {
      0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
      40%           { opacity: 1;   transform: scale(1);   }
    }
    @keyframes nekoFadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes nekoBannerSlide {
      from { transform: translateY(-100%); opacity: 0; }
      to   { transform: translateY(0);     opacity: 1; }
    }
    @keyframes nekoPulse {
      0%, 100% { opacity: 0.55; }
      50%      { opacity: 1; }
    }
  `;
  document.head.appendChild(s);
})();

// ─────────────────────────────────────────────────────────────
// LoadingDots — three amber dots, staggered
// ─────────────────────────────────────────────────────────────
function LoadingDots({ size = 6, color = NEKO_C.amber, gap = 5 }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: size, height: size, borderRadius: '50%', background: color,
          animation: `nekoSpinDots 1.2s ease-in-out ${i * 0.15}s infinite`,
        }}/>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Phone frame chrome (header) reused across loading states
// ─────────────────────────────────────────────────────────────
function PhoneHeader({ eyebrow, title, rightSlot }) {
  return (
    <div style={{
      padding: '14px 22px 10px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <div>
        <div style={{
          fontFamily: 'Geist Mono, ui-monospace, monospace', fontSize: 9,
          color: NEKO_C.amber, letterSpacing: '0.18em',
          textTransform: 'uppercase', marginBottom: 2,
        }}>{eyebrow}</div>
        <div style={{
          fontFamily: 'Fraunces, serif', fontStyle: 'italic',
          fontSize: 26, color: NEKO_C.ink, letterSpacing: '-0.01em', lineHeight: 1,
        }}>{title}</div>
      </div>
      {rightSlot}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 1A. Discover — Initial Loading (skeleton card)
// ─────────────────────────────────────────────────────────────
function LoadingDiscover() {
  return (
    <div style={{ width: '100%', height: '100%', background: NEKO_C.bg, display: 'flex', flexDirection: 'column', borderRadius: 'inherit', overflow: 'hidden' }}>
      <PhoneHeader
        eyebrow="2025 · Vol. 18 — May"
        title="또 넷플릭스 켤 거예요?"
        rightSlot={
          <div style={{ width: 36, height: 36, borderRadius: 18, background: NEKO_C.surface, border: `1px solid ${NEKO_C.hair}` }}/>
        }
      />
      <div style={{ padding: '0 22px 10px', fontFamily: 'Pretendard Variable', fontSize: 11.5, color: NEKO_C.inkMute, display: 'flex', alignItems: 'center', gap: 8 }}>
        <LoadingDots size={4}/>
        <span>오늘의 다섯 편, 고르는 중</span>
      </div>

      {/* Skeleton card */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 22px 22px' }}>
        <div style={{
          width: '100%', maxWidth: 320, aspectRatio: '0.66',
          borderRadius: 14, border: `1px solid ${NEKO_C.hair}`,
          background: NEKO_C.surface, padding: 14,
          display: 'flex', flexDirection: 'column', gap: 10,
          animation: 'nekoFadeIn 0.4s ease both',
        }}>
          <Skel h={18} w="40%"/>
          <Skel h="62%" r={8}/>
          <Skel h={14} w="80%"/>
          <Skel h={11} w="60%"/>
          <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
            <Skel h={20} w={56} r={10}/>
            <Skel h={20} w={48} r={10}/>
            <Skel h={20} w={42} r={10}/>
          </div>
        </div>
      </div>

      <div style={{ padding: '4px 22px 16px', textAlign: 'center', fontFamily: 'Geist Mono, monospace', fontSize: 9, color: NEKO_C.inkMute, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
        Curating · 1 / 5
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 1B. Saved — List skeleton (mood section + card grid)
// ─────────────────────────────────────────────────────────────
function LoadingSaved() {
  return (
    <div style={{ width: '100%', height: '100%', background: NEKO_C.bg, display: 'flex', flexDirection: 'column', borderRadius: 'inherit', overflow: 'hidden' }}>
      <div style={{ padding: '14px 22px 10px' }}>
        <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 9, color: NEKO_C.amber, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 4 }}>Saved · Library</div>
        <div style={{ fontFamily: 'Fraunces, serif', fontStyle: 'italic', fontSize: 26, color: NEKO_C.ink, letterSpacing: '-0.01em', lineHeight: 1 }}>당신의 책장</div>
      </div>
      {/* Filter chips skel */}
      <div style={{ padding: '6px 22px 14px', display: 'flex', gap: 6 }}>
        {[60, 50, 70, 45].map((w, i) => <Skel key={i} h={26} w={w} r={13}/>)}
      </div>
      {/* Mood section title */}
      <div style={{ padding: '8px 22px 8px' }}>
        <Skel h={14} w={120}/>
      </div>
      {/* Card grid */}
      <div style={{ padding: '0 22px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6, animation: `nekoFadeIn 0.5s ease ${i * 0.05}s both` }}>
            <Skel h={148} r={6}/>
            <Skel h={11} w="80%"/>
            <Skel h={9} w="50%"/>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 1C. Detail — Sheet content loading (header is real, body skel)
// ─────────────────────────────────────────────────────────────
function LoadingDetail() {
  return (
    <div style={{ width: '100%', height: '100%', background: NEKO_C.bg, display: 'flex', flexDirection: 'column', borderRadius: 'inherit', overflow: 'hidden', position: 'relative' }}>
      {/* dimmed underlying */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(11,10,7,0.6)' }}/>
      {/* sheet */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, top: '14%',
        background: NEKO_C.surface, borderRadius: '16px 16px 0 0',
        padding: '12px 22px 22px', display: 'flex', flexDirection: 'column', gap: 14,
        animation: 'nekoFadeIn 0.3s ease both',
      }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: NEKO_C.hair, alignSelf: 'center' }}/>
        {/* Hero skel */}
        <Skel h={140} r={8}/>
        {/* Title block */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Skel h={22} w="65%"/>
          <Skel h={11} w="45%"/>
        </div>
        {/* OTT row */}
        <div style={{ display: 'flex', gap: 6 }}>
          {[0,1,2].map(i => <Skel key={i} h={28} w={28} r={14}/>)}
        </div>
        {/* Body lines */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Skel h={11} w="100%"/>
          <Skel h={11} w="92%"/>
          <Skel h={11} w="78%"/>
          <Skel h={11} w="60%"/>
        </div>
        <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'center' }}>
          <LoadingDots/>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 1D. Saved sync — small inline indicator (non-blocking)
// ─────────────────────────────────────────────────────────────
function LoadingSavedSync() {
  return (
    <div style={{ width: '100%', height: '100%', background: NEKO_C.bg, display: 'flex', flexDirection: 'column', borderRadius: 'inherit', overflow: 'hidden' }}>
      <div style={{ padding: '14px 22px 10px' }}>
        <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 9, color: NEKO_C.amber, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 4 }}>Saved · Library</div>
        <div style={{ fontFamily: 'Fraunces, serif', fontStyle: 'italic', fontSize: 26, color: NEKO_C.ink, letterSpacing: '-0.01em', lineHeight: 1 }}>당신의 책장</div>
      </div>
      {/* Sync indicator strip */}
      <div style={{ margin: '4px 22px 12px', padding: '8px 12px', borderRadius: 8, background: NEKO_C.surface, border: `1px solid ${NEKO_C.hair}`, display: 'flex', alignItems: 'center', gap: 10, animation: 'nekoFadeIn 0.3s ease both' }}>
        <LoadingDots size={4}/>
        <span style={{ fontSize: 11, color: NEKO_C.inkDim, letterSpacing: '-0.005em' }}>다른 기기와 맞추는 중이에요</span>
      </div>
      {/* Existing list (faded) */}
      <div style={{ padding: '0 22px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, opacity: 0.55 }}>
        {[1,2,3,4].map(i => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ height: 148, borderRadius: 6, background: NEKO_C.surface2 }}/>
            <div style={{ height: 11, borderRadius: 3, background: NEKO_C.surface2, width: '80%' }}/>
            <div style={{ height: 9, borderRadius: 3, background: NEKO_C.surface2, width: '50%' }}/>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 2A. Network — Offline banner (non-blocking, top of normal screen)
// ─────────────────────────────────────────────────────────────
function OfflineBanner() {
  return (
    <div style={{ width: '100%', height: '100%', background: NEKO_C.bg, display: 'flex', flexDirection: 'column', borderRadius: 'inherit', overflow: 'hidden' }}>
      {/* Banner */}
      <div style={{
        background: NEKO_C.surface2, borderBottom: `1px solid ${NEKO_C.hair}`,
        padding: '10px 22px', display: 'flex', alignItems: 'center', gap: 10,
        animation: 'nekoBannerSlide 0.35s ease both',
      }}>
        <div style={{ width: 8, height: 8, borderRadius: 4, background: NEKO_C.warn, animation: 'nekoPulse 1.6s ease-in-out infinite' }}/>
        <div style={{ flex: 1, fontSize: 11.5, color: NEKO_C.ink, letterSpacing: '-0.005em' }}>
          오프라인 모드. 저장한 작품은 그대로 있어요.
        </div>
        <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 9, color: NEKO_C.amber, letterSpacing: '0.15em', textTransform: 'uppercase', cursor: 'pointer' }}>다시 시도</div>
      </div>
      <PhoneHeader
        eyebrow="2025 · Vol. 18 — May"
        title="저장한 작품"
        rightSlot={null}
      />
      <div style={{ padding: '0 22px 10px', fontFamily: 'Pretendard Variable', fontSize: 11.5, color: NEKO_C.inkMute }}>
        24편 · 캐시에서 불러왔어요
      </div>
      {/* Cached card preview */}
      <div style={{ padding: '4px 22px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {[
          { t: '헤어질 결심', y: 2022 },
          { t: '기생충', y: 2019 },
          { t: '브로커', y: 2022 },
          { t: '소공녀', y: 2018 },
        ].map((w, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ height: 148, borderRadius: 6, background: NEKO_C.surface, border: `1px solid ${NEKO_C.hair}`, display: 'flex', alignItems: 'flex-end', padding: 8 }}>
              <div style={{ fontFamily: 'Fraunces, serif', fontStyle: 'italic', fontSize: 14, color: NEKO_C.ink, lineHeight: 1.1 }}>{w.t}</div>
            </div>
            <div style={{ fontSize: 10, color: NEKO_C.inkMute, fontFamily: 'Geist Mono, monospace', letterSpacing: '0.1em' }}>{w.y}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 2B. Network — Full error (initial load failed, no cache)
// ─────────────────────────────────────────────────────────────
function NetworkErrorFull() {
  const Illust = window.NekoIllust;
  return (
    <div style={{ width: '100%', height: '100%', background: NEKO_C.bg, display: 'flex', flexDirection: 'column', borderRadius: 'inherit', overflow: 'hidden' }}>
      <div style={{ padding: '14px 22px 0' }}>
        <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 9, color: NEKO_C.inkMute, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Connection · 503</div>
      </div>
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '20px 32px', textAlign: 'center', gap: 18,
      }}>
        <div style={{ animation: 'nekoFadeIn 0.5s ease both' }}>
          {Illust ? <Illust name="error" style="auto" size={140}/> : <div style={{ width: 140, height: 140, background: NEKO_C.surface, borderRadius: 8 }}/>}
        </div>
        <div style={{ fontFamily: 'Fraunces, serif', fontStyle: 'italic', fontSize: 26, color: NEKO_C.ink, letterSpacing: '-0.015em', lineHeight: 1.15, animation: 'nekoFadeIn 0.5s ease 0.08s both' }}>
          신호가 흐릿해요.
        </div>
        <div style={{ fontSize: 13, color: NEKO_C.inkDim, lineHeight: 1.6, maxWidth: 260, animation: 'nekoFadeIn 0.5s ease 0.16s both' }}>
          잠시 숨 고르고 다시 와 주세요.<br/>
          대부분 그새 풀려 있어요.
        </div>
        {/* Action row */}
        <div style={{ display: 'flex', gap: 8, marginTop: 4, animation: 'nekoFadeIn 0.5s ease 0.24s both' }}>
          <button style={{
            padding: '11px 22px', borderRadius: 22, border: 'none',
            background: NEKO_C.amber, color: '#0B0A07',
            fontFamily: 'Pretendard Variable', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', letterSpacing: '-0.005em',
          }}>다시 시도</button>
          <button style={{
            padding: '11px 18px', borderRadius: 22,
            border: `1px solid ${NEKO_C.hair}`, background: 'transparent',
            color: NEKO_C.ink, fontFamily: 'Pretendard Variable', fontSize: 13,
            cursor: 'pointer', letterSpacing: '-0.005em',
          }}>저장한 작품 보기</button>
        </div>
        {/* Tech tag */}
        <div style={{ marginTop: 6, fontFamily: 'Geist Mono, monospace', fontSize: 9, color: NEKO_C.inkMute, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
          err · network_unavailable
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 2C. Image load failed — placeholder fallback in card
// ─────────────────────────────────────────────────────────────
function ImageFailedCard() {
  return (
    <div style={{ width: '100%', height: '100%', background: NEKO_C.bg, display: 'flex', flexDirection: 'column', borderRadius: 'inherit', overflow: 'hidden' }}>
      <PhoneHeader eyebrow="2025 · Vol. 18 — May" title="또 넷플릭스 켤 거예요?" rightSlot={null}/>
      <div style={{ padding: '0 22px 10px', fontFamily: 'Pretendard Variable', fontSize: 11.5, color: NEKO_C.inkMute }}>
        2 of 5 · 천천히 음미하기
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 22px 22px' }}>
        <div style={{
          width: '100%', maxWidth: 320, aspectRatio: '0.66',
          borderRadius: 14, border: `1px solid ${NEKO_C.hair}`,
          background: NEKO_C.surface, padding: 14,
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 9, color: NEKO_C.amber, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Movie · 2022 · 138m</div>
          {/* Image fallback — typographic */}
          <div style={{
            flex: 1, borderRadius: 8, background: NEKO_C.surface2,
            border: `1px dashed ${NEKO_C.hair}`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ fontFamily: 'Fraunces, serif', fontStyle: 'italic', fontSize: 32, color: NEKO_C.ink, letterSpacing: '-0.02em', textAlign: 'center', padding: '0 18px', lineHeight: 1.05 }}>
              헤어질<br/>결심
            </div>
            <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 8, color: NEKO_C.inkMute, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
              poster · n/a
            </div>
          </div>
          <div>
            <div style={{ fontFamily: 'Fraunces, serif', fontStyle: 'italic', fontSize: 20, color: NEKO_C.ink, letterSpacing: '-0.01em' }}>헤어질 결심</div>
            <div style={{ fontSize: 11, color: NEKO_C.inkMute, marginTop: 2 }}>박찬욱 · 탕웨이 · 박해일</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 3A. Exhausted — End of today's 5 (warm, witty)
// ─────────────────────────────────────────────────────────────
function ExhaustedToday() {
  const Illust = window.NekoIllust;
  return (
    <div style={{ width: '100%', height: '100%', background: NEKO_C.bg, display: 'flex', flexDirection: 'column', borderRadius: 'inherit', overflow: 'hidden' }}>
      <div style={{ padding: '14px 22px 0' }}>
        <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 9, color: NEKO_C.amber, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Day · Complete</div>
      </div>
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '20px 28px', textAlign: 'center', gap: 16,
      }}>
        <div style={{ animation: 'nekoFadeIn 0.5s ease both' }}>
          {Illust ? <Illust name="archive" style="auto" size={150}/> : <div style={{ width: 150, height: 150, background: NEKO_C.surface, borderRadius: 8 }}/>}
        </div>
        <div style={{ fontFamily: 'Fraunces, serif', fontStyle: 'italic', fontSize: 30, color: NEKO_C.ink, letterSpacing: '-0.02em', lineHeight: 1.1, animation: 'nekoFadeIn 0.5s ease 0.08s both' }}>
          오늘은 여기까지.
        </div>
        <div style={{ fontSize: 13, color: NEKO_C.inkDim, lineHeight: 1.65, maxWidth: 270, animation: 'nekoFadeIn 0.5s ease 0.16s both' }}>
          다섯 편 다 봤어요. 고르는 시간은 끝,<br/>
          이제 보는 시간이에요.
        </div>

        {/* Today's stat strip */}
        <div style={{
          marginTop: 4, padding: '12px 16px',
          borderRadius: 10, border: `1px solid ${NEKO_C.hair}`,
          background: NEKO_C.surface,
          display: 'flex', gap: 18, animation: 'nekoFadeIn 0.5s ease 0.24s both',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'Fraunces, serif', fontStyle: 'italic', fontSize: 22, color: NEKO_C.amber, lineHeight: 1 }}>2</div>
            <div style={{ fontSize: 9, color: NEKO_C.inkMute, fontFamily: 'Geist Mono, monospace', letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 4 }}>Saved</div>
          </div>
          <div style={{ width: 1, background: NEKO_C.hair }}/>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'Fraunces, serif', fontStyle: 'italic', fontSize: 22, color: NEKO_C.ink, lineHeight: 1 }}>3</div>
            <div style={{ fontSize: 9, color: NEKO_C.inkMute, fontFamily: 'Geist Mono, monospace', letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 4 }}>Passed</div>
          </div>
          <div style={{ width: 1, background: NEKO_C.hair }}/>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'Fraunces, serif', fontStyle: 'italic', fontSize: 22, color: NEKO_C.ink, lineHeight: 1 }}>14:32</div>
            <div style={{ fontSize: 9, color: NEKO_C.inkMute, fontFamily: 'Geist Mono, monospace', letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 4 }}>Tomorrow</div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 280, animation: 'nekoFadeIn 0.5s ease 0.32s both' }}>
          <button style={{
            padding: '12px 20px', borderRadius: 22, border: 'none',
            background: NEKO_C.amber, color: '#0B0A07',
            fontFamily: 'Pretendard Variable', fontSize: 13, fontWeight: 600,
            cursor: 'pointer',
          }}>저장한 작품 보기</button>
          <button style={{
            padding: '12px 20px', borderRadius: 22,
            border: `1px solid ${NEKO_C.hair}`, background: 'transparent',
            color: NEKO_C.ink, fontFamily: 'Pretendard Variable', fontSize: 13,
            cursor: 'pointer',
          }}>그래도 더 볼래요</button>
        </div>

        <div style={{ marginTop: 6, fontFamily: 'Geist Mono, monospace', fontSize: 9, color: NEKO_C.inkMute, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
          내일 이 시간 · 새 다섯 편
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 3B. Exhausted — "더 보기" tapped, fatigue acknowledged
// ─────────────────────────────────────────────────────────────
function ExhaustedExtra() {
  return (
    <div style={{ width: '100%', height: '100%', background: NEKO_C.bg, display: 'flex', flexDirection: 'column', borderRadius: 'inherit', overflow: 'hidden' }}>
      <PhoneHeader
        eyebrow="Bonus · Off-the-record"
        title="조금만 더."
        rightSlot={null}
      />
      <div style={{ padding: '0 22px 10px', fontFamily: 'Pretendard Variable', fontSize: 11.5, color: NEKO_C.inkMute, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 3, background: NEKO_C.warn }}/>
        오늘 몫을 넘긴 보너스 추천
      </div>

      {/* Bonus card */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 22px 14px' }}>
        <div style={{
          width: '100%', maxWidth: 320, aspectRatio: '0.66',
          borderRadius: 14, border: `1px dashed ${NEKO_C.warn}`,
          background: NEKO_C.surface, padding: 14,
          display: 'flex', flexDirection: 'column', gap: 12,
          position: 'relative',
        }}>
          <div style={{ position: 'absolute', top: 12, right: 12, padding: '3px 8px', borderRadius: 4, background: 'rgba(212,162,69,0.15)', color: NEKO_C.warn, fontFamily: 'Geist Mono, monospace', fontSize: 8, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
            Bonus
          </div>
          <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 9, color: NEKO_C.warn, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Series · 2024 · 8 ep</div>
          <div style={{
            flex: 1, borderRadius: 8, background: NEKO_C.surface2,
            display: 'flex', alignItems: 'flex-end', padding: 14,
          }}>
            <div style={{ fontFamily: 'Fraunces, serif', fontStyle: 'italic', fontSize: 24, color: NEKO_C.ink, letterSpacing: '-0.015em', lineHeight: 1.1 }}>
              파친코<br/>시즌 2
            </div>
          </div>
          <div>
            <div style={{ fontFamily: 'Fraunces, serif', fontStyle: 'italic', fontSize: 18, color: NEKO_C.ink, letterSpacing: '-0.01em' }}>파친코 시즌 2</div>
            <div style={{ fontSize: 11, color: NEKO_C.inkDim, marginTop: 4, lineHeight: 1.5 }}>긴 호흡, 세대를 가로지르는 이야기. 한 번에 보기엔 무거워요</div>
          </div>
        </div>
      </div>

      {/* Soft warning footer */}
      <div style={{
        margin: '0 22px 16px', padding: '10px 12px',
        borderRadius: 8, background: NEKO_C.surface, border: `1px solid ${NEKO_C.hair}`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{ fontFamily: 'Fraunces, serif', fontStyle: 'italic', fontSize: 18, color: NEKO_C.warn, lineHeight: 1 }}>※</div>
        <div style={{ flex: 1, fontSize: 11, color: NEKO_C.inkDim, lineHeight: 1.5, letterSpacing: '-0.005em' }}>
          많이 볼수록 고르기 어려워져요.<br/>
          이게 그 증거.
        </div>
        <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 9, color: NEKO_C.amber, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}>그만</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────────────────────
window.NekoEdgeCases = {
  // Loading
  LoadingDiscover, LoadingSaved, LoadingDetail, LoadingSavedSync,
  // Network
  OfflineBanner, NetworkErrorFull, ImageFailedCard,
  // Exhausted
  ExhaustedToday, ExhaustedExtra,
  // Primitives
  Skel, LoadingDots,
};

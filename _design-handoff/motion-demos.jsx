// motion-demos.jsx — interactive UI component motion demos
// Each demo card shows a real micro-interaction. Click/hover to play.

const { useReplay, cubic } = window.NekoMotion;

// Shared demo card chrome
function DemoFrame({ title, code, height = 220, speedMul, children, onClick, controls }) {
  return (
    <div style={{
      background: '#1A1916', border: '1px solid #2E2D27', borderRadius: 12,
      overflow: 'hidden', display: 'flex', flexDirection: 'column',
      width: '100%', height: '100%',
    }}>
      <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid #1F1E1A',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: 'Pretendard Variable', fontSize: 13, color: '#EDEDEF', fontWeight: 600, letterSpacing: '-0.01em' }}>{title}</span>
        {controls}
      </div>
      <div onClick={onClick} style={{
        flex: 1, minHeight: height, background: '#0B0A07', position: 'relative', overflow: 'hidden',
        cursor: onClick ? 'pointer' : 'default', userSelect: 'none', touchAction: 'none',
      }}>
        {children}
      </div>
      {code && (
        <div style={{ padding: '8px 14px', background: '#0B0A07', borderTop: '1px solid #1F1E1A',
                      fontFamily: 'Geist Mono', fontSize: 10.5, color: '#8E8F9A', lineHeight: 1.6,
                      whiteSpace: 'pre-wrap', overflow: 'hidden' }}>
          {code}
        </div>
      )}
    </div>
  );
}

// 1. Card swipe — drag, snap-back, exit, pass overlay
function SwipeDemo({ speedMul = 1 }) {
  const [dx, setDx] = React.useState(0);
  const [exiting, setExiting] = React.useState(null); // 'left' | 'right' | null
  const [k, setK] = React.useState(0);
  const startRef = React.useRef(0);
  const draggingRef = React.useRef(false);

  const reset = () => { setDx(0); setExiting(null); setK(x => x+1); };

  const onDown = (e) => {
    if (exiting) return;
    draggingRef.current = true;
    startRef.current = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e) => {
    if (!draggingRef.current) return;
    setDx(e.clientX - startRef.current);
  };
  const onUp = (e) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const final = e.clientX - startRef.current;
    if (Math.abs(final) > 80) {
      setExiting(final > 0 ? 'right' : 'left');
      setTimeout(reset, 250 * speedMul + 100);
    } else {
      setDx(0);
    }
  };

  const rot = Math.sign(dx) * Math.min(Math.abs(dx) * 0.08, 12);
  const baseTransform = exiting
    ? (exiting === 'right' ? 'translateX(140%) rotate(8deg)' : 'translateX(-140%) rotate(-8deg)')
    : `translateX(${dx}px) rotate(${rot}deg)`;
  const transition = draggingRef.current ? 'none'
    : exiting ? `transform ${250*speedMul}ms cubic-bezier(0.5, 0, 0.75, 0)`
    : `transform ${350*speedMul}ms cubic-bezier(0.34, 1.3, 0.64, 1)`;

  return (
    <DemoFrame title="카드 스와이프" speedMul={speedMul}
      code={`/* drag → release → snap-back */\ntransition: transform 350ms var(--ease-spring);\n\n/* drag past 80px → exit */\ntransition: transform 250ms var(--ease-exit);`}>
      <div style={{ position: 'absolute', inset: 0, padding: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div key={k}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          style={{
            width: 140, height: 180, borderRadius: 12,
            background: 'linear-gradient(180deg, #2E2D27 0%, #1A1916 100%)',
            border: '1px solid #3A3833',
            transform: baseTransform, transition,
            position: 'relative', cursor: 'grab', touchAction: 'none',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}>
          {/* pass / save overlay */}
          {dx > 20 && <div style={{ position: 'absolute', inset: 0, borderRadius: 12, background: 'rgba(196,163,90,0.18)', pointerEvents: 'none' }}/>}
          {dx < -20 && <div style={{ position: 'absolute', inset: 0, borderRadius: 12, background: 'rgba(224,90,79,0.22)', pointerEvents: 'none' }}/>}
          <div style={{ position: 'absolute', bottom: 14, left: 14, right: 14 }}>
            <div style={{ fontFamily: 'Instrument Serif', fontSize: 18, color: '#EDEDEF', lineHeight: 1.1 }}>Swipe me</div>
            <div style={{ fontFamily: 'Pretendard Variable', fontSize: 10, color: '#6B6C75', marginTop: 4 }}>좌/우 드래그</div>
          </div>
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: 8, left: 14, right: 14, display: 'flex', justifyContent: 'space-between', fontFamily: 'Geist Mono', fontSize: 9, color: '#3A3833' }}>
        <span>← pass</span><span>save →</span>
      </div>
    </DemoFrame>
  );
}

// 2. Bottom sheet — open, close, drag, dim
function SheetDemo({ speedMul = 1 }) {
  const [open, setOpen] = React.useState(false);
  const [dragY, setDragY] = React.useState(0);
  const draggingRef = React.useRef(false);
  const startY = React.useRef(0);

  const onDown = (e) => {
    draggingRef.current = true; startY.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e) => {
    if (!draggingRef.current) return;
    setDragY(Math.max(0, e.clientY - startY.current));
  };
  const onUp = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (dragY > 60) setOpen(false);
    setDragY(0);
  };

  const sheetH = 160;
  const closedY = sheetH;
  const ty = open ? dragY : closedY;
  const dim = open ? Math.max(0, 1 - dragY / sheetH) : 0;

  return (
    <DemoFrame title="바텀시트"
      onClick={() => !draggingRef.current && setOpen(o => !o)}
      code={`/* 열림 */\ntransition: transform 350ms var(--ease-enter);\n/* 닫힘 */\ntransition: transform 250ms var(--ease-exit);\n/* dim follows translateY 1:1 */`}>
      <div style={{ position: 'absolute', inset: 0, padding: 14, color: '#6B6C75', fontFamily: 'Pretendard Variable', fontSize: 11, textAlign: 'center', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 16 }}>
        클릭해서 열기 / 닫기 · 핸들 드래그
      </div>
      {/* dim */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(18,17,14,0.85)', opacity: dim, transition: draggingRef.current ? 'none' : `opacity ${(open?350:250)*speedMul}ms cubic-bezier(0.4, 0, 0.2, 1)`, pointerEvents: 'none' }}/>
      {/* sheet */}
      <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, height: sheetH,
          background: '#1A1916', borderTopLeftRadius: 16, borderTopRightRadius: 16,
          border: '1px solid #2E2D27', borderBottom: 'none',
          transform: `translateY(${ty}px)`,
          transition: draggingRef.current ? 'none' : `transform ${(open?350:250)*speedMul}ms ${open ? 'cubic-bezier(0.25,1,0.5,1)' : 'cubic-bezier(0.5,0,0.75,0)'}`,
        }}
        onPointerDown={(e) => { e.stopPropagation(); onDown(e); }}
        onPointerMove={onMove}
        onPointerUp={onUp}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 6px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#3A3833' }}/>
        </div>
        <div style={{ padding: '8px 20px', fontFamily: 'Instrument Serif', fontSize: 22, color: '#EDEDEF' }}>Detail</div>
        <div style={{ padding: '0 20px', fontFamily: 'Pretendard Variable', fontSize: 12, color: '#8E8F9A', lineHeight: 1.5 }}>
          시트 내용. 핸들을 아래로 드래그하면 닫혀요.
        </div>
      </div>
    </DemoFrame>
  );
}

// 3. Toast
function ToastDemo({ speedMul = 1 }) {
  const [show, setShow] = React.useState(false);
  const trigger = () => {
    setShow(true);
    setTimeout(() => setShow(false), 2500);
  };
  return (
    <DemoFrame title="토스트" onClick={trigger}
      code={`/* 등장 */ 250ms var(--ease-enter)\n/* 체류 */ 2500ms\n/* 퇴장 */ 150ms var(--ease-exit)`}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B6C75', fontFamily: 'Pretendard Variable', fontSize: 11 }}>
        클릭해서 트리거
      </div>
      <div style={{
        position: 'absolute', top: 16, left: '50%', transform: `translateX(-50%) translateY(${show ? 0 : -8}px)`,
        opacity: show ? 1 : 0,
        transition: show
          ? `opacity ${250*speedMul}ms cubic-bezier(0.25,1,0.5,1), transform ${250*speedMul}ms cubic-bezier(0.25,1,0.5,1)`
          : `opacity ${150*speedMul}ms cubic-bezier(0.5,0,0.75,0), transform ${150*speedMul}ms cubic-bezier(0.5,0,0.75,0)`,
        background: '#24231E', color: '#EDEDEF',
        padding: '10px 14px', borderRadius: 10,
        border: '1px solid #3A3833',
        fontFamily: 'Pretendard Variable', fontSize: 12,
        boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
        pointerEvents: 'none',
      }}>
        저장했어요
      </div>
    </DemoFrame>
  );
}

// 4. Save button — pulse + color transition
function SaveDemo({ speedMul = 1 }) {
  const [saved, setSaved] = React.useState(false);
  const [pulse, setPulse] = React.useState(0);
  const toggle = () => {
    setSaved(s => !s);
    setPulse(p => p + 1);
  };
  return (
    <DemoFrame title="Save 버튼" onClick={toggle}
      code={`/* color */ 150ms var(--ease-soft)\n/* pulse */ scale(1) → 1.08 → 1\n  250ms var(--ease-spring)`}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <button key={pulse} style={{
          width: 56, height: 56, borderRadius: 28,
          background: saved ? '#C4A35A' : '#1A1916',
          border: `1px solid ${saved ? '#C4A35A' : '#3A3833'}`,
          cursor: 'pointer',
          transition: `background ${150*speedMul}ms cubic-bezier(0.4,0,0.2,1), border-color ${150*speedMul}ms cubic-bezier(0.4,0,0.2,1)`,
          animation: pulse > 0 ? `nekoPulse ${250*speedMul}ms cubic-bezier(0.34, 1.3, 0.64, 1)` : 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill={saved ? '#12110E' : 'none'} stroke={saved ? '#12110E' : '#8E8F9A'} strokeWidth="1.4" strokeLinecap="square">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
          </svg>
        </button>
      </div>
      <div style={{ position: 'absolute', bottom: 12, left: 0, right: 0, textAlign: 'center', color: '#6B6C75', fontFamily: 'Pretendard Variable', fontSize: 11 }}>
        {saved ? '저장됨' : '저장 안 됨'}
      </div>
    </DemoFrame>
  );
}

// 5. Skeleton + NeqSpinner
function SkeletonDemo({ speedMul = 1 }) {
  const [mode, setMode] = React.useState('skeleton'); // 'skeleton' | 'spinner'
  return (
    <DemoFrame title="스켈레톤 / 스피너"
      controls={
        <div style={{ display: 'flex', gap: 4, fontFamily: 'Geist Mono', fontSize: 10 }}>
          {['skeleton', 'spinner'].map(m => (
            <button key={m} onClick={() => setMode(m)} style={{
              border: 'none', cursor: 'pointer',
              background: mode === m ? 'rgba(196,163,90,0.12)' : 'transparent',
              color: mode === m ? '#C4A35A' : '#6B6C75',
              padding: '3px 8px', borderRadius: 6, fontFamily: 'inherit', fontSize: 'inherit',
            }}>{m}</button>
          ))}
        </div>
      }
      code={mode === 'skeleton'
        ? `/* 2s pulse — 조급하지 않은 호흡 */\n@keyframes skeleton-pulse {\n  0%, 100% { opacity: 1; }\n  50% { opacity: 0.4; }\n}`
        : `/* NeqSpinner — orbital pulsing dots */\n3 dots, 1.4s rotation\n   each dot pulses with phase offset`}>
      {mode === 'skeleton' ? (
        <div style={{ position: 'absolute', inset: 28, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ width: '60%', height: 16, borderRadius: 4, background: '#1F1E1A', animation: `nekoSkeletonPulse ${2000*speedMul}ms cubic-bezier(0.4,0,0.2,1) infinite` }}/>
          <div style={{ width: '90%', height: 12, borderRadius: 4, background: '#1F1E1A', animation: `nekoSkeletonPulse ${2000*speedMul}ms cubic-bezier(0.4,0,0.2,1) infinite`, animationDelay: '0.1s' }}/>
          <div style={{ width: '75%', height: 12, borderRadius: 4, background: '#1F1E1A', animation: `nekoSkeletonPulse ${2000*speedMul}ms cubic-bezier(0.4,0,0.2,1) infinite`, animationDelay: '0.2s' }}/>
          <div style={{ marginTop: 6, width: '100%', height: 60, borderRadius: 8, background: '#1F1E1A', animation: `nekoSkeletonPulse ${2000*speedMul}ms cubic-bezier(0.4,0,0.2,1) infinite`, animationDelay: '0.05s' }}/>
        </div>
      ) : (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 60, height: 60, position: 'relative', animation: `nekoSpin ${1400*speedMul}ms linear infinite` }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                position: 'absolute', top: '50%', left: '50%', width: 8, height: 8, borderRadius: 4,
                background: '#C4A35A',
                transform: `rotate(${i*120}deg) translateY(-22px)`,
                transformOrigin: 'center', marginTop: -4, marginLeft: -4,
                animation: `nekoOrbitPulse ${1400*speedMul}ms cubic-bezier(0.4,0,0.2,1) infinite`,
                animationDelay: `${i*0.15}s`,
              }}/>
            ))}
          </div>
        </div>
      )}
    </DemoFrame>
  );
}

// 6. Tab crossfade
function TabDemo({ speedMul = 1 }) {
  const [tab, setTab] = React.useState(0);
  const tabs = ['Discover', 'Saved', 'Profile'];
  return (
    <DemoFrame title="탭 크로스페이드"
      code={`/* slide 없이 fade만 */\ntransition: opacity 250ms var(--ease-soft);`}>
      <div style={{ position: 'absolute', top: 14, left: 14, right: 14, display: 'flex', gap: 4 }}>
        {tabs.map((t, i) => (
          <button key={t} onClick={() => setTab(i)} style={{
            flex: 1, padding: '7px 0', borderRadius: 6, border: 'none',
            background: i === tab ? 'rgba(196,163,90,0.12)' : 'transparent',
            color: i === tab ? '#C4A35A' : '#6B6C75',
            fontFamily: 'Pretendard Variable', fontSize: 11, fontWeight: 500, cursor: 'pointer',
            transition: `background 150ms cubic-bezier(0.4,0,0.2,1), color 150ms cubic-bezier(0.4,0,0.2,1)`,
          }}>{t}</button>
        ))}
      </div>
      <div style={{ position: 'absolute', top: 50, left: 14, right: 14, bottom: 14 }}>
        {tabs.map((t, i) => (
          <div key={t} style={{
            position: 'absolute', inset: 0,
            opacity: i === tab ? 1 : 0,
            transition: `opacity ${250*speedMul}ms cubic-bezier(0.4,0,0.2,1)`,
            pointerEvents: i === tab ? 'auto' : 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Instrument Serif', fontSize: 28, color: '#EDEDEF',
          }}>{t}</div>
        ))}
      </div>
    </DemoFrame>
  );
}

// 7. Button active feedback
function ButtonDemo({ speedMul = 1 }) {
  return (
    <DemoFrame title="버튼 active"
      code={`/* Quiet Ink — scale(0.97), NOT 0.9 */\ntransform: scale(0.97);\ntransition: 80ms var(--ease-soft);`}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <button className="neko-btn" style={{
          padding: '12px 28px', borderRadius: 12,
          background: '#C4A35A', color: '#12110E',
          border: 'none', cursor: 'pointer',
          fontFamily: 'Pretendard Variable', fontSize: 13, fontWeight: 600,
        }}>오늘 뭐 볼까?</button>
        <button className="neko-btn" style={{
          padding: '10px 22px', borderRadius: 12,
          background: '#1A1916', color: '#EDEDEF',
          border: '1px solid #3A3833', cursor: 'pointer',
          fontFamily: 'Pretendard Variable', fontSize: 12, fontWeight: 500,
        }}>Secondary</button>
        <div style={{ fontFamily: 'Pretendard Variable', fontSize: 10, color: '#6B6C75', marginTop: 4 }}>
          버튼 누르고 있기
        </div>
      </div>
      <style>{`.neko-btn{transition:transform ${80*speedMul}ms cubic-bezier(0.4,0,0.2,1)}.neko-btn:active{transform:scale(0.97)}`}</style>
    </DemoFrame>
  );
}

// 8. Reaction picker — staggered button entrance
function ReactionDemo({ speedMul = 1 }) {
  const [open, setOpen] = React.useState(false);
  const [k, setK] = React.useState(0);
  const trigger = () => { setOpen(true); setK(x => x+1); };
  const reactions = [
    { l: '인생작',  bg: 'rgba(196,163,90,0.12)', c: '#C4A35A', b: '1px solid rgba(196,163,90,0.25)' },
    { l: '괜찮았어', bg: '#1A1916', c: '#8E8F9A', b: '1px solid #2E2D27' },
    { l: '별로였어', bg: '#1A1916', c: '#6B6C75', b: '1px solid #2E2D27' },
    { l: '안 맞았어', bg: 'rgba(224,90,79,0.14)', c: '#E05A4F', b: '1px solid rgba(224,90,79,0.2)' },
  ];
  return (
    <DemoFrame title="Reaction picker"
      onClick={() => open ? setOpen(false) : trigger()}
      code={`/* staggered: 50ms delay each */\nopacity 0→1, translateY 6px→0\n  250ms var(--ease-enter)`}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        {!open && <div style={{ color: '#6B6C75', fontFamily: 'Pretendard Variable', fontSize: 11 }}>탭해서 본 적 있는지 응답</div>}
        {open && (
          <>
            <div style={{ fontFamily: 'Instrument Serif', fontSize: 18, color: '#EDEDEF', marginBottom: 4 }}>본 적 있나요?</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', maxWidth: 240 }}>
              {reactions.map((r, i) => (
                <button key={`${k}-${i}`} style={{
                  padding: '7px 12px', fontSize: 11, fontWeight: 500,
                  fontFamily: 'Pretendard Variable',
                  background: r.bg, color: r.c, border: r.b, borderRadius: 10,
                  cursor: 'pointer',
                  animation: `nekoReactionEnter ${250*speedMul}ms cubic-bezier(0.25,1,0.5,1) backwards`,
                  animationDelay: `${i * 50 * speedMul}ms`,
                }}>{r.l}</button>
              ))}
            </div>
          </>
        )}
      </div>
    </DemoFrame>
  );
}

window.NekoMotionDemos = { SwipeDemo, SheetDemo, ToastDemo, SaveDemo, SkeletonDemo, TabDemo, ButtonDemo, ReactionDemo };

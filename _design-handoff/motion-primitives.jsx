// motion-primitives.jsx — easing/duration token cards + helpers
// Quiet Ink motion language. Each card visualizes one token.

const EASINGS = [
  { name: 'enter',  bezier: [0.25, 1, 0.5, 1],     desc: '부드러운 감속. 도착점에서 자연스럽게.', use: '요소 등장, 시트 열림, 모달' },
  { name: 'exit',   bezier: [0.5, 0, 0.75, 0],     desc: '점점 빨라지며 퇴장.',                use: '시트 닫힘, 카드 날아감' },
  { name: 'move',   bezier: [0.45, 0, 0.55, 1],    desc: '대칭 가속-감속.',                   use: '위치 이동, 레이아웃 변경' },
  { name: 'spring', bezier: [0.34, 1.3, 0.64, 1],  desc: '미세한 오버슈트 — 30%. 절제된 스프링.', use: '카드 스냅백, 제스처 릴리즈' },
  { name: 'soft',   bezier: [0.4, 0, 0.2, 1],      desc: 'Material standard. 범용 부드러움.',   use: 'opacity, 색상, 미세 변화' },
];

const DURATIONS = [
  { name: 'instant',  ms: 80,  desc: '즉각 피드백',          use: '버튼 active, 탭, 토글' },
  { name: 'quick',    ms: 150, desc: '빠른 상태 변화',        use: '필터 칩, 드롭다운, 색상' },
  { name: 'moderate', ms: 250, desc: '표준 전환',            use: '페이드, 토스트, 오버레이' },
  { name: 'steady',   ms: 350, desc: '공간적 이동',          use: '바텀시트, 카드 스냅백' },
  { name: 'slow',     ms: 500, desc: '대형 전환',            use: '풀스크린, 온보딩 스텝' },
];

// CSS bezier string from [a,b,c,d]
const cubic = ([a,b,c,d]) => `cubic-bezier(${a}, ${b}, ${c}, ${d})`;

// Trigger replay: bump a key/state to remount the moving element.
function useReplay() {
  const [k, setK] = React.useState(0);
  return [k, () => setK(x => x + 1)];
}

// ── Easing curve sparkline ──────────────────────────────────
// Draws a 0..1 -> 0..1 cubic-bezier curve as a polyline.
function EaseCurve({ bezier, w = 84, h = 60, color = '#C4A35A' }) {
  // sample y from JS — approximate via cubicBezier formula on (x1,y1,x2,y2)
  const [x1, y1, x2, y2] = bezier;
  // Solve for t at given x via Newton-Raphson; return y at that t.
  const sampleY = (xTarget) => {
    const fx = (t) => 3*(1-t)*(1-t)*t*x1 + 3*(1-t)*t*t*x2 + t*t*t;
    const fy = (t) => 3*(1-t)*(1-t)*t*y1 + 3*(1-t)*t*t*y2 + t*t*t;
    let t = xTarget;
    for (let i = 0; i < 8; i++) {
      const x = fx(t) - xTarget;
      const dx = 3*(1-t)*(1-t)*x1 + 6*(1-t)*t*(x2-x1) + 3*t*t*(1-x2);
      if (Math.abs(dx) < 1e-6) break;
      t = t - x/dx;
      if (t < 0) t = 0; if (t > 1) t = 1;
    }
    return fy(t);
  };
  const N = 32;
  const pts = Array.from({length: N+1}, (_,i) => {
    const x = i/N;
    const y = sampleY(x);
    return `${x*w},${h - y*h}`;
  }).join(' ');
  return (
    <svg width={w} height={h} viewBox={`-2 -8 ${w+4} ${h+16}`} style={{ display: 'block', overflow: 'visible' }}>
      {/* baseline grid */}
      <line x1="0" y1={h} x2={w} y2={h} stroke="#2E2D27" strokeWidth="0.5"/>
      <line x1="0" y1="0" x2="0" y2={h} stroke="#2E2D27" strokeWidth="0.5"/>
      <line x1="0" y1="0" x2={w} y2="0" stroke="#2E2D27" strokeWidth="0.5" strokeDasharray="2 3"/>
      {/* the curve */}
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="square"/>
      {/* control point handles */}
      <line x1="0" y1={h} x2={x1*w} y2={h - y1*h} stroke="#3A3833" strokeWidth="0.5"/>
      <line x1={w} y1="0" x2={x2*w} y2={h - y2*h} stroke="#3A3833" strokeWidth="0.5"/>
      <circle cx={x1*w} cy={h - y1*h} r="2" fill="#6B6C75"/>
      <circle cx={x2*w} cy={h - y2*h} r="2" fill="#6B6C75"/>
    </svg>
  );
}

// ── Easing card ─────────────────────────────────────────────
function EasingCard({ ease, speedMul = 1 }) {
  const [k, replay] = useReplay();
  const dur = 900 * speedMul;
  return (
    <div onClick={replay} style={{
      background: '#1A1916', border: '1px solid #2E2D27', borderRadius: 12,
      padding: 14, cursor: 'pointer', position: 'relative', overflow: 'hidden',
      transition: 'border-color 150ms cubic-bezier(0.4, 0, 0.2, 1)',
    }} onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(196,163,90,0.25)'}
       onMouseLeave={e => e.currentTarget.style.borderColor = '#2E2D27'}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ fontFamily: 'Geist Mono', fontSize: 13, color: '#C4A35A', fontWeight: 500 }}>--ease-{ease.name}</span>
        <span style={{ fontFamily: 'Geist Mono', fontSize: 10, color: '#6B6C75', fontVariantNumeric: 'tabular-nums' }}>
          {ease.bezier.join(', ')}
        </span>
      </div>
      <div style={{ fontSize: 11, color: '#8E8F9A', marginBottom: 12, lineHeight: 1.5 }}>{ease.desc}</div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <EaseCurve bezier={ease.bezier}/>
        {/* moving dot */}
        <div style={{ flex: 1, position: 'relative', height: 60, background: '#0B0A07', borderRadius: 8, overflow: 'hidden' }}>
          <div key={k} style={{
            position: 'absolute', top: '50%', left: 6, width: 14, height: 14,
            borderRadius: 7, background: '#C4A35A', marginTop: -7,
            animation: `moveX ${dur}ms ${cubic(ease.bezier)} forwards`,
            ['--moveTo']: 'calc(100% - 26px)',
          }}/>
        </div>
      </div>
      <div style={{ marginTop: 10, fontSize: 10, color: '#6B6C75', fontFamily: 'Pretendard Variable' }}>
        {ease.use}
      </div>
    </div>
  );
}

// ── Duration card ───────────────────────────────────────────
function DurationCard({ dur, speedMul = 1 }) {
  const [k, replay] = useReplay();
  const ms = dur.ms * speedMul;
  return (
    <div onClick={replay} style={{
      background: '#1A1916', border: '1px solid #2E2D27', borderRadius: 12,
      padding: 14, cursor: 'pointer', overflow: 'hidden',
      transition: 'border-color 150ms cubic-bezier(0.4, 0, 0.2, 1)',
    }} onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(196,163,90,0.25)'}
       onMouseLeave={e => e.currentTarget.style.borderColor = '#2E2D27'}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontFamily: 'Geist Mono', fontSize: 13, color: '#C4A35A', fontWeight: 500 }}>--duration-{dur.name}</span>
        <span style={{ fontFamily: 'Geist Mono', fontSize: 11, color: '#EDEDEF', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
          {dur.ms}ms
        </span>
      </div>
      <div style={{ fontSize: 11, color: '#8E8F9A', marginBottom: 12, lineHeight: 1.5 }}>{dur.desc}</div>

      {/* progress bar — runs at this duration */}
      <div style={{ height: 4, background: '#0B0A07', borderRadius: 2, overflow: 'hidden', position: 'relative' }}>
        <div key={k} style={{
          position: 'absolute', inset: 0, background: '#C4A35A', transformOrigin: 'left',
          animation: `growX ${ms}ms cubic-bezier(0.4, 0, 0.2, 1) forwards`,
        }}/>
      </div>
      <div style={{ marginTop: 10, fontSize: 10, color: '#6B6C75', fontFamily: 'Pretendard Variable' }}>
        {dur.use}
      </div>
    </div>
  );
}

window.NekoMotion = { EASINGS, DURATIONS, EaseCurve, EasingCard, DurationCard, cubic, useReplay };

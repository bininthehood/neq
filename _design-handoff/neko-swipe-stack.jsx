// neko-swipe-stack.jsx — 4-direction swipe demo with card stack
// Wraps any card variant. Drag the top card to see direction-based animations.
//
// Directions:
//   left   → next card (slide off-screen left)
//   right  → previous card (slides in from top)
//   up     → open detail sheet (lift up + fade)
//   down   → save (absorb into Save button bottom-right)
//   tap    → open detail sheet
//
// Stack: 3 cards visible. depth scale = 1 - depth*0.04, yOffset = depth*12

const { useState, useRef, useEffect } = React;

const HAPTIC_HINT_DURATION = 250;

function SwipeStack({ works, CardComponent, w = 300, h = 460 }) {
  const [topIdx, setTopIdx] = useState(0);
  const [history, setHistory] = useState([]); // for "previous" (right swipe)
  const [drag, setDrag] = useState({ x: 0, y: 0, dragging: false });
  const [exit, setExit] = useState(null); // { dir, idx }
  const [savedFlash, setSavedFlash] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(null);
  const startRef = useRef(null);

  const len = works.length;
  const cur = works[topIdx % len];

  // build visible stack: top + 2 behind
  const stack = [0, 1, 2].map(d => ({
    work: works[(topIdx + d) % len],
    depth: d,
    key: `${topIdx + d}-${d}`,
  }));

  function onPointerDown(e) {
    if (exit) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    startRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    setDrag({ x: 0, y: 0, dragging: true });
  }
  function onPointerMove(e) {
    if (!startRef.current) return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    setDrag({ x: dx, y: dy, dragging: true });
  }
  function onPointerUp(e) {
    if (!startRef.current) { setDrag({ x: 0, y: 0, dragging: false }); return; }
    const dx = drag.x;
    const dy = drag.y;
    const dt = Date.now() - startRef.current.t;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    const TAP = 8;
    const THRESH = 70;
    startRef.current = null;

    // tap
    if (absX < TAP && absY < TAP && dt < 300) {
      setDrag({ x: 0, y: 0, dragging: false });
      setSheetOpen(cur);
      return;
    }
    // dominant axis
    let dir = null;
    if (absX > absY) {
      if (dx < -THRESH) dir = 'left';
      else if (dx > THRESH) dir = 'right';
    } else {
      if (dy < -THRESH) dir = 'up';
      else if (dy > THRESH) dir = 'down';
    }
    if (!dir) {
      // snap back
      setDrag({ x: 0, y: 0, dragging: false });
      return;
    }
    // perform action
    if (dir === 'left') {
      setExit({ dir, idx: topIdx });
      setTimeout(() => {
        setHistory(h => [...h, topIdx]);
        setTopIdx(i => (i + 1) % len);
        setExit(null);
        setDrag({ x: 0, y: 0, dragging: false });
      }, 360);
    } else if (dir === 'right') {
      setExit({ dir, idx: topIdx });
      setTimeout(() => {
        setTopIdx(i => (i - 1 + len) % len);
        setHistory(h => h.slice(0, -1));
        setExit(null);
        setDrag({ x: 0, y: 0, dragging: false });
      }, 360);
    } else if (dir === 'up') {
      setExit({ dir, idx: topIdx });
      setTimeout(() => {
        setSheetOpen(cur);
        setExit(null);
        setDrag({ x: 0, y: 0, dragging: false });
      }, 280);
    } else if (dir === 'down') {
      setExit({ dir, idx: topIdx });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 600);
      setTimeout(() => {
        setHistory(h => [...h, topIdx]);
        setTopIdx(i => (i + 1) % len);
        setExit(null);
        setDrag({ x: 0, y: 0, dragging: false });
      }, 480);
    }
  }

  // compute exit transform
  function exitTransform() {
    if (!exit) return null;
    if (exit.dir === 'left')  return { x: -window.innerWidth, y: 0,  rot: -8, opacity: 0, scale: 0.95 };
    if (exit.dir === 'right') return { x:  window.innerWidth, y: 0,  rot:  8, opacity: 0, scale: 0.95 };
    if (exit.dir === 'up')    return { x: 0, y: -240, rot: 0, opacity: 0.4, scale: 0.92 };
    if (exit.dir === 'down')  return { x: w/2 - 28, y: h - 40, rot: -3, opacity: 0, scale: 0.12 };
    return null;
  }

  const exitT = exitTransform();
  const dragRot = drag.dragging ? drag.x * 0.04 : 0;

  return (
    <div style={{
      position: 'relative', width: w + 80, height: h + 80,
      background: '#12110E', padding: 40, borderRadius: 20,
      overflow: 'hidden',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    }}>
      {/* Direction hints — corners */}
      <DirHints drag={drag} w={w} h={h}/>

      {/* Stack — render bottom-up, top last */}
      {stack.slice().reverse().map(({ work, depth, key }) => {
        const isTop = depth === 0;
        const baseScale = 1 - depth * 0.05;
        const baseY = depth * 14;
        let tx = 0, ty = baseY, rot = 0, opacity = 1, scale = baseScale;

        if (isTop) {
          if (exitT) {
            tx = exitT.x; ty = exitT.y; rot = exitT.rot;
            opacity = exitT.opacity; scale = exitT.scale;
          } else {
            tx = drag.x; ty = drag.y; rot = dragRot;
          }
        }

        return (
          <div key={key}
            onPointerDown={isTop && !exit ? onPointerDown : undefined}
            onPointerMove={isTop && !exit ? onPointerMove : undefined}
            onPointerUp={isTop && !exit ? onPointerUp : undefined}
            onPointerCancel={isTop && !exit ? onPointerUp : undefined}
            style={{
              position: 'absolute', top: 40, left: '50%', marginLeft: -w/2,
              transform: `translate(${tx}px, ${ty}px) rotate(${rot}deg) scale(${scale})`,
              transformOrigin: 'center center',
              opacity,
              transition: exit
                ? 'transform 360ms cubic-bezier(0.5,0,0.75,0), opacity 360ms cubic-bezier(0.5,0,0.75,0)'
                : drag.dragging
                  ? 'none'
                  : 'transform 250ms cubic-bezier(0.34,1.3,0.64,1), opacity 250ms ease',
              touchAction: 'none', cursor: isTop ? 'grab' : 'default',
              zIndex: 10 - depth, willChange: 'transform',
            }}>
            <CardComponent work={work} w={w} h={h}/>
          </div>
        );
      })}

      {/* Save button bottom-right — animates on down-swipe */}
      <SaveButton flash={savedFlash} pulling={drag.y > 30 && drag.dragging}/>

      {/* Detail sheet */}
      {sheetOpen && (
        <DetailSheet work={sheetOpen} onClose={() => setSheetOpen(null)}/>
      )}
    </div>
  );
}

function DirHints({ drag, w, h }) {
  const intensity = (axis, sign) => {
    const v = axis === 'x' ? drag.x : drag.y;
    if (sign > 0) return Math.max(0, Math.min(1, v / 100));
    return Math.max(0, Math.min(1, -v / 100));
  };
  const o = {
    left:  intensity('x', -1),
    right: intensity('x', 1),
    up:    intensity('y', -1),
    down:  intensity('y', 1),
  };
  // show hint only on dominant axis to avoid noise
  const absX = Math.abs(drag.x), absY = Math.abs(drag.y);
  const showHorizontal = absX > absY;
  const dim = (k) => {
    if (k === 'left' || k === 'right') return showHorizontal ? o[k] : 0;
    return showHorizontal ? 0 : o[k];
  };
  const tag = (label, sub, active, pos) => (
    <div style={{
      position: 'absolute', ...pos,
      fontFamily: 'Geist Mono, monospace', fontSize: 9, letterSpacing: '0.1em',
      textTransform: 'uppercase', color: active > 0.05 ? '#C4A35A' : '#3A3833',
      opacity: 0.4 + active * 0.6,
      transition: 'color 120ms, opacity 120ms',
      textAlign: 'center', whiteSpace: 'nowrap',
    }}>
      <div style={{ fontSize: 9, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 8, marginTop: 2, fontFamily: 'Pretendard Variable', letterSpacing: 0 }}>{sub}</div>
    </div>
  );
  return (<>
    {tag('← LEFT',  '다음',  dim('left'),  { left: 16, top: '50%', transform: 'translateY(-50%) rotate(-90deg)' })}
    {tag('RIGHT →', '이전',  dim('right'), { right: 16, top: '50%', transform: 'translateY(-50%) rotate(90deg)' })}
    {tag('↑ UP',    '상세',  dim('up'),    { left: '50%', top: 12, transform: 'translateX(-50%)' })}
    {tag('↓ DOWN',  '저장',  dim('down'),  { left: '50%', bottom: 12, transform: 'translateX(-50%)' })}
  </>);
}

function SaveButton({ flash, pulling }) {
  return (
    <div style={{
      position: 'absolute', right: 24, bottom: 24,
      width: 56, height: 56, borderRadius: 16,
      background: flash || pulling ? '#C4A35A' : '#1A1916',
      border: `1.5px solid ${flash || pulling ? '#C4A35A' : '#2E2D27'}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transform: `scale(${flash ? 1.15 : pulling ? 1.05 : 1})`,
      transition: 'transform 250ms cubic-bezier(0.34,1.3,0.64,1), background 200ms, border-color 200ms',
      boxShadow: flash ? '0 0 32px rgba(196,163,90,0.6), 0 4px 16px rgba(0,0,0,0.4)' : '0 4px 16px rgba(0,0,0,0.3)',
      zIndex: 20,
    }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill={flash || pulling ? '#12110E' : '#C4A35A'}>
        <path d="M12 21s-7-4.5-9.5-9C0.7 8.5 2.5 4 6 4c2 0 3.5 1 4 2 0.5-1 2-2 4-2 3.5 0 5.3 4.5 3.5 8C19 16.5 12 21 12 21z"/>
      </svg>
    </div>
  );
}

function DetailSheet({ work, onClose }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 30,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'flex-end',
      animation: 'neko-fade 200ms ease',
    }} onClick={onClose}>
      <div style={{
        width: '100%', maxHeight: '85%', background: '#1A1916',
        borderTopLeftRadius: 20, borderTopRightRadius: 20,
        padding: 20, color: '#EDEDEF', overflow: 'auto',
        animation: 'neko-rise 280ms cubic-bezier(0.25,1,0.5,1)',
        borderTop: '1px solid #2E2D27',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ width: 36, height: 4, background: '#3A3833', borderRadius: 2, margin: '0 auto 16px' }}/>
        <div style={{ fontFamily: 'Fraunces, serif', fontSize: 11, fontStyle: 'italic', color: '#C4A35A', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>{work.titleEn} · {work.year}</div>
        <div style={{ fontFamily: 'Pretendard Variable', fontSize: 24, fontWeight: 700, letterSpacing: '-0.025em', marginBottom: 12 }}>{work.title}</div>
        <div style={{ fontFamily: 'Pretendard Variable', fontSize: 13, lineHeight: 1.55, color: 'rgba(237,237,239,0.85)', marginBottom: 16 }}>{work.overview}</div>
        <div style={{ fontFamily: 'Geist Mono', fontSize: 10, color: '#6B6C75', letterSpacing: '0.05em', marginBottom: 6 }}>감독 · 주연</div>
        <div style={{ fontFamily: 'Pretendard Variable', fontSize: 13, color: '#EDEDEF', marginBottom: 14 }}>{work.director} · {work.cast.slice(0, 3).join(', ')}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
          {work.genres.map(g => (
            <span key={g} style={{ padding: '4px 10px', borderRadius: 999, fontSize: 11, fontFamily: 'Pretendard Variable', background: '#24231E', color: '#8E8F9A', border: '1px solid #2E2D27' }}>{g}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

window.NekoSwipeStack = SwipeStack;

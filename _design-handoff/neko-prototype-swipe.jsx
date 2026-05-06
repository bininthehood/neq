// neko-prototype-swipe.jsx — Swipe stack (3-way + tap)
// Round 1 decision: drop ↑ swipe; detail is tap-only.
//   tap          — onDetail(work)
//   ← swipe      — onPass(work)
//   → swipe      — onBack(work)
//   ↓ swipe      — onSave(work)  (with absorb animation)

(function() {
const { useState, useRef } = React;

function PrototypeSwipeStack({ works, CardComponent, w = 300, h = 460, onDetail, onSave, onPass, onBack }) {
  const [topIdx, setTopIdx] = useState(0);
  const [drag, setDrag] = useState({ x: 0, y: 0, dragging: false });
  const [exit, setExit] = useState(null);
  const [saveFlash, setSaveFlash] = useState(false);
  const startRef = useRef(null);

  const len = works.length;
  const cur = works[topIdx % len];
  const stack = [0, 1, 2].map(d => ({
    work: works[(topIdx + d) % len], depth: d, key: `${topIdx + d}-${d}`,
  }));

  function onPointerDown(e) {
    if (exit) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    startRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    setDrag({ x: 0, y: 0, dragging: true });
  }
  function onPointerMove(e) {
    if (!startRef.current) return;
    setDrag({ x: e.clientX - startRef.current.x, y: e.clientY - startRef.current.y, dragging: true });
  }
  function onPointerUp() {
    if (!startRef.current) { setDrag({ x: 0, y: 0, dragging: false }); return; }
    const dx = drag.x, dy = drag.y;
    const dt = Date.now() - startRef.current.t;
    const absX = Math.abs(dx), absY = Math.abs(dy);
    startRef.current = null;
    const TAP = 8, THRESH = 70;

    if (absX < TAP && absY < TAP && dt < 300) {
      setDrag({ x: 0, y: 0, dragging: false });
      onDetail && onDetail(cur);
      return;
    }
    let dir = null;
    if (absX > absY) {
      if (dx < -THRESH) dir = 'left';
      else if (dx > THRESH) dir = 'right';
    } else {
      // 3-way: ↑ disabled. only ↓ vertical.
      if (dy > THRESH) dir = 'down';
    }
    if (!dir) { setDrag({ x: 0, y: 0, dragging: false }); return; }

    if (dir === 'left') {
      setExit({ dir, idx: topIdx });
      setTimeout(() => {
        setTopIdx(i => (i + 1) % len);
        setExit(null); setDrag({ x: 0, y: 0, dragging: false });
        onPass && onPass(cur);
      }, 360);
    } else if (dir === 'right') {
      setExit({ dir, idx: topIdx });
      setTimeout(() => {
        setTopIdx(i => (i - 1 + len) % len);
        setExit(null); setDrag({ x: 0, y: 0, dragging: false });
        onBack && onBack(cur);
      }, 360);
    } else if (dir === 'down') {
      setExit({ dir, idx: topIdx });
      setSaveFlash(true);
      setTimeout(() => setSaveFlash(false), 600);
      setTimeout(() => {
        setTopIdx(i => (i + 1) % len);
        setExit(null); setDrag({ x: 0, y: 0, dragging: false });
        onSave && onSave(cur);
      }, 480);
    }
  }

  function exitT() {
    if (!exit) return null;
    if (exit.dir === 'left')  return { x: -460, y: 0, rot: -8, opacity: 0, scale: 0.95 };
    if (exit.dir === 'right') return { x:  460, y: 0, rot:  8, opacity: 0, scale: 0.95 };
    if (exit.dir === 'up')    return { x: 0, y: -240, rot: 0, opacity: 0.4, scale: 0.92 };
    if (exit.dir === 'down')  return { x: w/2 - 28, y: h - 40, rot: -3, opacity: 0, scale: 0.12 };
    return null;
  }
  const eT = exitT();
  const dragRot = drag.dragging ? drag.x * 0.04 : 0;

  // intensity for hint glow (3-way)
  const hint = {
    left:  Math.max(0, Math.min(1, -drag.x / 100)),
    right: Math.max(0, Math.min(1,  drag.x / 100)),
    down:  Math.max(0, Math.min(1,  drag.y / 100)),
  };

  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
      paddingTop: 16,
    }}>
      {/* hint dots */}
      <Hint side="left"  intensity={hint.left}  label="Pass"/>
      <Hint side="right" intensity={hint.right} label="Back"/>
      <Hint side="down"  intensity={hint.down}  label="Save"/>

      {stack.slice().reverse().map(({ work, depth, key }) => {
        const isTop = depth === 0;
        const baseScale = 1 - depth * 0.05;
        const baseY = depth * 14;
        let tx = 0, ty = baseY, rot = 0, opacity = 1, scale = baseScale;
        if (isTop) {
          if (eT) { tx = eT.x; ty = eT.y; rot = eT.rot; opacity = eT.opacity; scale = eT.scale; }
          else    { tx = drag.x; ty = drag.y; rot = dragRot; }
        }
        return (
          <div key={key}
            onPointerDown={isTop && !exit ? onPointerDown : undefined}
            onPointerMove={isTop && !exit ? onPointerMove : undefined}
            onPointerUp={isTop && !exit ? onPointerUp : undefined}
            onPointerCancel={isTop && !exit ? onPointerUp : undefined}
            style={{
              position: 'absolute', top: '50%', left: '50%',
              marginLeft: -w/2, marginTop: -h/2,
              transform: `translate(${tx}px, ${ty}px) rotate(${rot}deg) scale(${scale})`,
              transformOrigin: 'center', opacity,
              transition: exit
                ? 'transform 360ms cubic-bezier(0.5,0,0.75,0), opacity 360ms'
                : drag.dragging ? 'none' : 'transform 250ms cubic-bezier(0.34,1.3,0.64,1)',
              touchAction: 'none', cursor: isTop ? 'grab' : 'default',
              zIndex: 10 - depth, willChange: 'transform',
            }}>
            <CardComponent work={work} w={w} h={h}/>
          </div>
        );
      })}

      {/* Save flash */}
      {saveFlash && (
        <div style={{
          position: 'absolute', bottom: 90, left: '50%', transform: 'translateX(-50%)',
          padding: '8px 14px', borderRadius: 16,
          background: '#C4A35A', color: '#0B0A07',
          fontFamily: 'Pretendard Variable', fontSize: 12, fontWeight: 600,
          animation: 'save-flash 0.6s ease-out',
          zIndex: 100,
        }}>✓ Saved</div>
      )}
      <style>{`@keyframes save-flash { 0% { opacity: 0; transform: translateX(-50%) translateY(8px); } 50% { opacity: 1; transform: translateX(-50%) translateY(0); } 100% { opacity: 0; transform: translateX(-50%) translateY(-8px); } }`}</style>
    </div>
  );
}

function Hint({ side, intensity, label }) {
  const pos = {
    left:  { left: 12,   top: '50%',    transform: 'translateY(-50%)' },
    right: { right: 12,  top: '50%',    transform: 'translateY(-50%)' },
    up:    { top: 12,    left: '50%',   transform: 'translateX(-50%)' },
    down:  { bottom: 12, left: '50%',   transform: 'translateX(-50%)' },
  }[side];
  return (
    <div style={{
      position: 'absolute', ...pos,
      padding: '4px 8px', borderRadius: 4,
      background: `rgba(196,163,90,${0.15 + intensity * 0.7})`,
      color: '#C4A35A', opacity: 0.4 + intensity * 0.6,
      fontFamily: 'Geist Mono, ui-monospace, monospace', fontSize: 9,
      letterSpacing: '0.1em', textTransform: 'uppercase',
      transition: 'opacity 0.15s, background 0.15s',
      pointerEvents: 'none', zIndex: 50,
    }}>{label}</div>
  );
}

window.NekoPrototypeSwipeStack = PrototypeSwipeStack;
})();

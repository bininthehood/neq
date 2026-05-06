// ──────────────────────────────────────────────────────────
// neko-toast.jsx — R3 v2 Toast system
//
// 6 types defined in Round 3 v2:
//   T-01 save       — Swipe Down on Discover
//   T-02 pass       — Swipe Left on Discover
//   T-03 remove     — Remove from Saved
//   T-04 watched    — Mark as Watched on Detail
//   T-05 sync-warn  — Offline save queued
//   T-06 error      — Save failed
//
// Usage:
//   const [toast, showToast] = useToast();
//   showToast('save', { title: 'Past Lives', onUndo: () => {...} });
//   <ToastHost toast={toast} onDismiss={() => showToast(null)}/>
// ──────────────────────────────────────────────────────────

(function() {
const { useState, useEffect, useRef, useCallback } = React;

const TC = {
  bg:        '#1A1812',
  bgWarn:    '#1F1A12',
  bgErr:     '#1F1414',
  border:    '#2A2823',
  borderAccent: '#C4A35A',
  ink:       '#EDEDEF',
  inkDim:    '#8E8F9A',
  amber:     '#C4A35A',
  warn:      '#D4A245',
  err:       '#C87A6C',
  ok:        '#9BBE94',
};

// Glyph per type — minimal monoline marks, not emoji
function ToastGlyph({ type }) {
  const sz = 18;
  const stroke = type === 'sync-warn' ? TC.warn :
                 type === 'error'     ? TC.err  :
                 type === 'remove'    ? TC.inkDim :
                 TC.amber;
  if (type === 'save') {
    return <svg width={sz} height={sz} viewBox="0 0 18 18" fill="none">
      <path d="M3 4.5L7 9L15 2" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>;
  }
  if (type === 'pass') {
    return <svg width={sz} height={sz} viewBox="0 0 18 18" fill="none">
      <path d="M3 9H14M14 9L10 5M14 9L10 13" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>;
  }
  if (type === 'remove') {
    return <svg width={sz} height={sz} viewBox="0 0 18 18" fill="none">
      <path d="M3 9H15" stroke={stroke} strokeWidth="1.6" strokeLinecap="round"/>
    </svg>;
  }
  if (type === 'watched') {
    return <svg width={sz} height={sz} viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="5" fill={stroke}/>
    </svg>;
  }
  if (type === 'sync-warn') {
    return <svg width={sz} height={sz} viewBox="0 0 18 18" fill="none">
      <path d="M3 9C3 5.7 5.7 3 9 3C11.3 3 13.3 4.3 14.3 6.3M15 9C15 12.3 12.3 15 9 15C6.7 15 4.7 13.7 3.7 11.7" stroke={stroke} strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M14 3V6.5H10.5M4 14.5V11H7.5" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>;
  }
  if (type === 'error') {
    return <svg width={sz} height={sz} viewBox="0 0 18 18" fill="none">
      <path d="M9 4V10M9 13V14" stroke={stroke} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>;
  }
  return null;
}

// Build copy for each type. Uses R3 v2 locked microcopy.
function getToastCopy(type, ctx = {}) {
  const title = ctx.title || '';
  switch (type) {
    case 'save':
      return { primary: '책장에 담았어요', secondary: title, action: '실행 취소' };
    case 'pass':
      return { primary: '다음 카드', secondary: '취향 학습에 반영해요', action: '되돌리기' };
    case 'remove':
      return { primary: '책장에서 뺐어요', secondary: title, action: '실행 취소' };
    case 'watched':
      return { primary: '봤음 표시', secondary: title ? `${title} · 좋았어요?` : '좋았어요?', action: '평가' };
    case 'sync-warn':
      return { primary: '연결되면 동기화돼요', secondary: ctx.pending ? `변경사항 ${ctx.pending}개 대기` : '변경사항 대기', action: null };
    case 'error':
      return { primary: '저장 못 했어요', secondary: '다시 시도하면 보통 돼요', action: '다시' };
    default:
      return { primary: '', secondary: '', action: null };
  }
}

// Single toast card
function ToastCard({ toast, onDismiss }) {
  const { type, ctx = {}, onAction } = toast;
  const copy = getToastCopy(type, ctx);
  const tone = type === 'sync-warn' ? 'warn' : type === 'error' ? 'err' : 'ok';

  // Auto-dismiss timer
  useEffect(() => {
    const dur = type === 'error' ? 4000 : type === 'sync-warn' ? 3200 : 2400;
    const t = setTimeout(onDismiss, dur);
    return () => clearTimeout(t);
  }, [toast, onDismiss, type]);

  const bg = tone === 'warn' ? TC.bgWarn : tone === 'err' ? TC.bgErr : TC.bg;
  const borderColor = tone === 'warn' ? 'rgba(212,162,69,0.4)' :
                      tone === 'err'  ? 'rgba(200,122,108,0.5)' :
                      'rgba(196,163,90,0.3)';

  return (
    <div style={{
      pointerEvents: 'auto',
      width: 320, maxWidth: 'calc(100vw - 24px)',
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 14px',
      background: bg,
      border: `1px solid ${borderColor}`,
      borderRadius: 12,
      boxShadow: '0 8px 24px rgba(0,0,0,0.5), 0 2px 6px rgba(0,0,0,0.3)',
      animation: 'neko-toast-in 0.36s cubic-bezier(0.16,1,0.3,1)',
      transformOrigin: 'bottom center',
    }}>
      {/* Glyph */}
      <div style={{
        width: 28, height: 28, borderRadius: 14,
        background: tone === 'warn' ? 'rgba(212,162,69,0.14)' :
                    tone === 'err'  ? 'rgba(200,122,108,0.14)' :
                    'rgba(196,163,90,0.14)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <ToastGlyph type={type}/>
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: 'Pretendard Variable', fontSize: 13, fontWeight: 600,
          color: TC.ink, lineHeight: 1.3,
          letterSpacing: '-0.005em',
        }}>{copy.primary}</div>
        {copy.secondary && (
          <div style={{
            fontFamily: 'Pretendard Variable', fontSize: 11,
            color: TC.inkDim, lineHeight: 1.35,
            marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{copy.secondary}</div>
        )}
      </div>

      {/* Action */}
      {copy.action && (
        <button onClick={() => { onAction && onAction(); onDismiss(); }} style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: '6px 8px',
          fontFamily: 'Geist Mono, monospace', fontSize: 9,
          color: tone === 'err' ? TC.err : TC.amber,
          letterSpacing: '0.15em', textTransform: 'uppercase',
          fontWeight: 600,
          flexShrink: 0,
        }}>{copy.action}</button>
      )}
    </div>
  );
}

// Host renders bottom-center stack, manages dismiss
function ToastHost({ toast, onDismiss }) {
  if (!toast) return null;
  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, bottom: 92,
      display: 'flex', justifyContent: 'center',
      pointerEvents: 'none',
      zIndex: 95,
      padding: '0 12px',
    }}>
      <ToastCard key={toast.id} toast={toast} onDismiss={onDismiss}/>
      <style>{`
        @keyframes neko-toast-in {
          0% { transform: translateY(20px) scale(0.96); opacity: 0; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// Hook to manage toast state
function useToast() {
  const [toast, setToast] = useState(null);
  const idRef = useRef(0);

  const show = useCallback((type, opts = {}) => {
    if (type === null) { setToast(null); return; }
    idRef.current += 1;
    setToast({
      id: idRef.current,
      type,
      ctx: opts.ctx || {},
      onAction: opts.onAction,
    });
  }, []);

  const dismiss = useCallback(() => setToast(null), []);

  return [toast, show, dismiss];
}

// Expose globals
window.NekoToastHost = ToastHost;
window.useNekoToast = useToast;
window.NekoToastCard = ToastCard;
window.NEKO_TOAST_TYPES = ['save', 'pass', 'remove', 'watched', 'sync-warn', 'error'];

})();

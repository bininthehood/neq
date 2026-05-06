// neko-profile.jsx — simple profile with stats, taste analysis, monthly report

const PF_COLORS = {
  bg: '#0B0A07', surface: '#12110E', surface2: '#1A1812',
  ink: '#EDEDEF', inkDim: '#8E8F9A', inkMute: '#6B6C75',
  hair: '#2A2823', amber: '#C4A35A', amberDim: 'rgba(196,163,90,0.15)',
};

function PFSection({ label, children }) {
  return (
    <div style={{ padding: '20px 22px', borderTop: `1px solid ${PF_COLORS.hair}` }}>
      <div style={{
        fontFamily: 'Geist Mono, ui-monospace, monospace', fontSize: 10,
        color: PF_COLORS.amber, letterSpacing: '0.12em',
        textTransform: 'uppercase', marginBottom: 12,
      }}>{label}</div>
      {children}
    </div>
  );
}

function StatTile({ value, label, accent }) {
  return (
    <div style={{
      flex: 1, padding: '14px 12px', borderRadius: 8,
      background: PF_COLORS.surface, border: `1px solid ${PF_COLORS.hair}`,
      borderLeft: accent ? `3px solid ${accent}` : `1px solid ${PF_COLORS.hair}`,
    }}>
      <div style={{
        fontFamily: 'Fraunces, serif', fontStyle: 'italic',
        fontSize: 26, color: PF_COLORS.ink, lineHeight: 1, marginBottom: 6,
      }}>{value}</div>
      <div style={{
        fontFamily: 'Pretendard Variable', fontSize: 11, color: PF_COLORS.inkMute,
      }}>{label}</div>
    </div>
  );
}

function TasteBar({ label, value, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
      <div style={{
        width: 64, fontFamily: 'Pretendard Variable', fontSize: 12, color: PF_COLORS.ink,
      }}>{label}</div>
      <div style={{ flex: 1, height: 6, background: PF_COLORS.surface, borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          width: `${value}%`, height: '100%',
          background: color, borderRadius: 3,
          transition: 'width 0.5s cubic-bezier(0.16,1,0.3,1)',
        }}/>
      </div>
      <div style={{
        width: 32, textAlign: 'right',
        fontFamily: 'Geist Mono, ui-monospace, monospace', fontSize: 10,
        color: PF_COLORS.inkDim,
      }}>{value}%</div>
    </div>
  );
}

function MonthlyChart() {
  // 12 months bars
  const months = ['1','2','3','4','5','6','7','8','9','10','11','12'];
  const heights = [18, 24, 12, 32, 28, 16, 22, 38, 30, 26, 42, 36];
  const max = Math.max(...heights);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80, marginBottom: 8 }}>
        {heights.map((h, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{
              width: '100%', height: `${(h / max) * 100}%`,
              background: i === 10 ? PF_COLORS.amber : PF_COLORS.amberDim,
              borderRadius: 2,
              transition: 'height 0.5s',
            }}/>
            <div style={{
              fontFamily: 'Geist Mono, ui-monospace, monospace', fontSize: 8,
              color: i === 10 ? PF_COLORS.amber : PF_COLORS.inkMute,
            }}>{months[i]}</div>
          </div>
        ))}
      </div>
      <div style={{
        fontFamily: 'Pretendard Variable', fontSize: 11, color: PF_COLORS.inkMute, lineHeight: 1.5,
      }}>2025년 · 총 <span style={{ color: PF_COLORS.amber, fontWeight: 600 }}>320편</span> 시청</div>
    </div>
  );
}

function NekoProfileScreen({ onOpenSettings }) {
  const works = window.NekoData.WORKS;
  const watched = works.filter(w => w.watched).length;
  const saved = works.length;

  return (
    <div style={{
      width: '100%', height: '100%',
      background: PF_COLORS.bg, overflowY: 'auto',
      scrollbarWidth: 'none',
      borderRadius: 'inherit',
    }}>
      <style>{`div::-webkit-scrollbar { display: none; }`}</style>

      {/* Header */}
      <div style={{ padding: '20px 22px 16px' }}>
        <div style={{
          fontFamily: 'Fraunces, serif', fontStyle: 'italic',
          fontSize: 28, color: PF_COLORS.ink, letterSpacing: '-0.02em',
        }}>Profile</div>
      </div>

      {/* User card */}
      <div style={{
        margin: '0 22px 4px',
        padding: '20px 18px',
        background: PF_COLORS.surface,
        border: `1px solid ${PF_COLORS.hair}`,
        borderRadius: 10,
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 28,
          background: 'linear-gradient(135deg, #3a2d1c, #1f1810)',
          border: `1px solid ${PF_COLORS.amberDim}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'Fraunces, serif', fontStyle: 'italic',
          fontSize: 26, color: PF_COLORS.amber,
        }}>지</div>
        <div style={{ flex: 1 }}>
          <div style={{
            fontFamily: 'Pretendard Variable', fontSize: 16, fontWeight: 600,
            color: PF_COLORS.ink,
          }}>지수</div>
          <div style={{
            fontFamily: 'Geist Mono, ui-monospace, monospace', fontSize: 10,
            color: PF_COLORS.inkMute, marginTop: 2,
          }}>@neq.user · 2024.03 가입</div>
        </div>
        <div onClick={onOpenSettings} style={{
          color: PF_COLORS.inkDim, padding: 6, cursor: 'pointer',
        }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M8 1V3.5M8 12.5V15M15 8H12.5M3.5 8H1M12.95 3.05L11.18 4.82M4.82 11.18L3.05 12.95M12.95 12.95L11.18 11.18M4.82 4.82L3.05 3.05" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ padding: '16px 22px 4px', display: 'flex', gap: 8 }}>
        <StatTile value={saved}    label="Saved · 저장"   accent={PF_COLORS.amber}/>
        <StatTile value={watched}  label="Watched · 시청" accent="#9B8AE0"/>
        <StatTile value="2.8h"     label="평균 / 주"      accent="#E08A6C"/>
      </div>

      {/* Taste analysis */}
      <PFSection label="Taste · 취향 분석">
        <div style={{ marginBottom: 6 }}>
          <TasteBar label="드라마"   value={82} color="#C4A35A"/>
          <TasteBar label="스릴러"   value={64} color="#9B8AE0"/>
          <TasteBar label="로맨스"   value={48} color="#E08A6C"/>
          <TasteBar label="SF"        value={36} color="#7BA08A"/>
          <TasteBar label="다큐"      value={22} color="#5B9BC4"/>
        </div>
        <div style={{
          marginTop: 12, padding: '10px 12px',
          borderLeft: `2px solid ${PF_COLORS.amber}`,
          background: PF_COLORS.amberDim,
          fontFamily: 'Fraunces, serif', fontStyle: 'italic',
          fontSize: 12, color: PF_COLORS.ink, lineHeight: 1.55,
        }}>"느릿하고 여백이 있는 드라마, 안개 같은 미스터리를 좋아해요"</div>
      </PFSection>

      {/* Monthly */}
      <PFSection label="2025 · 월간 시청">
        <MonthlyChart/>
      </PFSection>

      {/* Quick links */}
      <PFSection label="Settings">
        {[
          { label: '알림', val: '켜짐' },
          { label: '연결된 OTT', val: '5개' },
          { label: '데이터 내보내기', val: '' },
          { label: '로그아웃', val: '' },
        ].map((row, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 0',
            borderBottom: i < 3 ? `1px solid ${PF_COLORS.hair}` : 'none',
            cursor: 'pointer',
          }}>
            <span style={{ fontFamily: 'Pretendard Variable', fontSize: 13, color: PF_COLORS.ink }}>{row.label}</span>
            <span style={{
              fontFamily: 'Geist Mono, ui-monospace, monospace', fontSize: 10,
              color: PF_COLORS.inkMute,
            }}>{row.val}{row.val && ' ›'}{!row.val && '›'}</span>
          </div>
        ))}
      </PFSection>

      <div style={{ height: 100 }}/>
    </div>
  );
}

window.NekoProfileScreen = NekoProfileScreen;

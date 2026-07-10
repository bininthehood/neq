import { describe, it, expect } from 'vitest';
import { displayProviders } from '../providers';

describe('displayProviders — 표시용 allowlist + subscription 필터', () => {
  it('비지원 provider (Crunchyroll 류) 제거 — 구 저장 스냅샷 치유', () => {
    const out = displayProviders([
      { name: 'Netflix', category: 'subscription' as const },
      { name: 'Crunchyroll', category: 'subscription' as const },
      { name: 'MUBI', category: 'subscription' as const },
    ]);
    expect(out.map((p) => p.name)).toEqual(['Netflix']);
  });

  it('rent/buy 제거 + category 미보유 구버전 스냅샷은 구독 간주', () => {
    const out = displayProviders([
      { name: 'wavve', category: 'rent' as const },
      { name: 'TVING', category: 'buy' as const },
      { name: 'Watcha' }, // 구버전 — category 없음
    ]);
    expect(out.map((p) => p.name)).toEqual(['Watcha']);
  });

  it('지원 OTT 구독은 순서 보존 통과', () => {
    const input = [
      { name: 'Disney Plus', category: 'subscription' as const },
      { name: 'Coupang Play', category: 'subscription' as const },
    ];
    expect(displayProviders(input)).toEqual(input);
  });
});

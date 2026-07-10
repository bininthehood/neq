import { OTT_OPTIONS } from '@neq/core';

/**
 * 표시용 provider 필터 (2026-07-10) — 서버 `filterWatchProviders` (apps/web/src/lib/tmdb.ts)
 * 의 클라이언트 미러.
 *
 * 왜 클라이언트에도 필요한가: 저장(neq_saved)은 Recommendation 스냅샷을 박제하므로,
 * 서버 allowlist 도입 전 (또는 무필터 경로로) 저장된 작품에는 Crunchyroll·MUBI 같은
 * 한국 미출시/비주류 provider 가 영구히 남는다 (2026-07-10 실기기 보고). 표시 시점에
 * 항상 본 필터를 통과시켜 stale 스냅샷을 자연 치유한다.
 *
 * 기준 (서버와 동일 불변식):
 * - 앱 지원 OTT (OTT_OPTIONS allowlist) 만
 * - subscription 만 (rent/buy 제외 — feedback_ott_filter_subscription_category).
 *   구버전 스냅샷의 category 미보유는 구독 간주 (isSubscriptionProvider 정합)
 */
const SUPPORTED_OTTS = new Set<string>(OTT_OPTIONS);

export function displayProviders<
  T extends { name: string; category?: 'subscription' | 'rent' | 'buy' },
>(providers: T[]): T[] {
  return providers.filter(
    (p) => SUPPORTED_OTTS.has(p.name) && (!p.category || p.category === 'subscription'),
  );
}

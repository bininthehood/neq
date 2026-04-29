/**
 * ott-expiry helper.
 *
 * notification-triggers-detail.md §3 — saved 작품의 어제 vs 오늘 flatrate 비교.
 *
 * 책임 분리:
 *  - 본 모듈 = 순수 함수 (snapshot diff + payload mapper). DB I/O 없음.
 *  - cron route = orchestration (Supabase 조회/발송, 응답).
 *
 * 결정 사항:
 *  - flatrate 만 비교 (구독 기준, rent/buy 자연 변동)
 *  - 어제 데이터 없으면 비교 불가 → null-safe (skip)
 *  - false positive 가능 → 약한 톤 ("곧 내려갈 수 있어요")
 *  - 사용자 subscribedOtt 와 매칭되는 provider 만 발송 (예: 넷플릭스 구독자에게 넷플릭스 빠진 것만)
 */

import type { CompactProviders, MediaType } from "./providers-helpers";

/**
 * provider id → KR 이름 매핑. 사용자 알림 본문 구성용.
 * recommend.ts 의 PROVIDER_ID_TO_KR_NAME 과 동일 매핑이지만 cycle 회피 위해 자체 보유.
 * 신규 provider 추가 시 양쪽 동기화 권장.
 */
export const PROVIDER_ID_TO_KR_NAME: Record<number, string> = {
  8: "넷플릭스",
  337: "디즈니플러스",
  356: "웨이브",
  1881: "티빙",
  97: "왓챠",
  2: "애플TV",
  350: "애플TV플러스",
  119: "아마존프라임비디오",
  1796: "쿠팡플레이",
  3: "구글플레이",
};

/**
 * 한 작품에 대해 어제/오늘 flatrate 비교 → 사라진 provider id 추출.
 *
 *  yesterday=null 이면 비교 불가 (snapshot 누적 전) → 빈 배열.
 *  today=null 이면 오늘 호출 실패 등으로 비교 불가 → 빈 배열 (보수적).
 *  yesterday 만 있고 today=null → 모든 provider 가 사라진 것처럼 보일 수 있어
 *    이는 false positive 위험 → 빈 배열 반환 (cron 측에서 null 처리).
 */
export function diffFlatrate(
  yesterday: CompactProviders | null,
  today: CompactProviders | null,
): number[] {
  if (!yesterday || !today) return [];
  const todaySet = new Set(today.flatrate);
  return yesterday.flatrate.filter((id) => !todaySet.has(id));
}

export interface ExpiringProviderHit {
  workId: number;
  mediaType: MediaType;
  /** 사라진 provider id 배열 (어제→오늘 flatrate 차분) */
  goneProviderIds: number[];
}

/**
 * 사용자의 subscribedOtt 와 교차 → 본인이 구독중인 OTT 에서만 사라진 작품 hit 반환.
 *  subscribedOtt 비어있으면 모든 hit 통과 (보수: spec §3.3 4번 매칭이지만 빈 array 시 skip 정책 cron 결정).
 */
export function intersectWithSubscribed(
  hits: ExpiringProviderHit[],
  subscribedOtt: number[],
): ExpiringProviderHit[] {
  if (!subscribedOtt || subscribedOtt.length === 0) return [];
  const subSet = new Set(subscribedOtt);
  return hits
    .map((h) => ({
      ...h,
      goneProviderIds: h.goneProviderIds.filter((id) => subSet.has(id)),
    }))
    .filter((h) => h.goneProviderIds.length > 0);
}

/**
 * 1~3개 hit 통합 1건 알림 페이로드 텍스트.
 *  - 1건: "「제목」 OO 에서 곧 내려갈 수 있어요"
 *  - 2~3건: "「제목」 외 N편이 OTT에서 사라질 수 있어요"
 *
 * spec §3.5 약한 톤.
 */
export function buildExpiryPayloadText(
  hits: Array<{
    title: string;
    goneProviderIds: number[];
  }>,
): { title: string; body: string } {
  if (hits.length === 0) {
    return { title: "곧 내려갈 수 있어요", body: "저장한 작품 OTT 변경이 감지됐어요" };
  }
  const first = hits[0];
  const firstTitle = first.title || "저장한 작품";

  if (hits.length === 1) {
    const provNames = first.goneProviderIds
      .map((id) => PROVIDER_ID_TO_KR_NAME[id])
      .filter((n): n is string => typeof n === "string");
    const provLabel =
      provNames.length === 0
        ? "OTT"
        : provNames.length === 1
          ? provNames[0]
          : `${provNames[0]} 외 ${provNames.length - 1}곳`;
    return {
      title: "곧 내려갈 수 있어요",
      body: `「${firstTitle}」 ${provLabel}에서 사라질 수 있어요`,
    };
  }

  const others = hits.length - 1;
  return {
    title: "곧 내려갈 수 있어요",
    body: `「${firstTitle}」 외 ${others}편이 OTT에서 사라질 수 있어요`,
  };
}

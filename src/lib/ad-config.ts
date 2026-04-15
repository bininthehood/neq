/**
 * 광고 카드 설정 — Feature Flag 기반.
 * 사용자 수가 충분할 때까지 비활성화.
 *
 * 활성화: AD_ENABLED = true + AD_FREQUENCY 조정
 * 비활성화: AD_ENABLED = false (기본값)
 */

/** 광고 활성화 플래그 */
export const AD_ENABLED = false;

/** 추천 카드 N장마다 광고 1개 삽입 */
export const AD_FREQUENCY = 15;

/** 허용 광고 카테고리 (문화/라이프스타일만) */
export const AD_ALLOWED_CATEGORIES = [
  "entertainment",   // OTT, 영화, 공연
  "books",           // 도서
  "music",           // 음악 스트리밍
  "lifestyle",       // 라이프스타일
  "coupang",         // 쿠팡 파트너스
] as const;

/** 금지 광고 카테고리 */
export const AD_BLOCKED_CATEGORIES = [
  "game",
  "gambling",
  "loan",
  "diet",
  "adult",
] as const;

export type AdCategory = typeof AD_ALLOWED_CATEGORIES[number];

/** 광고 카드 데이터 */
export interface AdCard {
  id: string;                    // 광고 고유 ID (tracking용)
  type: "ad";                    // 추천 카드와 구별
  source: "coupang" | "admob" | "direct";  // 광고 소스
  category: AdCategory;
  title: string;                 // 카드에 표시할 제목
  description: string;           // 추천 reason과 동일한 위치
  imageUrl: string;              // 포스터 위치에 표시할 이미지
  actionUrl: string;             // 클릭 시 이동 URL
  actionLabel: string;           // CTA 버튼 텍스트 ("자세히 보기", "쿠팡에서 보기")
  impression?: () => void;       // 노출 트래킹 콜백
  click?: () => void;            // 클릭 트래킹 콜백
}

/**
 * 추천 카드 배열에 광고 카드를 삽입하는 위치를 계산.
 *
 * @example
 * const positions = getAdPositions(30, 15); // [14, 29]
 * // 카드 30장 중 15장마다 → 14번, 29번 인덱스에 광고
 */
export function getAdPositions(totalCards: number, frequency: number = AD_FREQUENCY): number[] {
  if (!AD_ENABLED || totalCards === 0) return [];
  const positions: number[] = [];
  for (let i = frequency - 1; i < totalCards; i += frequency) {
    positions.push(i);
  }
  return positions;
}

/**
 * 추천 카드 인덱스가 광고 슬롯인지 판별.
 */
export function isAdSlot(index: number, frequency: number = AD_FREQUENCY): boolean {
  if (!AD_ENABLED) return false;
  return (index + 1) % frequency === 0;
}

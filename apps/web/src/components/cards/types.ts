/**
 * Card variants 공용 타입 — D1 (Stage 4 핸드오프 v2).
 *
 * 정량 명세 (핸드오프 기준):
 *   - 카드 dim: w=300, h=460 (기본). props로 override 가능.
 *   - depth scale: 1 − d × 0.04
 *   - yOffset: d × 12px
 *   - 콜백 타이밍: save 480ms, pass 360ms (Phase C에서 useSwipeGesture 반영)
 *
 * Variants:
 *   - A: Poster-led (사진 잡지 톤) — 풀블리드 포스터 + 하단 캡션
 *   - B: Typography-led — 작은 포스터 스트립 + 큰 타이포 블록 (한글 비중 큼)
 *   - C: Cinematic — 어두운 백드롭 + 영화관 액자식 작은 포스터
 *
 * 이 컴포넌트들은 **순수 시각 컴포넌트**입니다. 스와이프/제스처/absorb 모션은
 * 부모(SwipeCard 또는 page.tsx)가 transform/opacity로 wrap 해서 처리.
 *
 * Recommendation → CardWork 매퍼는 `mapRecToWork` 사용.
 */

import type { Recommendation } from "@/lib/types";

export type CardVariantKey = "A" | "B" | "C" | "default";

/**
 * 카테고리 (3종, DECISIONS.md #26):
 *   - movie / series / variety
 *   사용자 결정으로 v2 디자인의 5종(movie/series/variety/music/book) 무시.
 *   현재 Recommendation.type 은 'movie' | 'series' 만 — variety 는 향후 확장 시.
 */
export type CardCategory = "movie" | "series" | "variety";

/**
 * Variant 컴포넌트가 받는 정규화된 작품 데이터.
 * Recommendation 의 일부만 노출 — 카드는 시각만 다룸 (액션·상태 없음).
 */
export interface CardWork {
  title: string;
  titleEn: string;
  year: string;          // 4-digit. date 에서 추출 ("2024-03-15" → "2024")
  reason: string;
  rating: number;
  poster: string | null;
  backdrop: string | null;
  cat: CardCategory;
  /** OTT provider names (정렬·필터링은 매퍼에서) */
  otts: string[];
  runtime: number | null;
  seasons: number | null;
}

/**
 * 모든 variant 가 공유하는 props.
 * Variant 별 추가 props 가 필요하면 extend.
 */
export interface CardVariantProps {
  work: CardWork;
  /** 기본 300px. SwipeCard 내부 합성 시 부모 컨테이너가 100% 너비 사용하도록 'auto' 가능. */
  w?: number | string;
  /** 기본 460px. 'auto' 또는 100% 가능. */
  h?: number | string;
  /** Discover 메인 카드 fullbleed 모드 (immersive). 카드 내부 padding/border-radius 0 */
  fullbleed?: boolean;
}

/**
 * Recommendation → CardWork 매퍼.
 * Recommendation.type 이 'movie' 면 cat='movie', 'series' 면 'series'.
 * future: variety 분류는 별도 메타데이터 필요 (현재 데이터 모델에 없음).
 */
export function mapRecToWork(rec: Recommendation): CardWork {
  const year = rec.date ? rec.date.slice(0, 4) : "";
  const otts = rec.providers
    .filter((p) => !p.category || p.category === "subscription")
    .slice(0, 6)
    .map((p) => p.name);
  return {
    title: rec.title,
    titleEn: rec.titleEn || rec.title,
    year,
    reason: rec.reason,
    rating: rec.rating,
    poster: rec.posterUrl,
    backdrop: rec.backdrop,
    cat: rec.type === "series" ? "series" : "movie",
    otts,
    runtime: rec.runtime,
    seasons: rec.seasons,
  };
}

/**
 * 카테고리별 i18n 라벨.
 */
export const CAT_LABEL: Record<CardCategory, string> = {
  movie: "영화",
  series: "시리즈",
  variety: "예능",
};

/**
 * 카테고리별 CSS 변수 (tokens.css 정의).
 * 빌드 시 NextJS 가 :root 컬러를 참조.
 */
export const CAT_COLOR_VAR: Record<CardCategory, string> = {
  movie: "var(--cat-movie)",
  series: "var(--cat-series)",
  variety: "var(--cat-variety)",
};

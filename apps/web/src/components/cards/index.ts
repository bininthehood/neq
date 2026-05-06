/**
 * Card variants 모듈 진입.
 *
 * GH-1 #4 (2026-05-02): variant 시스템 단순화 — 모든 Discover 카드는 항상 CardVariantA 렌더.
 * B/C 컴포넌트는 코드 보존(백업) 하지만 호출처 0건. CardVariantContext/Provider 제거.
 *
 * 사용 예 (현재):
 *   import { CardVariantA, mapRecToWork } from "@/components/cards";
 *   const work = mapRecToWork(rec);
 *   return <CardVariantA work={work} fullbleed />;
 */

export { default as CardVariantA } from "./CardVariantA";
export { default as CardVariantB } from "./CardVariantB";
export { default as CardVariantC } from "./CardVariantC";

export type {
  CardVariantKey,
  CardCategory,
  CardWork,
  CardVariantProps,
} from "./types";

export {
  mapRecToWork,
  CAT_LABEL,
  CAT_COLOR_VAR,
} from "./types";

export { CatChip, OttChip, Rating, PosterImage } from "./parts";

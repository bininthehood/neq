/**
 * Safe haptic feedback — vibrate only when supported.
 * Falls back silently on iOS Safari (no vibrate API) and SSR.
 *
 * 사이클 2 통일 매핑 (web ↔ native):
 *
 * | 시맨틱 | web `navigator.vibrate(ms)` | native `Haptics.impactAsync(...)`        |
 * | ------ | --------------------------- | ---------------------------------------- |
 * | light  |  8ms (탭, 버튼 active)      | ImpactFeedbackStyle.Light                |
 * | medium | 14ms (save 흡수, prev 진입) | ImpactFeedbackStyle.Medium               |
 * | heavy  | 24ms (오류, 경고)           | ImpactFeedbackStyle.Heavy                |
 *
 * iOS Safari 는 `navigator.vibrate` 자체가 미지원 — 자동으로 silent fallback.
 * Android Chrome / Samsung Internet 은 ms 정수를 받아 진동 구동.
 *
 * 기존 호출처는 `vibrate(10)` 단일 형태였음. 마이그레이션 가이드:
 *   - swipe save (down)         → vibrate('medium')
 *   - swipe pass (left)         → vibrate('light')
 *   - prev card 진입            → vibrate('medium')
 *   - DetailSheet 진입 (탭)     → vibrate('light')
 *   - 일반 버튼 active          → vibrate('light')
 */

export type HapticIntensity = "light" | "medium" | "heavy";

/**
 * Web vibration durations (ms). 인지 강도 기준으로 native ImpactFeedbackStyle 와 매핑.
 * - 8ms: 매우 미세 (탭, 토글)
 * - 14ms: 중간 (save 흡수, prev 진입)
 * - 24ms: 강함 (오류, 경고)
 */
const INTENSITY_MS: Record<HapticIntensity, number> = {
  light: 8,
  medium: 14,
  heavy: 24,
};

/**
 * 햅틱 트리거. 기존 호출처 호환:
 *   - `vibrate()` → light (8ms)
 *   - `vibrate(10)` → ms 값 정수 직접 (legacy. 새 호출처는 intensity 사용 권장)
 *   - `vibrate('medium')` → 통일 매핑.
 */
export function vibrate(intensity: HapticIntensity | number = "light"): void {
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  const ms =
    typeof intensity === "number" ? intensity : INTENSITY_MS[intensity];
  navigator.vibrate(ms);
}

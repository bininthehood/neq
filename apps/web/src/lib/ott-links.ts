// 단일 출처: @neq/core. 웹은 모바일 UA 감지 분기만 여기서.
import { getOTTLink as getOTTLinkCore } from "@neq/core";
export { getOTTIcon } from "@neq/core";

/** 웹 전용: UA 기반 모바일 감지로 appLink vs search 자동 선택 */
export function getOTTLink(providerName: string, title: string): string | null {
  const isMobile =
    typeof navigator !== "undefined" && /iPhone|iPad|Android/i.test(navigator.userAgent);
  return getOTTLinkCore(providerName, title, isMobile);
}

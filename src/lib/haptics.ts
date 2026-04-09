/**
 * Safe haptic feedback — vibrate only when supported.
 * Falls back silently on iOS Safari (no vibrate API) and SSR.
 */
export function vibrate(ms = 10) {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    navigator.vibrate(ms);
  }
}

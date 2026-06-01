import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * 시스템 reduce motion 설정을 구독하는 hook.
 *
 * iOS — Settings > Accessibility > Motion > Reduce Motion
 * Android — Settings > Accessibility > Remove Animations
 *
 * RN `AccessibilityInfo.isReduceMotionEnabled()` (one-shot) + `reduceMotionChanged`
 * 리스너로 즉시 반영. 컴포넌트 unmount 시 리스너 해제.
 *
 * 사용처: NeqAbsorptionIntro (1.3s 흡수 애니메이션) — true 면 정적 wordmark 즉시 표시.
 * MOTION-SPEC.md 'Reduced motion' 섹션: "Absorption → show final wordmark immediately"
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (!cancelled) setReduced(value);
      })
      .catch(() => {
        /* 기본값 false 유지 — 감지 실패해도 애니메이션 표시 */
      });

    const sub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (value) => {
        setReduced(value);
      },
    );

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  return reduced;
}

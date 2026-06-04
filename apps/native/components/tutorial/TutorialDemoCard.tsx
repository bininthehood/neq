import { useMemo } from 'react';
import { View, StyleSheet, type LayoutRectangle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import type { Recommendation } from '../../lib/types';
import { CardInner } from '../SwipeCard';
import { colors, radius, shadowsNative } from '../../lib/tokens';

/**
 * TutorialFlow v3.2 — 풀사이즈 데모 카드 (2026-06-04 통합 → 6/4 산업표준 마이그레이션).
 *
 * 배경: 6/1 b4885a9 에서 MockCard 220×320 폐기 후 "포스터 가시성 회귀" 피드백 → 풀사이즈 메타포 복원.
 *
 * 산업표준 패턴 (ref + onLayout):
 *   - 부모 (`app/index.tsx`) 가 stackWrap 의 onLayout 측정값을 stackRect prop 으로 주입.
 *   - 카드 좌표 = stackRect (실제 SwipeCard 부모 영역) + SwipeCard 정본 margin (left/right:12, bottom:8).
 *   - hardcoded HEADER/ACTION_BAR 차감 제거 — FilterChips 등 sibling 추가에 자동 정합.
 *
 * 설계:
 *   - `CardInner` 재사용 — 포스터/rating/title/reason/OTT 칩 동일.
 *   - translateX / translateY / scale / rotate sharedValue 외부(각 Demo) 주입.
 *   - `pointerEvents="none"` — 사용자 제스처는 dim 아래 실제 SwipeCard 가 받는다.
 *
 * Fabric crash 회피 (memory feedback_reanimated_fabric_crash):
 *   - worklet 결과 모든 transform 값 `Number.isFinite` 가드 + fallback.
 *   - 무한 worklet 은 각 Demo 에서 cleanup. 본 컴포넌트는 sharedValue 소비만 담당.
 */

interface Props {
  rec: Recommendation;
  /** 실제 SwipeCard 부모 (stackWrap) 의 onLayout 측정값. SafeAreaView 안의 상대 좌표. */
  stackRect: LayoutRectangle;
  /** 외부 주입 translateX sharedValue (px). 미지정 시 0. */
  translateX?: SharedValue<number>;
  /** 외부 주입 translateY sharedValue (px). 미지정 시 0. */
  translateY?: SharedValue<number>;
  /** 외부 주입 scale sharedValue (1 기준). 미지정 시 1. */
  scale?: SharedValue<number>;
  /** 외부 주입 rotate sharedValue (deg). 미지정 시 0. */
  rotate?: SharedValue<number>;
}

export default function TutorialDemoCard({
  rec,
  stackRect,
  translateX,
  translateY,
  scale,
  rotate,
}: Props) {
  const cardStyle = useAnimatedStyle(() => {
    'worklet';
    // Fabric `folly::ConversionError` 회피 — 모든 transform 결과를 finite number 로 강제.
    const safe = (n: number | undefined, fallback = 0): number =>
      n !== undefined && Number.isFinite(n) ? n : fallback;

    const tx = safe(translateX?.value);
    const ty = safe(translateY?.value);
    const sc = safe(scale?.value, 1);
    const rt = safe(rotate?.value);

    return {
      transform: [
        { translateX: tx },
        { translateY: ty },
        { scale: sc },
        { rotate: `${rt}deg` },
      ],
    };
  });

  // CardInner 는 immersive=false (정보 영역 노출) + depth=0 (top 카드 동등).
  // useMemo 로 stable reference — Demo 가 sharedValue 변동마다 리렌더하지 않도록.
  const cardContent = useMemo(
    () => <CardInner rec={rec} immersive={false} depth={0} />,
    [rec],
  );

  // 좌표 = stackRect (실제 SwipeCard 부모 영역) + SwipeCard 정본 margin.
  // SwipeCard.tsx L378-389 정합: left/right 12, bottom 8, top 0.
  return (
    <View
      style={[
        styles.wrap,
        {
          top: stackRect.y,
          left: stackRect.x + 12,
          width: Math.max(0, stackRect.width - 24),
          height: Math.max(0, stackRect.height - 8),
        },
      ]}
      pointerEvents="none"
    >
      <Animated.View style={[styles.card, cardStyle]}>
        {cardContent}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
  },
  card: {
    flex: 1,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    // 반투명 — 실제 SwipeCard 와 시각 정합 100% 이라 사용자가 가이드 카드를 실제 카드로
    // 착각 (첫 step 인지 실패 → 무의식 swipe 후 두 번째 step 만 인지). overlay 톤 (0.7)
    // 정합으로 반투명화 → "가이드 layer" 명확 구분.
    opacity: 0.7,
    ...shadowsNative.lg,
  },
});

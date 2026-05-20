import { StyleSheet, Dimensions } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import type { Recommendation } from '../lib/types';
import { colors, radius, shadowsNative } from '../lib/tokens';
import { CardInner } from './SwipeCard';
import type { SharedValue } from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Props {
  rec: Recommendation;
  overlayX: SharedValue<number>;
}

// 이전 카드는 화면 왼쪽 바깥에서 우 스와이프 시 오버레이로 덮어온다.
// overlayX: -SCREEN_WIDTH = 완전 가림(시작), 0 = 완전히 도착
//
// 2026-05-20 — PWA `PrevCardOverlay` 정합. 기존엔 자체 단순화된 infoOverlay
// (title + titleEn) 를 사용해서 SwipeCard 의 bottomInfo (year·titleEn / title /
// reason / OTT row + cat/rating chip) 와 시각이 완전히 달랐다. 도착 직후
// `prevActive=false` 로 overlay 가 unmount 되며 그 위치에 새 top SwipeCard 가
// 마운트되는데, 둘의 정보 영역이 통째로 바뀌어 "깜빡임" 으로 인지됐다.
// `CardInner` 로 통일 → overlay → 새 top 전환 시 시각 100% 동일 → 깜빡임 0.
export default function PrevCardOverlay({ rec, overlayX }: Props) {
  const style = useAnimatedStyle(() => {
    'worklet';
    // 2026-05-18 — Fabric folly::ConversionError abort 방어 (NaN/Infinity guard).
    const v = overlayX.value;
    const tx = Number.isFinite(v) ? v : 0;
    return { transform: [{ translateX: tx }] };
  });

  return (
    <Animated.View style={[styles.card, style]}>
      <CardInner rec={rec} immersive={false} depth={0} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // SwipeCard.styles.card 와 동일 위치/모서리 — overlay → 새 top 전환 시 카드 frame
  // 점프 0. zIndex 만 100 으로 올려 슬라이드 진행 중 SwipeCard 위에 올라옴.
  card: {
    position: 'absolute',
    top: 0,
    bottom: 8,
    left: 12,
    right: 12,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    zIndex: 100,
    ...shadowsNative.lg,
  },
});

// 외부 사용처(`index.tsx`)가 기존 import 시그니처 유지하도록 SCREEN_WIDTH 재export.
// (현재 호출처는 prevOverlayX SharedValue 초기화에만 사용 — 단순 상수.)
export { SCREEN_WIDTH };

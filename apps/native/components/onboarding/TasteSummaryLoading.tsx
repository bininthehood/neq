import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, spacing } from '../../lib/tokens';

/**
 * LLM 통합 요약 호출 대기 (native).
 *
 * web `apps/web/src/components/onboarding/TasteSummaryLoading.tsx` 대응.
 * spinner 금지 (Quiet Ink). italic 카피 + 4 line skeleton opacity pulse.
 * Reanimated 4 Fabric crash 회피 — RN 내장 Animated 사용 (worklet 무관).
 */

interface Props {
  message?: string;
}

const DEFAULT_MESSAGE = '당신의 취향을 그리는 중';

export default function TasteSummaryLoading({
  message = DEFAULT_MESSAGE,
}: Props) {
  return (
    <View
      style={styles.wrap}
      accessibilityRole="progressbar"
      accessibilityLabel={message}
    >
      <Text style={styles.heading}>{message}</Text>

      <View style={styles.skeletonCol}>
        {[0, 1, 2, 3].map((i) => (
          <SkeletonBar key={i} index={i} last={i === 3} />
        ))}
      </View>
    </View>
  );
}

function SkeletonBar({ index, last }: { index: number; last: boolean }) {
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const delay = index * 120;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.8,
          duration: 700,
          delay,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.45,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [index, opacity]);

  return (
    <Animated.View
      style={[
        styles.bar,
        { width: last ? '60%' : '100%', opacity },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 48,
  },
  heading: {
    color: colors.textPrimary,
    fontFamily: fonts.displayReg,
    fontStyle: 'italic',
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.4,
    marginBottom: spacing.xl + 8,
  },
  skeletonCol: {
    gap: spacing.sm + 2,
  },
  bar: {
    height: 12,
    borderRadius: 999,
    backgroundColor: colors.accentDim,
  },
});

/**
 * 젤리 프레스 (DESIGN.md Motion & Touch 시그니처).
 * 누르면 90ms 에 scale(1.03, 0.92) 로 찌그러지고, 놓으면 jelly 곡선 280ms 로 튕겨 복귀.
 * `size="large"`(저장 버튼 등)는 찌그러짐을 줄인다 — scale(1.02, 0.94).
 * reduced-motion 이면 변형 없이 즉시 상태만 바뀐다.
 *
 * 구조: 바깥 Animated.View 는 transform 만(색 없음), 안쪽 Pressable 이 `style` 을 받는다.
 * → 호출부 StyleSheet 의 동적 색(DynamicColorIOS)이 Animated.* 정적 style 에 들어가지 않는다
 *   (0단계 규칙). flex·margin 등 바깥 배치는 `containerStyle` 로 준다.
 * 햅틱은 호출부 onPress 가 이미 처리하므로 여기서 다시 울리지 않는다(연속 발화 금지).
 */
import { type ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { motion } from '../lib/tokens';
import { useReducedMotion } from '../hooks/useReducedMotion';

const SQUASH = { default: [1.03, 0.92], large: [1.02, 0.94] } as const;
const PRESS_EASE = Easing.out(Easing.quad);
const JELLY_EASE = Easing.bezier(...motion.easing.jelly);

type Props = PressableProps & {
  size?: keyof typeof SQUASH;
  containerStyle?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

export function JellyPressable({ size = 'default', containerStyle, onPressIn, onPressOut, disabled, ...rest }: Props) {
  const reduced = useReducedMotion();
  const sx = useSharedValue(1);
  const sy = useSharedValue(1);

  const anim = useAnimatedStyle(() => ({ transform: [{ scaleX: sx.value }, { scaleY: sy.value }] }));

  return (
    <Animated.View style={[containerStyle, anim]}>
      <Pressable
        {...rest}
        disabled={disabled}
        onPressIn={(e) => {
          if (!reduced) {
            const [x, y] = SQUASH[size];
            const cfg = { duration: motion.duration.instant, easing: PRESS_EASE };
            sx.value = withTiming(x, cfg);
            sy.value = withTiming(y, cfg);
          }
          onPressIn?.(e);
        }}
        onPressOut={(e) => {
          const cfg = { duration: reduced ? 0 : motion.duration.jellyRelease, easing: JELLY_EASE };
          sx.value = withTiming(1, cfg);
          sy.value = withTiming(1, cfg);
          onPressOut?.(e);
        }}
      />
    </Animated.View>
  );
}

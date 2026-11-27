import { View, Pressable, StyleSheet } from 'react-native';
import { Text } from './Text';
import { GlassSurface } from './GlassSurface';
import { IconClose } from './Icons';
import { HINT_COPY, type HintStep } from '../lib/onboarding';
import { colors, radius } from '../lib/tokens';
import { fontsV2 } from '@neq/design';

/**
 * 온보딩 A안 — 카드 위 조작 힌트 한 줄 (유리 알약 = 토스트와 같은 재질).
 * 글자 부분은 터치를 통과시켜 카드 조작을 막지 않는다. 닫기(44)만 받는다 → tutorial_skipped.
 * 유리 위 글자 규칙: text 색·13 이상·600 이상 (DESIGN.md Material).
 */
export default function GestureHint({ step, onClose }: { step: HintStep; onClose: () => void }) {
  return (
    <View style={styles.wrap} pointerEvents="box-none" testID={`gesture-hint-${step}`}>
      <View style={styles.pill} pointerEvents="box-none" accessibilityLiveRegion="polite">
        <GlassSurface radius={radius.toast} />
        <Text style={styles.text} accessibilityRole="text">
          {HINT_COPY[step]}
        </Text>
        <Pressable
          onPress={onClose}
          hitSlop={8}
          style={styles.close}
          accessibilityRole="button"
          accessibilityLabel="안내 닫기"
        >
          <IconClose size={16} color={colors.textPrimary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // 카드 위쪽 1/3 — 칩 줄·케밥·친구 메모 아래, 제목 블록 위
  wrap: {
    position: 'absolute',
    top: '34%',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 25,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingLeft: 16,
    paddingRight: 4,
    gap: 4,
    maxWidth: '88%',
  },
  text: {
    flexShrink: 1,
    color: colors.textPrimary,
    fontSize: 15,
    fontFamily: fontsV2.bodySemi,
  },
  close: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

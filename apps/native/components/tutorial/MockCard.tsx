import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, spacing } from '../../lib/tokens';
import { fonts } from '@neq/design';
import type { Recommendation } from '../../lib/types';

/**
 * TutorialFlow v3 — 데모용 미니 카드 (220×320).
 *
 * web 의 `CardVariantA` 와 시각적으로 동일 비례를 의도하되, 데모 overlay 라
 * 실제 SwipeCard 의 무거운 layout (메타, providers, reason box) 은 제거. 포스터 +
 * rating + 타입 + 타이틀까지만 렌더해서 "어떤 카드를 만지면 될지" 가 직관적으로 보이도록.
 *
 * 본 컴포넌트는 자체 transform 을 갖지 않고 부모 (각 *Demo) 의 Animated.View
 * 안에 그대로 배치된다. dim overlay 위라 pointerEvents 도 부모에서 차단됨.
 */
export default function MockCard({ rec }: { rec: Recommendation }) {
  return (
    <View style={styles.card}>
      {rec.posterUrl ? (
        <Image
          source={{ uri: rec.posterUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={0}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.fallback]}>
          <Text style={styles.fallbackText}>N</Text>
        </View>
      )}

      <Text style={styles.ratingText}>★ {rec.rating.toFixed(1)}</Text>
      <Text style={styles.typeText}>
        {rec.type === 'series' ? '시리즈' : '영화'}
      </Text>

      <LinearGradient
        colors={['transparent', 'rgba(18,17,14,0.55)', 'rgba(18,17,14,0.9)']}
        locations={[0, 0.55, 1]}
        style={styles.gradient}
        pointerEvents="none"
      />
      <View style={styles.titleWrap} pointerEvents="none">
        <Text style={styles.title} numberOfLines={2}>
          {rec.title}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 220,
    height: 320,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    // boxShadow 는 RN 미지원 — elevation + shadow* prop 으로 근사.
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  fallback: {
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: {
    color: colors.textMuted,
    fontSize: 56,
    fontWeight: '700',
  },
  ratingText: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    color: colors.accent,
    fontFamily: fonts.data,
    fontSize: 12,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  typeText: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    color: colors.textPrimary,
    fontSize: 11,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  gradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 160,
  },
  titleWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.md,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 18,
    fontFamily: fonts.display,
    lineHeight: 22,
  },
});

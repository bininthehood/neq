/**
 * ReactionOverlay (native) — Saved 카드 위에 덮이는 '봤어요?' 시청 리포트 입력 UI.
 *
 * web 정본: `apps/web/src/components/saved/SavedList.tsx` 의 PosterCard / ListCard
 * 내부 `isReporting` overlay 블록.
 *  - 제목/안내 + 4종 reaction 버튼 (인생작 / 괜찮았어 / 별로였어 / 안 맞았어).
 *  - 카드 전체를 덮으며, overlay 빈 영역 탭 = 취소.
 *
 * web 의 backdrop-blur 는 RN 에서 expo-blur 가 필요하므로(새 의존성 금지),
 * 불투명 overlayHeavy 면 + surface 그라디언트 대신 단색 surface 로 대체.
 *
 * REACTION_OPTIONS 는 SavedReactionCard 의 배지 라벨과 공유 (ReactionLabel).
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { WatchReaction } from '../../lib/types';
import { colors, radius, spacing, fontsV2 } from '../../lib/tokens';

/** web SavedList 의 isReporting overlay 버튼 정합 — 라벨/색/배경. */
const REACTION_OPTIONS: {
  key: WatchReaction;
  label: string;
  bg: string;
  color: string;
  border: string;
}[] = [
  {
    key: 'loved',
    label: '인생작',
    bg: colors.accentDim,
    color: colors.textPrimary,
    border: colors.accentBorderLight,
  },
  {
    key: 'good',
    label: '괜찮았어',
    bg: colors.surface,
    color: colors.textSecondary,
    border: colors.border,
  },
  {
    key: 'meh',
    label: '별로였어',
    bg: colors.surface,
    color: colors.textMuted,
    border: colors.border,
  },
  {
    key: 'dropped',
    label: '안 맞았어',
    bg: colors.dangerDim,
    color: colors.danger,
    border: 'transparent',
  },
];

/**
 * compact=true 일 때(list 모드 카드) 안내 문구를 줄이고 패딩을 축소.
 */
export default function ReactionOverlay({
  tmdbId,
  onReport,
  onCancel,
  compact = false,
}: {
  tmdbId: number;
  onReport: (tmdbId: number, reaction: WatchReaction) => void;
  onCancel: () => void;
  compact?: boolean;
}) {
  return (
    // a11y: overlay root 는 accessible={false} — backdrop(닫기) 와 4종 reaction
    // 버튼이 각각 별개 a11y element 가 되도록 병합 해제 (iOS 가 자식 Pressable 을
    // 부모로 흡수하는 것 방지). VoiceOver 로 reaction 입력 개별 접근 가능.
    <View
      style={[StyleSheet.absoluteFill, styles.overlayRoot]}
      accessibilityViewIsModal
      accessible={false}
    >
      {/* backdrop — 빈 곳 탭 = 취소. 닫기 전용 별개 a11y element.
          absoluteFill 로 카드 전체를 덮어 기존 터치 동작(어디든 탭=닫기) 보존. */}
      <Pressable
        style={[StyleSheet.absoluteFill, styles.overlayBackdrop]}
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel="시청 리포트 선택 닫기"
      />
      {/* 콘텐츠 — 시각 레이아웃은 기존 overlay 스타일 그대로. pointerEvents
          는 'box-none' 으로 빈 영역 터치는 backdrop 으로 통과, 버튼만 흡수. */}
      <View style={styles.overlayContent} pointerEvents="box-none">
        <View style={styles.headingWrap}>
          <Text style={styles.heading}>본 적 있나요?</Text>
          {!compact && (
            <Text style={styles.sub}>알려주시면 더 좋은 추천을 드릴게요</Text>
          )}
        </View>
        <View style={styles.btnRow}>
          {REACTION_OPTIONS.map((r) => (
            <Pressable
              key={r.key}
              onPress={() => onReport(tmdbId, r.key)}
              accessibilityRole="button"
              accessibilityLabel={`${r.label} 리포트`}
              style={({ pressed }) => [
                styles.reactionBtn,
                {
                  backgroundColor: r.bg,
                  borderColor: r.border,
                },
                pressed && { transform: [{ scale: 0.95 }] },
              ]}
            >
              <Text style={[styles.reactionLabel, { color: r.color }]}>
                {r.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // overlay root — 불투명 면 + radius (시각). a11y 트리에서는 accessible=false.
  // web 의 backdrop-blur + 그라디언트 대신 불투명 surface (의존성 금지).
  overlayRoot: {
    backgroundColor: colors.overlayHeavy,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  // backdrop — 닫기 전용 투명 레이어. root 면이 색을 담당하므로 투명.
  overlayBackdrop: {
    backgroundColor: 'transparent',
  },
  // content — 헤딩 + 버튼 행. 기존 overlay 의 center 정렬/gap/padding 그대로.
  overlayContent: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
  },
  headingWrap: {
    alignItems: 'center',
  },
  heading: {
    fontSize: 14,
    fontFamily: fontsV2.display,
    color: colors.textPrimary,
  },
  sub: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  btnRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.xs + 2,
  },
  reactionBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  reactionLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
});

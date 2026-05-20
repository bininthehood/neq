/**
 * ReactionLabel (native) — 시청 리포트 reaction 배지 (읽기 전용).
 *
 * web 정본: `apps/web/src/components/saved/SavedList.tsx` 의 REACTIONS / ReactionLabel.
 * Saved 카드(grid/list)에서 reaction 이 기록된 작품의 라벨 배지로 사용.
 */

import { View, Text, StyleSheet } from 'react-native';
import type { WatchReaction } from '../../lib/types';
import { colors, radius } from '../../lib/tokens';

/** web SavedList REACTIONS 정합 — 라벨/색/배경. */
export const REACTION_BADGES: Record<
  WatchReaction,
  { label: string; color: string; bg: string }
> = {
  // 2026-05-20 — 입력 라벨(ReactionOverlay.tsx: 인생작/괜찮았어/별로였어/안 맞았어)과
  // 통일. 사용자가 '괜찮았어' 선택 후 표시 '재밌었어' 로 바뀌어 불일치 보고.
  loved: { label: '인생작', color: colors.textPrimary, bg: colors.accentDim },
  good: { label: '괜찮았어', color: colors.textSecondary, bg: colors.surfaceRaised },
  meh: { label: '별로였어', color: colors.textMuted, bg: colors.surface },
  dropped: { label: '안 맞았어', color: colors.danger, bg: colors.dangerDim },
};

export default function ReactionLabel({ reaction }: { reaction: WatchReaction }) {
  const r = REACTION_BADGES[reaction];
  return (
    <View style={[styles.badge, { backgroundColor: r.bg }]}>
      <Text style={[styles.text, { color: r.color }]}>{r.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  text: {
    fontSize: 11,
    fontWeight: '600',
  },
});

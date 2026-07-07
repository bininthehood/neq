/**
 * SavedMonthScrubber — #6 인스크린 가로 캘린더 스크러버.
 *
 * 연·월 모드 ON 일 때만 렌더. 저장 목록에 실제 존재하는 연·월만 가로 칩 행으로
 * (최신 먼저). 장르 칩바(SavedGenreChips)와 동일 패턴/스타일 재사용:
 *   - 가로 스크롤 ScrollView (스와이프 = 연·월 이동)
 *   - 탭 = 그 연·월 단일 필터 (재탭 = 해제 → 전체 월)
 *   - selected = surface-raised 면 + text-primary (DESIGN.md 2026-05-13 M1, non-amber).
 *     Saved amber 예산(≤4, L33) 방어 — 새 비주얼 토큰 도입 없음.
 *
 * 월 버킷 계산은 SavedSortControl.monthOptionsOf 재활용 (groupSavedByMonth 규칙 동일).
 * 필터 predicate(monthKeyOf)는 부모 saved.tsx 파이프라인에서 소비.
 */
import { Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import type { SavedItem } from '../../lib/types';
import { colors, radius, spacing } from '../../lib/tokens';
import { monthOptionsOf } from './SavedSortControl';

type Props = {
  /** tab ∩ OTT ∩ 검색 ∩ 장르 까지 적용된 목록 — 여기서 존재하는 월만 칩으로. */
  items: SavedItem[];
  /** 선택된 월 key (year*12+month) 또는 null(=전체 월). */
  selected: number | null;
  onSelect: (key: number | null) => void;
};

export default function SavedMonthScrubber({ items, selected, onSelect }: Props) {
  const options = monthOptionsOf(items);
  // 월이 하나뿐이거나 0개면 스크러버 의미 없음(선택할 게 없음) → 숨김.
  // (부모가 연·월 모드 토글은 별개로 노출 — 여기선 칩만 조건부.)
  if (options.length <= 1) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      // flexGrow/flexShrink:0 — column 부모(Saved)에서 가로 ScrollView가 세로 남는 공간을
      // 흡수해 칩이 stretch 되는 문제 방지. 자기 콘텐츠 높이만 차지. (cf. saved.tsx viewFilterScroll)
      style={{ flexGrow: 0, flexShrink: 0 }}
      accessibilityRole="tablist"
      accessibilityLabel="연·월 필터"
    >
      {options.map(({ key, label }) => {
        const active = selected === key;
        return (
          <Pressable
            key={key}
            onPress={() => onSelect(active ? null : key)}
            accessibilityRole="tab"
            accessibilityLabel={`${label} 저장작`}
            accessibilityState={{ selected: active }}
            style={[styles.chip, active && styles.chipActive]}
            hitSlop={4}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // SavedGenreChips.row 와 동일 — 가로 행, sm gap, lg 좌우 여백.
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  chip: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm + 4,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'transparent',
  },
  // non-amber selected — surface-raised 면 + text-primary (M1 패턴).
  chipActive: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  chipTextActive: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
});

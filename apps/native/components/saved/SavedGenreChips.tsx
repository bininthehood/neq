/**
 * SavedGenreChips — Saved 화면 1차 장르 필터 칩바 (Track B UI).
 *
 * - 동적·개인화: 27개 전부 나열 금지. 현재 저장 작품들에 실제 존재하는 장르만,
 *   빈도 내림차순 (가장 많이 저장한 장르 먼저). 맨 앞 '전체'.
 * - 단일 선택: 한 번에 한 장르 active. '전체' = 해제(null).
 * - 다중장르 friendly: 탭한 장르를 genres 에 포함한 저장분만 표시 (교집합 아님).
 * - genres 없는(백필 미스) 항목은 '전체' 에선 보이고, 특정 장르 선택 시 제외
 *   (predicate 는 부모 saved.tsx 파이프라인에서 처리 — 본 컴포넌트는 칩 목록만).
 *
 * 칩 스타일 출처: DESIGN.md Decisions Log 2026-05-06 ("칩 selected = solid amber
 * fill + inverse text"). FilterChips.tsx Option 패턴과 동일 시각 언어 — 새 비주얼
 * 토큰 도입 없음.
 */
import { Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { getGenreLabels } from '@neq/core';
import type { SavedItem } from '../../lib/types';
import { colors, radius, spacing } from '../../lib/tokens';

/**
 * 저장 작품(tab/OTT 필터 적용 후)에서 실제 존재하는 장르 라벨을 빈도 내림차순으로.
 * 미매핑 id 는 getGenreLabels 가 skip. 동일 빈도면 라벨 가나다(안정 정렬)로 tie-break.
 */
export function genreLabelsByFrequency(items: SavedItem[]): string[] {
  const count = new Map<string, number>();
  for (const s of items) {
    // 한 작품이 같은 라벨을 두 번 세지 않도록 Set 경유 (multi-genre 작품 안전).
    for (const label of new Set(getGenreLabels(s.recommendation.genres))) {
      count.set(label, (count.get(label) ?? 0) + 1);
    }
  }
  return Array.from(count.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))
    .map(([label]) => label);
}

/** 저장 작품이 선택 장르 라벨을 포함하는지 (다중장르 friendly — 교집합 아님). */
export function itemHasGenre(item: SavedItem, label: string): boolean {
  return getGenreLabels(item.recommendation.genres).includes(label);
}

type Props = {
  /** tab/OTT 필터 적용 후 작품 목록 — 여기서 빈도 칩 목록 계산. */
  items: SavedItem[];
  selected: string | null;
  onSelect: (label: string | null) => void;
};

export default function SavedGenreChips({ items, selected, onSelect }: Props) {
  const labels = genreLabelsByFrequency(items);
  // 칩이 '전체' 하나뿐이면(장르 정보가 아무 것도 없음) 필터 의미 없음 → 숨김.
  if (labels.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityRole="tablist"
      accessibilityLabel="장르 필터"
    >
      <GenreChip
        label="전체"
        active={selected === null}
        onPress={() => onSelect(null)}
      />
      {labels.map((label) => (
        <GenreChip
          key={label}
          label={label}
          active={selected === label}
          // 같은 칩 재탭 = 해제('전체'로 복귀).
          onPress={() => onSelect(selected === label ? null : label)}
        />
      ))}
    </ScrollView>
  );
}

function GenreChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={`${label} 장르`}
      accessibilityState={{ selected: active }}
      style={[styles.chip, active && styles.chipActive]}
      hitSlop={4}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  // 칩 selected = solid amber fill + inverse text (DESIGN.md 2026-05-06).
  chip: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm + 4,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'transparent',
  },
  chipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  chipTextActive: {
    color: colors.textInverse,
    fontWeight: '600',
  },
});

// ponytail: 빈도 정렬 + include 매칭 self-check. require.main 게이트로 import 부작용 0.
if (require.main === module) {
  const mk = (tmdbId: number, genres?: number[]): SavedItem =>
    ({ savedAt: tmdbId, recommendation: { tmdbId, genres } }) as unknown as SavedItem;
  // 28=액션, 18=드라마, 35=코미디. 액션 3회 / 드라마 2회 / 코미디 1회 기대.
  const items = [
    mk(1, [28, 18]),
    mk(2, [28]),
    mk(3, [28, 35]),
    mk(4, [18]),
    mk(5, undefined), // 백필 미스 — 어느 라벨에도 안 세짐.
    mk(6, [999999]), // 미매핑 id — skip.
  ];
  const labels = genreLabelsByFrequency(items);
  console.assert(labels[0] === '액션', `top=액션, got ${labels[0]}`);
  console.assert(labels[1] === '드라마', `2nd=드라마, got ${labels[1]}`);
  console.assert(labels[2] === '코미디', `3rd=코미디, got ${labels[2]}`);
  console.assert(labels.length === 3, `라벨 3종(미매핑/미보유 제외), got ${labels.length}`);
  // include 매칭 — 다중장르 작품은 각 라벨에 매칭.
  console.assert(itemHasGenre(items[0], '액션') && itemHasGenre(items[0], '드라마'), 'multi-genre include');
  console.assert(!itemHasGenre(items[4], '액션'), '백필 미스 항목은 특정 장르에서 제외');
  console.assert(!itemHasGenre(items[0], '코미디'), 'non-member 제외');
  console.log('SavedGenreChips self-check OK');
}

/**
 * SavedFilterSheet (native) — OTT 필터 + 정렬 + OTT별 그룹화 토글 bottom sheet.
 *
 * web 정본: `apps/web/src/components/saved/SavedFilterSheet.tsx`.
 *  - OTT 섹션:   "전체" + availableOTTs 리스트 (체크 표시). 단일 선택.
 *  - 정렬 섹션:   저장순 / 가나다순 / 평점순 (SavedSortControl SORT_OPTIONS).
 *  - 보기 옵션:   연·월별로 그룹화 토글. (OTT별 그룹화는 native 에서 폐기 —
 *                OTT 필터로 충분. 묶기는 없음(flat) / 연·월 두 가지만.)
 *  - 헤더:        "필터" 제목 + (활성 시) 초기화 버튼 + 닫기.
 *
 * genreFilter 는 sheet 안에 UI 를 두지 않는다 (선택은 상단 SavedGenreChips 칩바 담당).
 * 다만 "초기화" 는 대칭성을 위해 장르 선택도 함께 리셋한다 (칩바 '전체' 와 별개로 sheet
 * 초기화도 장르를 해제해야 필터 도트/활성 상태가 정합) — setGenreFilter 로만 소비.
 *
 * RN 매핑:
 *  - createPortal → Modal (transparent, presentationStyle 기본).
 *  - 진입/퇴장 슬라이드는 Modal `animationType="slide"` 로 단순화 (web 의
 *    cubic-bezier transform 은 RN Modal 기본 슬라이드로 대체 — 무한 worklet 금지).
 *  - OTT 아이콘은 expo-image `<Image>`.
 */

import { useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import { getOTTIcon } from '@neq/core';
import { colors, radius, spacing, fontsV2 } from '../../lib/tokens';
import { IconClose } from '../Icons';
import { SORT_OPTIONS, type SavedSort } from './SavedSortControl';

/** web IconCheck 정합 — checkmark SVG 대신 텍스트 폴백 회피용 인라인 컴포넌트. */
function CheckMark({ color }: { color: string }) {
  return <Text style={[styles.check, { color }]}>✓</Text>;
}

type Props = {
  open: boolean;
  onClose: () => void;
  ottFilter: string | null;
  setOttFilter: (v: string | null) => void;
  availableOTTs: { name: string; count: number }[];
  sortBy: SavedSort;
  setSortBy: (v: SavedSort) => void;
  // genreFilter — UI 없음. "초기화" 대칭성만 위해 소비 (Issue 4).
  genreFilter: string | null;
  setGenreFilter: (v: string | null) => void;
};

export default function SavedFilterSheet({
  open,
  onClose,
  ottFilter,
  setOttFilter,
  availableOTTs,
  sortBy,
  setSortBy,
  genreFilter,
  setGenreFilter,
}: Props) {
  // #6 — 연·월 그룹 토글 제거. sheet 는 OTT + 정렬 + (초기화 대칭용) 장르만.
  const hasActive =
    ottFilter !== null || sortBy !== 'saved' || genreFilter !== null;

  const handleReset = useCallback(() => {
    setOttFilter(null);
    setSortBy('saved');
    setGenreFilter(null); // 칩바 '전체' 와 대칭 — 초기화도 장르 해제.
  }, [setOttFilter, setSortBy, setGenreFilter]);

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* dim backdrop — 탭하면 닫힘. */}
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="필터 닫기" />
      <View style={styles.sheet}>
        {/* grabber */}
        <View style={styles.grabberWrap} pointerEvents="none">
          <View style={styles.grabber} />
        </View>

        {/* 헤더 — 제목 / (활성 시) 초기화 / 닫기 */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>필터</Text>
          <View style={styles.headerActions}>
            {hasActive && (
              <Pressable
                onPress={handleReset}
                style={styles.resetBtn}
                accessibilityRole="button"
                accessibilityLabel="필터 초기화"
                hitSlop={6}
              >
                <Text style={styles.resetText}>초기화</Text>
              </Pressable>
            )}
            <Pressable
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="필터 닫기"
              hitSlop={6}
            >
              <IconClose size={18} color={colors.textMuted} />
            </Pressable>
          </View>
        </View>

        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ── OTT 섹션 ── */}
          {availableOTTs.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>OTT</Text>
              {/* "전체" 옵션 */}
              <Pressable
                onPress={() => setOttFilter(null)}
                accessibilityRole="button"
                accessibilityState={{ selected: ottFilter === null }}
                style={styles.row}
              >
                <Text
                  style={[
                    styles.rowTitle,
                    ottFilter === null && styles.rowTitleActive,
                  ]}
                >
                  전체
                </Text>
                {ottFilter === null && <CheckMark color={colors.accent} />}
              </Pressable>
              {availableOTTs.map(({ name, count }) => {
                const isActive = ottFilter === name;
                const iconSrc = getOTTIcon(name);
                return (
                  <Pressable
                    key={name}
                    onPress={() => setOttFilter(isActive ? null : name)}
                    accessibilityRole="button"
                    accessibilityLabel={`${name} (${count}편) ${
                      isActive ? '선택 해제' : '선택'
                    }`}
                    accessibilityState={{ selected: isActive }}
                    style={[styles.row, styles.rowBordered]}
                  >
                    <View style={styles.rowLeading}>
                      {iconSrc ? (
                        <Image
                          source={{ uri: iconSrc }}
                          style={styles.ottIcon}
                          contentFit="contain"
                          transition={0}
                        />
                      ) : null}
                      <Text
                        style={[
                          styles.rowTitle,
                          isActive && styles.rowTitleActive,
                        ]}
                        numberOfLines={1}
                      >
                        {name}
                      </Text>
                      <Text style={styles.rowCount}>{count}</Text>
                    </View>
                    {isActive && <CheckMark color={colors.accent} />}
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* ── 정렬 섹션 ── */}
          <View style={[styles.section, styles.sectionTop]}>
            <Text style={styles.sectionLabel}>정렬</Text>
            {SORT_OPTIONS.map((opt, i) => {
              const isActive = sortBy === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => setSortBy(opt.key)}
                  accessibilityRole="button"
                  accessibilityLabel={`${opt.label} ${isActive ? '선택됨' : '선택'}`}
                  accessibilityState={{ selected: isActive }}
                  style={[styles.row, i > 0 && styles.rowBordered]}
                >
                  <View style={styles.rowText}>
                    <Text
                      style={[
                        styles.rowTitle,
                        isActive && styles.rowTitleActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                    <Text style={styles.rowDesc}>{opt.desc}</Text>
                  </View>
                  {isActive && <CheckMark color={colors.accent} />}
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlayHeavy,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '78%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  grabberWrap: {
    alignItems: 'center',
    paddingTop: spacing.sm + 2,
    paddingBottom: spacing.xs,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    height: 48,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: fontsV2.display,
    color: colors.textPrimary,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  resetBtn: {
    paddingHorizontal: spacing.sm,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -spacing.sm,
  },
  body: {
    flexGrow: 0,
  },
  bodyContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl + spacing.md,
  },
  section: {
    paddingTop: spacing.sm,
  },
  sectionTop: {
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  sectionLabel: {
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.textSecondary,
    fontFamily: fontsV2.data,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    minHeight: 48,
    paddingVertical: spacing.sm,
  },
  rowBordered: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  rowLeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
    minWidth: 0,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  ottIcon: {
    width: 20,
    height: 20,
    borderRadius: radius.sm,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  rowTitleActive: {
    color: colors.accent,
    fontWeight: '600',
  },
  rowCount: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: fontsV2.data,
  },
  rowDesc: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  check: {
    fontSize: 14,
    fontWeight: '700',
  },
});

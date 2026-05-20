import { useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Modal,
} from 'react-native';
import {
  TYPE_LABELS,
  ORIGIN_LABELS,
  YEAR_LABELS,
  RATING_LABELS,
  OTT_OPTIONS,
  type FilterType,
  type FilterOrigin,
  type FilterYear,
  type FilterRating,
} from '@neq/core';
import { colors, radius, spacing, shadowsNative } from '../lib/tokens';
import { IconChevronDown } from './Icons';

type DropdownKey = 'type' | 'origin' | 'year' | 'rating' | 'ott' | null;

interface Props {
  filterType: FilterType;
  filterOrigin: FilterOrigin;
  filterYear: FilterYear;
  filterRating: FilterRating;
  filterOTTs: Set<string>;
  availableOTTs: string[];
  disabled?: boolean;
  onFilterChange: (t: FilterType, o: FilterOrigin) => void;
  onYearChange: (y: FilterYear) => void;
  onRatingChange: (r: FilterRating) => void;
  onOTTChange: (otts: Set<string>) => void;
}

const TYPE_OPTIONS: FilterType[] = ['all', 'movie', 'series', 'variety'];
const ORIGIN_OPTIONS: FilterOrigin[] = ['all', 'kr', 'foreign'];
const YEAR_OPTIONS: FilterYear[] = ['all', 'recent', '2010s', 'classic'];
const RATING_OPTIONS: FilterRating[] = ['all', '7', '8', '9'];

export default function FilterChips({
  filterType,
  filterOrigin,
  filterYear,
  filterRating,
  filterOTTs,
  availableOTTs,
  disabled,
  onFilterChange,
  onYearChange,
  onRatingChange,
  onOTTChange,
}: Props) {
  const [openDropdown, setOpenDropdown] = useState<DropdownKey>(null);
  // 2026-05-20 — chip row 의 viewport 절대 좌표 측정. dropdown 패널 위치 결정용.
  // openDropdown 변경 시 측정 → Modal 안 panel top = chipRowRect.y + chipRowRect.h.
  const wrapRef = useRef<View>(null);
  const [chipRowRect, setChipRowRect] = useState<{ y: number; h: number } | null>(
    null,
  );

  const ottLabel =
    filterOTTs.size === 0
      ? 'OTT'
      : filterOTTs.size === 1
        ? [...filterOTTs][0]
        : `OTT ${filterOTTs.size}개`;

  function toggle(key: DropdownKey) {
    setOpenDropdown((prev) => {
      const next = prev === key ? null : key;
      // 열 때만 측정 — closed → open 전이.
      if (next !== null && wrapRef.current) {
        wrapRef.current.measureInWindow((_x, y, _w, h) => {
          setChipRowRect({ y, h });
        });
      }
      return next;
    });
  }

  function Chip({
    active,
    isOpen,
    label,
    onPress,
  }: {
    active: boolean;
    isOpen: boolean;
    label: string;
    onPress: () => void;
  }) {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={[
          styles.chip,
          active && styles.chipActive,
          isOpen && styles.chipOpen,
          disabled && styles.chipDisabled,
        ]}
      >
        <Text style={[styles.chipText, active && styles.chipTextActive]}>
          {label}
        </Text>
        {/* 2026-05-20 — `▾` 텍스트 글리프(fontSize 11) 는 native 시스템 폰트에서
            얇고 작게 렌더되어 사용자가 "아이콘이 너무 작음" 보고. SVG IconChevronDown
            (size 12, strokeWidth 2) 로 교체해 가독성 확보. */}
        <IconChevronDown size={12} color={colors.textMuted} />
      </Pressable>
    );
  }

  function Option({
    active,
    label,
    onPress,
  }: {
    active: boolean;
    label: string;
    onPress: () => void;
  }) {
    return (
      <Pressable
        onPress={onPress}
        style={[styles.option, active && styles.optionActive]}
      >
        <Text style={[styles.optionText, active && styles.optionTextActive]}>
          {label}
        </Text>
      </Pressable>
    );
  }

  return (
    <View ref={wrapRef} style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        <Chip
          active={filterType !== 'all'}
          isOpen={openDropdown === 'type'}
          label={TYPE_LABELS[filterType]}
          onPress={() => toggle('type')}
        />
        <Chip
          active={filterOrigin !== 'all'}
          isOpen={openDropdown === 'origin'}
          label={ORIGIN_LABELS[filterOrigin]}
          onPress={() => toggle('origin')}
        />
        <Chip
          active={filterYear !== 'all'}
          isOpen={openDropdown === 'year'}
          label={YEAR_LABELS[filterYear]}
          onPress={() => toggle('year')}
        />
        <Chip
          active={filterRating !== 'all'}
          isOpen={openDropdown === 'rating'}
          label={RATING_LABELS[filterRating]}
          onPress={() => toggle('rating')}
        />
        {availableOTTs.length > 0 && (
          <Chip
            active={filterOTTs.size > 0}
            isOpen={openDropdown === 'ott'}
            label={ottLabel}
            onPress={() => toggle('ott')}
          />
        )}
      </ScrollView>

      {/* 2026-05-20 — dropdown 외부 탭 시 닫기 (사용자 보고). PWA FilterChips 는
          `<div className="fixed inset-0" onClick={close}>` backdrop + panel 패턴.
          native 정합 위해 Modal(transparent, animationType=none) 안에 backdrop
          Pressable + panel. panel 위치는 chip row 의 measureInWindow 결과로 결정. */}
      <Modal
        visible={openDropdown !== null}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => setOpenDropdown(null)}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => setOpenDropdown(null)}
          accessibilityLabel="필터 닫기"
        >
          {/* panel 자체 Pressable 로 wrap → 안 클릭이 backdrop 까지 propagation
              안 됨. onPress 빈 함수 = 이벤트 흡수만. */}
          <Pressable
            onPress={() => {}}
            style={[
              styles.panel,
              {
                position: 'absolute',
                top: chipRowRect
                  ? chipRowRect.y + chipRowRect.h - spacing.sm
                  : 100,
                left: spacing.md,
                right: spacing.md,
              },
            ]}
          >
          {openDropdown === 'type' &&
            TYPE_OPTIONS.map((t) => (
              <Option
                key={t}
                active={filterType === t}
                label={t === 'all' ? '전체' : TYPE_LABELS[t]}
                onPress={() => {
                  onFilterChange(t, filterOrigin);
                  setOpenDropdown(null);
                }}
              />
            ))}
          {openDropdown === 'origin' &&
            ORIGIN_OPTIONS.map((o) => (
              <Option
                key={o}
                active={filterOrigin === o}
                label={o === 'all' ? '전체' : ORIGIN_LABELS[o]}
                onPress={() => {
                  onFilterChange(filterType, o);
                  setOpenDropdown(null);
                }}
              />
            ))}
          {openDropdown === 'year' &&
            YEAR_OPTIONS.map((y) => (
              <Option
                key={y}
                active={filterYear === y}
                label={y === 'all' ? '전체' : YEAR_LABELS[y]}
                onPress={() => {
                  onYearChange(y);
                  setOpenDropdown(null);
                }}
              />
            ))}
          {openDropdown === 'rating' &&
            RATING_OPTIONS.map((r) => (
              <Option
                key={r}
                active={filterRating === r}
                label={r === 'all' ? '전체' : RATING_LABELS[r]}
                onPress={() => {
                  onRatingChange(r);
                  setOpenDropdown(null);
                }}
              />
            ))}
          {openDropdown === 'ott' && (
            <>
              <Option
                active={filterOTTs.size === 0}
                label="모든 OTT"
                onPress={() => {
                  onOTTChange(new Set());
                  setOpenDropdown(null);
                }}
              />
              {availableOTTs.map((ott) => {
                const selected = filterOTTs.has(ott);
                return (
                  <Option
                    key={ott}
                    active={selected}
                    label={ott}
                    onPress={() => {
                      const next = new Set(filterOTTs);
                      if (selected) next.delete(ott);
                      else next.add(ott);
                      onOTTChange(next);
                    }}
                  />
                );
              })}
            </>
          )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// Re-export for callers that build available OTT list.
export { OTT_OPTIONS };

const styles = StyleSheet.create({
  wrap: {
    flexShrink: 0,
    position: 'relative',
    zIndex: 10,
  },
  chipRow: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm + 4,
    paddingTop: spacing.sm + 2,
    paddingBottom: 6,
    minHeight: 44,
    gap: 4,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  chipActive: {
    borderBottomColor: colors.accent,
  },
  chipOpen: {
    transform: [{ scale: 1.02 }],
  },
  chipDisabled: {
    opacity: 0.5,
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '400',
  },
  chipTextActive: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  // E-2 (2026-05-19 정합 audit) — caret 은 web 정합으로 fontSize 11 + opacity 0.3.
  // web FilterChips 의 `<span aria-hidden style={{ fontSize: 11, opacity: 0.3 }}>` 정합.
  caret: {
    color: colors.textMuted,
    fontSize: 11,
    opacity: 0.3,
  },
  panel: {
    position: 'absolute',
    top: '100%',
    left: spacing.md,
    right: spacing.md,
    padding: spacing.sm + 4,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.lg,
    // T-2 — dropdown 그림자 var(--shadow-dropdown). shadowsNative 헬퍼 경유.
    ...shadowsNative.dropdown,
    zIndex: 100,
  },
  option: {
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: 'transparent',
  },
  // 2026-05-06 결정 — 칩 selected = solid amber fill + inverse text.
  // accentDim 면 패턴(이전 결정 잔재)은 anti-slop #6 예외 2(reason 한정) 위반.
  // web FilterChips: background var(--accent) + color var(--text-inverse).
  optionActive: {
    backgroundColor: colors.accent,
  },
  optionText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '400',
  },
  optionTextActive: {
    color: colors.textInverse,
    fontWeight: '600',
  },
});

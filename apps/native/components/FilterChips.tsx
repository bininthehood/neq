import { useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Modal,
  Alert,
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
import { IconCheck, IconChevronDown } from './Icons';

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
  /**
   * 2026-06-18 ("내 OTT 만 보기" 토글 — 1.0.3 train).
   * subscribedOtt (account_prefs) 가 비어있지 않을 때만 의미 있는 토글.
   * - myOTTToggle: 현재 토글 상태 (true = ON = subscribedOtt 셋이 filterOTTs 에 적용됨)
   * - myOTTAvailable: 구독 OTT 보유 여부. false 면 chip disabled + tap 시 CTA 노출
   * - onMyOTTToggle: 토글 상태 변경 핸들러
   * - onMyOTTSetupNavigate: disabled 상태에서 tap → 구독 OTT 설정 화면(Profile) 진입
   */
  myOTTToggle: boolean;
  myOTTAvailable: boolean;
  onMyOTTToggle: (next: boolean) => void;
  onMyOTTSetupNavigate: () => void;
  /**
   * 4차 (2026-07-10) — dropdown 이 열리는 순간 호출. 호스트(Discover)가 카드
   * 케밥 인메뉴를 닫아 두 드롭다운 동시 오픈을 방지한다. 역방향(dropdown 열림 중
   * 케밥 탭)은 본 컴포넌트의 Modal backdrop 이 이미 차단.
   */
  onDropdownOpen?: () => void;
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
  myOTTToggle,
  myOTTAvailable,
  onMyOTTToggle,
  onMyOTTSetupNavigate,
  onDropdownOpen,
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
      // 4차 — 열림 전이 시 호스트에 통지 (케밥 인메뉴 동시 오픈 방지).
      if (next !== null) onDropdownOpen?.();
      return next;
    });
  }

  function Chip({
    active,
    isOpen,
    label,
    kind,
    onPress,
  }: {
    active: boolean;
    isOpen: boolean;
    label: string;
    // 안정적 식별자 (라벨이 동적이라 a11y/E2E 매칭 용).
    kind: '유형' | '국가' | '년도' | '별점' | 'OTT';
    onPress: () => void;
  }) {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${kind} 필터`}
        accessibilityState={{ expanded: isOpen, selected: active }}
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
    disabled: optDisabled = false,
  }: {
    active: boolean;
    label: string;
    onPress: () => void;
    /** 2026-06-10 (Phase C #6) — OTT 옵션이 결과 모집단에 없을 때 dim/비활성. */
    disabled?: boolean;
  }) {
    return (
      <Pressable
        onPress={onPress}
        disabled={optDisabled}
        accessibilityRole="button"
        accessibilityLabel={`${label} 선택`}
        accessibilityState={{ selected: active, disabled: optDisabled }}
        style={[
          styles.option,
          active && styles.optionActive,
          optDisabled && styles.optionDisabled,
        ]}
      >
        <Text
          style={[
            styles.optionText,
            active && styles.optionTextActive,
            optDisabled && styles.optionTextDisabled,
          ]}
        >
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
        {/* 2026-06-18 ("내 OTT 만 보기" 토글 — 1.0.3 train) — chip row 의 leftmost.
            기존 5칩 (유형/국가/년도/별점/OTT) 은 dropdown picker → 시각: border-bottom amber.
            본 chip 은 단발 액션 토글 → 시각 구분 위해 *filled chip*:
              ON  : background = accent / text = textInverse / IconCheck 표시
              OFF : background = transparent + border / text = textPrimary
              dis : opacity 0.5 + textMuted (subscribedOtt 0건)
            DESIGN.md L227 Quiet Ink + L466 IconCheck SVG (raw ✓ 글리프 금지) 정합. */}
        <Pressable
          onPress={() => {
            if (disabled) return;
            if (!myOTTAvailable) {
              // subscribedOtt 0건 — Alert + Profile 네비게이션 (사용자 결정 #3).
              Alert.alert(
                '내 OTT 설정',
                '먼저 구독 중인 OTT 를 알려주세요.\n프로필에서 설정할 수 있어요.',
                [
                  { text: '취소', style: 'cancel' },
                  { text: '설정하기', onPress: onMyOTTSetupNavigate },
                ],
              );
              return;
            }
            onMyOTTToggle(!myOTTToggle);
          }}
          disabled={disabled}
          accessibilityRole="switch"
          accessibilityLabel="내 OTT 만 보기"
          accessibilityState={{
            checked: myOTTToggle,
            disabled: disabled || !myOTTAvailable,
          }}
          style={[
            styles.myOTTChip,
            myOTTToggle && myOTTAvailable && styles.myOTTChipActive,
            (disabled || !myOTTAvailable) && styles.myOTTChipDisabled,
          ]}
        >
          {myOTTToggle && myOTTAvailable && (
            <IconCheck size={12} color={colors.textInverse} />
          )}
          <Text
            style={[
              styles.myOTTChipText,
              myOTTToggle && myOTTAvailable && styles.myOTTChipTextActive,
              !myOTTAvailable && styles.myOTTChipTextDisabled,
            ]}
          >
            내 OTT
          </Text>
        </Pressable>
        <Chip
          active={filterType !== 'all'}
          isOpen={openDropdown === 'type'}
          label={TYPE_LABELS[filterType]}
          kind="유형"
          onPress={() => toggle('type')}
        />
        <Chip
          active={filterOrigin !== 'all'}
          isOpen={openDropdown === 'origin'}
          label={ORIGIN_LABELS[filterOrigin]}
          kind="국가"
          onPress={() => toggle('origin')}
        />
        <Chip
          active={filterYear !== 'all'}
          isOpen={openDropdown === 'year'}
          label={YEAR_LABELS[filterYear]}
          kind="년도"
          onPress={() => toggle('year')}
        />
        <Chip
          active={filterRating !== 'all'}
          isOpen={openDropdown === 'rating'}
          label={RATING_LABELS[filterRating]}
          kind="별점"
          onPress={() => toggle('rating')}
        />
        {/* 2026-06-10 (Phase C #6) — OTT 칩 항상 고정 노출.
            이전: `availableOTTs.length > 0` gate 로 결과 0 이면 칩 자체 숨김 → 점진 reveal 슬롭.
            현재: OTT_OPTIONS 7종 항상 mount, dropdown 내부 옵션이 availableOTTs 기준 disabled.
            DESIGN.md L230 시각 앵커 유지 + L266 동시 움직임 최대 3개 정합. */}
        <Chip
          active={filterOTTs.size > 0}
          isOpen={openDropdown === 'ott'}
          label={ottLabel}
          kind="OTT"
          onPress={() => toggle('ott')}
        />
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
              안 됨. onPress 빈 함수 = 이벤트 흡수만. accessible={false} 로 자식
              Option 들이 a11y tree 에 leaf 로 노출되게 한다 (Pressable wrap 이
              기본적으로 자식 a11y 흡수). */}
          <Pressable
            onPress={() => {}}
            accessible={false}
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
              {/* 2026-06-10 (Phase C #6) — OTT_OPTIONS 7종 전부 mount.
                  availableOTTs 에 없는 OTT 는 disabled (text-muted + opacity 0.5).
                  사용자가 사전 의도("Disney+ 만 보고 싶다")를 잃지 않도록 selected 상태는
                  유지하되 비활성화 — 결과 0 시 dim 시각으로 "이번 추천엔 매칭 없음" 신호.
                  DESIGN.md L230 시각 앵커 유지. */}
              {OTT_OPTIONS.map((ott) => {
                const selected = filterOTTs.has(ott);
                const isAvailable = availableOTTs.includes(ott);
                return (
                  <Option
                    key={ott}
                    active={selected}
                    label={ott}
                    disabled={!isAvailable}
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
  // 2026-06-10 (Phase C #6) — OTT 옵션 비활성 시각 — text-muted + opacity 0.5.
  // DESIGN.md L227 Quiet Ink: 추가 카피/아이콘 없이 단순 dim. 사용자에게 "결과 없음" 신호.
  optionDisabled: {
    opacity: 0.5,
  },
  optionTextDisabled: {
    color: colors.textMuted,
  },
  // 2026-06-18 ("내 OTT 만 보기" 토글 — 1.0.3 train) — chip row leftmost.
  // 시각 차별: 기존 chip 의 border-bottom 패턴 대신 filled toggle.
  // - OFF (default): bg transparent / border 1px subtle / textPrimary
  // - ON           : bg accent / IconCheck + textInverse / border 투명
  // - disabled     : opacity 0.5 + textMuted (subscribedOtt 0건)
  // DESIGN.md L466 IconCheck SVG 정본 + L227 Quiet Ink 정합.
  myOTTChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm + 4,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    minHeight: 44,
    gap: 4,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'transparent',
  },
  myOTTChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  myOTTChipDisabled: {
    opacity: 0.5,
  },
  myOTTChipText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '500',
  },
  myOTTChipTextActive: {
    color: colors.textInverse,
    fontWeight: '600',
  },
  myOTTChipTextDisabled: {
    color: colors.textMuted,
  },
});

/**
 * SavedMonthScrubber — #6 연·월 룰러(자) 타임라인 스크러버.
 *
 * 연·월 모드 ON 일 때만 렌더. 칩 나열(2026-07-08 이전) → 룰러 재설계:
 *   - 연속 스케일: 첫 저장 월 ~ 현재 월을 월 단위 눈금으로 자처럼 배치.
 *     빈 달도 눈금 포함(흐리게) — 데이터 있는 달만 도트 + 밝은 눈금.
 *     연도 라벨은 연 경계(1월)와 첫 눈금에만. 장르 칩바(pill)와 시각 언어 분리.
 *   - 스냅 선택: 중앙 고정 인디케이터 + 가로 스크롤. 정지 → 가장 가까운 유효
 *     정지점(데이터 월 또는 '전체' 존)에 스냅 = 그 달 자동 선택. 빈 달은 정지점
 *     아님(resolveSnapIndex 가 선해석 — 부모 stale 가드와의 왕복 차단).
 *   - 해제: 축 맨 앞(최신 우측)의 '전체' 스냅 존 = null(전체 월). 기본 위치.
 *   - 탭 = 해당 월 즉시 선택(+중앙 정렬) — a11y/VoiceOver 및 스크롤 없는 빠른 경로.
 *   - active 강조 non-amber: textPrimary 눈금/도트 (DESIGN.md L33 Saved amber ≤4 방어).
 *
 * 필터 의미는 기존과 동일: 선택 = 그 달 저장분만 표시. selectedMonth/monthKeyOf
 * 파이프라인(saved.tsx) 그대로 소비 — UI 레이어만 교체.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ScrollView,
  Pressable,
  Text,
  View,
  StyleSheet,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import type { SavedItem } from '../../lib/types';
import { colors, spacing } from '../../lib/tokens';
import { rulerSlotsOf, resolveSnapIndex } from './SavedSortControl';

type Props = {
  /** tab ∩ OTT ∩ 검색 ∩ 장르 까지 적용된 목록 — 룰러 범위/도트의 기준. */
  items: SavedItem[];
  /** 선택된 월 key (year*12+month) 또는 null(=전체 월). */
  selected: number | null;
  onSelect: (key: number | null) => void;
};

const TICK_W = 44; // 눈금 간격 = 스냅 간격

export default function SavedMonthScrubber({ items, selected, onSelect }: Props) {
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);

  const slots = useMemo(() => {
    const d = new Date();
    return rulerSlotsOf(items, d.getFullYear() * 12 + d.getMonth());
  }, [items]);

  const allIdx = slots.length; // '전체' 존 인덱스 (축 맨 우측)
  const indexOf = useCallback(
    (key: number | null) =>
      key === null ? allIdx : slots.findIndex((s) => s.key === key),
    [slots, allIdx],
  );

  // 외부 selected 변화(스냅 결과 반영 / stale 가드 리셋 / 토글 재진입) → 스크롤 위치 동기.
  const settledIdxRef = useRef<number>(indexOf(selected));
  // 마운트 시점 위치만 — 이후 동기는 아래 effect 의 scrollTo 로 (reactive prop 이면
  // 탭 선택 시 점프+애니메이션 이중 스크롤).
  const initialOffsetX = useRef(Math.max(0, indexOf(selected)) * TICK_W).current;
  useEffect(() => {
    const idx = indexOf(selected);
    if (idx < 0) return; // 상위 필터 변경 직후 과도기 — stale 가드가 곧 null 로 복귀
    if (idx !== settledIdxRef.current) {
      settledIdxRef.current = idx;
      scrollRef.current?.scrollTo({ x: idx * TICK_W, animated: true });
    }
  }, [selected, indexOf]);

  if (slots.length === 0) return null;

  // 어느 눈금이든 화면 중앙(고정 인디케이터)에 올 수 있도록 좌우 패딩 = 반폭 - 반눈금.
  const sidePad = Math.max(0, width / 2 - TICK_W / 2);

  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const idx = resolveSnapIndex(slots, x / TICK_W);
    if (Math.abs(idx * TICK_W - x) > 1) {
      // 빈 달 정지 → 유효 정지점으로 보정 스크롤 (momentum end 재발화 시 idempotent)
      scrollRef.current?.scrollTo({ x: idx * TICK_W, animated: true });
    }
    settledIdxRef.current = idx;
    onSelect(idx === allIdx ? null : slots[idx].key);
  };

  return (
    <View style={styles.wrap}>
      {/* 중앙 스냅 바늘 — 스크롤 영역 밖(위) 별도 행. 눈금/라벨을 가리지 않고
          아래 눈금을 가리킨다. */}
      <View pointerEvents="none" style={styles.needleRow}>
        <View style={styles.needle} />
      </View>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={TICK_W}
        decelerationRate="fast"
        onMomentumScrollEnd={settle}
        contentOffset={{ x: initialOffsetX, y: 0 }}
        contentContainerStyle={{ paddingHorizontal: sidePad }}
        // flexGrow/flexShrink:0 — column 부모(Saved)에서 가로 ScrollView 세로 stretch 방지.
        style={{ flexGrow: 0, flexShrink: 0 }}
        accessibilityRole="tablist"
        accessibilityLabel="연·월 필터"
      >
        {slots.map((slot) => {
          const active = selected === slot.key;
          return slot.hasData ? (
            <Pressable
              key={slot.key}
              onPress={() => onSelect(slot.key)}
              accessibilityRole="tab"
              accessibilityLabel={`${slot.label} 저장작`}
              accessibilityState={{ selected: active }}
              style={styles.slot}
            >
              <Text style={styles.yearLabel}>{slot.yearLabel ?? ''}</Text>
              <View style={[styles.dot, active && styles.dotActive]} />
              <View style={[styles.tick, styles.tickData, active && styles.tickActive]} />
              <Text style={[styles.monthLabel, active && styles.monthLabelActive]}>
                {slot.month}월
              </Text>
            </Pressable>
          ) : (
            <View
              key={slot.key}
              accessible
              accessibilityLabel={`${slot.label} 저장 없음`}
              style={styles.slot}
            >
              <Text style={styles.yearLabel}>{slot.yearLabel ?? ''}</Text>
              <View style={styles.dotPlaceholder} />
              <View style={styles.tick} />
              <Text style={[styles.monthLabel, styles.monthLabelEmpty]}>{slot.month}월</Text>
            </View>
          );
        })}
        {/* '전체' 스냅 존 — 축 맨 앞(최신 우측). 여기 정지/탭 = 월 필터 해제. */}
        <Pressable
          onPress={() => onSelect(null)}
          accessibilityRole="tab"
          accessibilityLabel="전체 월"
          accessibilityState={{ selected: selected === null }}
          style={[styles.slot, styles.allSlot]}
        >
          <Text style={[styles.allLabel, selected === null && styles.allLabelActive]}>
            전체
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const SLOT_H = 52;

const styles = StyleSheet.create({
  wrap: {
    // 인디케이터 absolute 기준 + 세로 stretch 방지 (칩바 FAIL-B 전례와 동일 방어)
    flexGrow: 0,
    flexShrink: 0,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  slot: {
    width: TICK_W,
    height: SLOT_H,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  yearLabel: {
    height: 13,
    fontSize: 9,
    lineHeight: 13,
    color: colors.textMuted,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginVertical: 3,
    backgroundColor: colors.textSecondary,
  },
  dotActive: {
    backgroundColor: colors.textPrimary,
  },
  dotPlaceholder: {
    width: 4,
    height: 4,
    marginVertical: 3,
  },
  tick: {
    width: 2,
    height: 12,
    borderRadius: 1,
    backgroundColor: colors.border,
  },
  tickData: {
    backgroundColor: colors.textSecondary,
  },
  tickActive: {
    backgroundColor: colors.textPrimary,
  },
  monthLabel: {
    marginTop: 3,
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  monthLabelActive: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  monthLabelEmpty: {
    color: colors.textMuted,
  },
  allSlot: {
    justifyContent: 'center',
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.border,
  },
  allLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  allLabelActive: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  needleRow: {
    alignItems: 'center',
    marginBottom: 2,
  },
  needle: {
    width: 2,
    height: 8,
    borderRadius: 1,
    backgroundColor: colors.textPrimary,
    opacity: 0.85,
  },
});

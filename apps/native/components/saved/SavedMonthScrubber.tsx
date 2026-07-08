/**
 * SavedMonthScrubber — #6 연·월 룰러(자) 타임라인 스크러버.
 *
 * 2026-07-08 외주 목업(`Saved 룰러 스크러버 목업.html`) 반영 — 시각/모션 레이어 업스케일:
 *   - 연속 베이스라인(borderSubtle 1px) 아래로 가변 높이 눈금이 매달리는 테이프 언어.
 *     눈금 높이 위계: 연 경계 16 > 선택 12 > 데이터 8 > 빈 달 6.
 *   - 스크롤 중 실시간(live) 하이라이트 — 중앙에 가장 가까운 눈금이 따라 밝아짐.
 *     확정(settle) 시 바늘이 amber 로 320ms 플래시 (transient — amber 예산 카운트 제외).
 *   - 바늘 = 하향 삼각형 포인터, 스크롤 영역 밖 상단 (콘텐츠 가림 금지 — 사용자 확정).
 *   - 축 양끝 bg fade — 연속 축 느낌. 연 라벨은 GeistMono(fontsV2.data).
 *   - '전체' 존: divider(1×34) 분리 + 폭 56, 선택 시 라벨 확대(13→14).
 *
 * 동작(스냅 선택/해제/빈 달 선해석)은 기존과 동일 — selectedMonth/monthKeyOf 파이프라인
 * 재사용. 빈 달은 정지점 아님: resolveSnapIndex 가 인접 데이터 달로 선해석 (부모
 * stale 가드와의 왕복 차단). '전체' 존 오프셋이 비균등이라 snapToOffsets 사용.
 *
 * a11y (E2E loop-verify-ruler.mjs 계약 — 변경 금지):
 *   컨테이너 `연·월 필터` / 데이터 눈금 `${label} 저장작` / 빈 눈금 `${label} 저장 없음`
 *   / `전체 월`. 눈금 내부 Text 는 accessible 부모에 평탄화 — 라벨로만 검출 가능.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { LinearGradient } from 'expo-linear-gradient';
import type { SavedItem } from '../../lib/types';
import { colors, spacing, fontsV2 } from '../../lib/tokens';
import { rulerSlotsOf, resolveSnapIndex } from './SavedSortControl';

type Props = {
  /** tab ∩ OTT ∩ 검색 ∩ 장르 까지 적용된 목록 — 룰러 범위/도트의 기준. */
  items: SavedItem[];
  /** 선택된 월 key (year*12+month) 또는 null(=전체 월). */
  selected: number | null;
  onSelect: (key: number | null) => void;
};

const TICK_W = 44; // 월 눈금 간격
const DIVIDER_W = 25; // 월 축 ↔ '전체' 존 사이 구분 슬롯
const ALL_W = 56; // '전체' 존 폭
const NEEDLE_H = 12; // 바늘 행 높이 (fade top 기준)
const FLASH_MS = 320;

export default function SavedMonthScrubber({ items, selected, onSelect }: Props) {
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [flash, setFlash] = useState(false);
  // 스크롤 중 중앙에 가장 가까운 눈금 key ('all' = 전체 존) — 시각 하이라이트 전용.
  const [live, setLive] = useState<number | 'all'>(selected ?? 'all');

  const slots = useMemo(() => {
    const d = new Date();
    return rulerSlotsOf(items, d.getFullYear() * 12 + d.getMonth());
  }, [items]);

  const allIdx = slots.length;
  // '전체' 존 스냅 오프셋: 월 눈금은 균등(i×44)이지만 전체 존은 divider(25) 뒤
  // 폭 56 중앙 — 잔여 = DIVIDER_W + ALL_W/2 - TICK_W/2 = 31. 우패딩(반폭-28)과 합쳐
  // 정확히 max scroll 지점이 된다.
  const offsetOf = useCallback(
    (idx: number) =>
      idx === allIdx ? allIdx * TICK_W + DIVIDER_W + ALL_W / 2 - TICK_W / 2 : idx * TICK_W,
    [allIdx],
  );
  const indexOf = useCallback(
    (key: number | null) =>
      key === null ? allIdx : slots.findIndex((s) => s.key === key),
    [slots, allIdx],
  );

  const triggerFlash = useCallback(() => {
    setFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(false), FLASH_MS);
  }, []);
  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  // 외부 selected 변화(스냅 결과 반영 / stale 가드 리셋 / 토글 재진입) → 스크롤 위치 동기.
  const settledIdxRef = useRef<number>(indexOf(selected));
  const initialOffsetX = useRef(offsetOf(Math.max(0, indexOf(selected)))).current;
  useEffect(() => {
    const idx = indexOf(selected);
    if (idx < 0) return; // 상위 필터 변경 직후 과도기 — stale 가드가 곧 null 로 복귀
    if (idx !== settledIdxRef.current) {
      settledIdxRef.current = idx;
      setLive(idx === allIdx ? 'all' : slots[idx].key);
      scrollRef.current?.scrollTo({ x: offsetOf(idx), animated: true });
    }
  }, [selected, indexOf, offsetOf, allIdx, slots]);

  if (slots.length === 0) return null;

  // 좌패딩 = 첫 월 눈금 중앙 정렬, 우패딩 = '전체' 존 중앙 정렬 (max scroll 지점).
  const padLeft = Math.max(0, width / 2 - TICK_W / 2);
  const padRight = Math.max(0, width / 2 - ALL_W / 2);
  const snapOffsets = [...slots.map((_, i) => i * TICK_W), offsetOf(allIdx)];

  const nearestIdx = (x: number) => {
    let best = 0;
    let bd = Infinity;
    snapOffsets.forEach((o, i) => {
      const d = Math.abs(o - x);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = nearestIdx(e.nativeEvent.contentOffset.x);
    const key = idx === allIdx ? 'all' : slots[idx].key;
    if (key !== live) setLive(key);
  };

  const commit = (idx: number) => {
    settledIdxRef.current = idx;
    const key = idx === allIdx ? null : slots[idx].key;
    setLive(key ?? 'all');
    if (key !== selected) triggerFlash();
    onSelect(key);
  };

  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const idx = resolveSnapIndex(slots, nearestIdx(x));
    if (Math.abs(offsetOf(idx) - x) > 1) {
      // 빈 달 정지 → 유효 정지점으로 보정 스크롤 (momentum end 재발화 시 idempotent)
      scrollRef.current?.scrollTo({ x: offsetOf(idx), animated: true });
    }
    commit(idx);
  };

  const needleColor = flash ? colors.accent : colors.textPrimary;

  return (
    <View style={styles.wrap}>
      {/* 중앙 스냅 바늘(포인터) — 스크롤 영역 밖(위) 별도 행. 확정 시 amber 플래시. */}
      <View pointerEvents="none" style={styles.needleRow}>
        <View style={[styles.needleTri, { borderTopColor: needleColor }]} />
      </View>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToOffsets={snapOffsets}
        decelerationRate="fast"
        onScroll={onScroll}
        scrollEventThrottle={32}
        onMomentumScrollEnd={settle}
        contentOffset={{ x: initialOffsetX, y: 0 }}
        contentContainerStyle={{ paddingLeft: padLeft, paddingRight: padRight }}
        // flexGrow/flexShrink:0 — column 부모(Saved)에서 가로 ScrollView 세로 stretch 방지.
        style={{ flexGrow: 0, flexShrink: 0 }}
        accessibilityRole="tablist"
        accessibilityLabel="연·월 필터"
      >
        {slots.map((slot, i) => {
          const isLive = live === slot.key;
          const isYear = slot.yearLabel !== null;
          const tickH = isYear ? 11 : isLive ? 9 : slot.hasData ? 6 : 4;
          const tickColor = isLive
            ? colors.textPrimary
            : isYear
              ? colors.textMuted
              : slot.hasData
                ? colors.borderStrong
                : colors.border;
          const onPress = () => {
            // 빈 달 탭도 유효 정지점으로 선해석 (목업 nearestData 동작 정합)
            commit(resolveSnapIndex(slots, i));
          };
          return (
            <Pressable
              key={slot.key}
              onPress={onPress}
              accessibilityRole="tab"
              accessibilityLabel={
                slot.hasData ? `${slot.label} 저장작` : `${slot.label} 저장 없음`
              }
              accessibilityState={{ selected: selected === slot.key }}
              style={styles.slot}
            >
              <Text style={styles.yearLabel}>{slot.yearLabel ?? ''}</Text>
              <View style={styles.dotRow}>
                {slot.hasData && (
                  <View
                    style={[
                      styles.dot,
                      { backgroundColor: isLive ? colors.textPrimary : colors.textSecondary },
                    ]}
                  />
                )}
              </View>
              <View style={styles.tickRow}>
                <View style={[styles.tick, { height: tickH, backgroundColor: tickColor }]} />
              </View>
              <View style={styles.labelRow}>
                <Text
                  style={[
                    styles.monthLabel,
                    isLive && styles.monthLabelLive,
                    !slot.hasData && !isLive && styles.monthLabelEmpty,
                  ]}
                >
                  {slot.month}월
                </Text>
              </View>
            </Pressable>
          );
        })}
        {/* 월 축 ↔ '전체' 존 구분 divider */}
        <View style={styles.dividerSlot}>
          <View style={styles.dividerLine} />
        </View>
        {/* '전체' 스냅 존 — 축 맨 앞(최신 우측). 여기 정지/탭 = 월 필터 해제. */}
        <Pressable
          onPress={() => commit(allIdx)}
          accessibilityRole="tab"
          accessibilityLabel="전체 월"
          accessibilityState={{ selected: selected === null }}
          style={styles.allSlot}
        >
          <Text style={[styles.allLabel, live === 'all' && styles.allLabelLive]}>전체</Text>
        </Pressable>
      </ScrollView>
      {/* 축 양끝 fade — 연속 축 강조. 바늘 행 아래부터. */}
      <LinearGradient
        pointerEvents="none"
        colors={[colors.bg, 'rgba(18, 17, 14, 0)']}
        locations={[0.15, 1]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[styles.fade, { left: 0 }]}
      />
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(18, 17, 14, 0)', colors.bg]}
        locations={[0, 0.85]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[styles.fade, { right: 0 }]}
      />
    </View>
  );
}

// 2026-07-08 높이 압축 (사용자 피드백 — 스코프 영역 과대): 64 → 49
const SLOT_H = 49; // 11(연) + 9(도트) + 14(눈금) + 15(라벨)

const styles = StyleSheet.create({
  wrap: {
    // 세로 stretch 방지 (칩바 FAIL-B 전례와 동일 방어) + fade absolute 기준
    flexGrow: 0,
    flexShrink: 0,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  needleRow: {
    height: NEEDLE_H,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 1,
  },
  // 하향 삼각형 (border trick)
  needleTri: {
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderTopWidth: 5,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  slot: {
    width: TICK_W,
    height: SLOT_H,
    alignItems: 'center',
  },
  yearLabel: {
    height: 11,
    fontFamily: fontsV2.data,
    fontSize: 9,
    lineHeight: 11,
    letterSpacing: 0.7,
    color: colors.textSecondary,
  },
  dotRow: {
    height: 9,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 3,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  // 연속 베이스라인 — 모든 월 슬롯 상단을 가로지르는 1px 라인, 눈금이 아래로 매달림.
  tickRow: {
    height: 14,
    width: '100%',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  tick: {
    width: 2,
  },
  labelRow: {
    height: 15,
    justifyContent: 'center',
  },
  monthLabel: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: -0.2,
    color: colors.textSecondary,
  },
  monthLabelLive: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  monthLabelEmpty: {
    color: colors.textMuted,
    opacity: 0.6, // 목업 #45443F 근사 — 신규 토큰 없이 textMuted 감쇠
  },
  dividerSlot: {
    width: DIVIDER_W,
    height: SLOT_H,
    alignItems: 'center',
    paddingTop: 13,
  },
  dividerLine: {
    width: 1,
    height: 26,
    backgroundColor: colors.border,
  },
  allSlot: {
    width: ALL_W,
    height: SLOT_H,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 9,
  },
  allLabel: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.26,
    color: colors.textSecondary,
  },
  allLabelLive: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  fade: {
    position: 'absolute',
    top: spacing.xs + NEEDLE_H,
    bottom: spacing.xs,
    width: 44,
  },
});

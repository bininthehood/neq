import { useRef, useState } from 'react';
import {
  Dimensions,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Path, Polyline } from 'react-native-svg';
import type { Persona } from '../lib/types';
import { colors, radius, spacing } from '../lib/tokens';
import { IconSearch } from './Icons';
import { WORDMARK_ASSET, WORDMARK_ASPECT_RATIO } from './onboarding/data';

/**
 * DiscoverHeader — Discover 탭 상단 헤더.
 *
 * web `apps/web/src/components/discover/DiscoverHeader.tsx` 의 native 포팅.
 *
 * 책임:
 *   - 워드마크 표시 (좌)
 *   - 페르소나 전환 chip (중앙, `personas.length > 1` 일 때만 — web 정합)
 *   - 검색 버튼 (우)
 *
 * 페르소나 dropdown:
 *   web 은 `createPortal` 로 body 마운트 (헤더 wrapper overflow:hidden clipping 회피).
 *   native 는 portal 개념이 없어 RN `Modal` (transparent) 로 dropdown 을 띄운다.
 *   chip 좌표를 `measureInWindow` 로 측정해 dropdown 을 chip 바로 아래에 배치 —
 *   web 의 "chip rect 기준 가운데 정렬 + 6px 간격" 정합.
 *
 * state owner: 부모 (`app/index.tsx`). chip open 상태만 본 컴포넌트 보유 (web 은 부모
 *   소유였으나 native 는 dropdown 좌표 측정이 컴포넌트 내부 책임이라 함께 보유).
 */

interface DiscoverHeaderProps {
  personas: Persona[];
  activePersonaId: string;
  activePersona: Persona | null;
  /** persona switch — 부모가 rec abort / filter 리셋 / topIdx 0 등 cleanup 수행 */
  onPersonaSwitch: (id: string) => void;
  /** dropdown "+ 새 취향 추가" — Profile 로 라우팅 */
  onAddPersona: () => void;
  onSearchOpen: () => void;
}

const MAX_PERSONAS = 3;
const WORDMARK_HEIGHT = 20; // DESIGN.md L51 — 기본 사이즈 h-5(20px)

/** dropdown 활성 항목 체크 — Icons.tsx 미보유라 inline SVG (anti-slop: raw ✓ 문자 회피) */
function CheckMark() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <Polyline
        points="20 6 9 17 4 12"
        stroke={colors.accent}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** chip chevron — web 의 8×8 chevron 정합. View 래퍼로 회전 (RN transform 관용). */
function Chevron({ open }: { open: boolean }) {
  return (
    <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
      <Svg width={9} height={9} viewBox="0 0 8 8" fill="none">
        <Path
          d="M1 2.5L4 5.5L7 2.5"
          stroke={open ? colors.accent : colors.textMuted}
          strokeWidth={1.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

export default function DiscoverHeader({
  personas,
  activePersonaId,
  activePersona,
  onPersonaSwitch,
  onAddPersona,
  onSearchOpen,
}: DiscoverHeaderProps) {
  const [open, setOpen] = useState(false);
  // chip 좌표 — measureInWindow 결과. dropdown 을 chip 바로 아래 가운데 정렬.
  const [chipRect, setChipRect] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  // web 정합 — 페르소나가 1개뿐이거나 없으면 chip 자체를 렌더하지 않는다.
  const showChip = personas.length > 1;

  const chipRef = useRef<View | null>(null);

  function openDropdown() {
    const node = chipRef.current;
    if (node) {
      node.measureInWindow((x, y, width, height) => {
        setChipRect({ x, y, width, height });
        setOpen(true);
      });
    } else {
      setOpen(true);
    }
  }

  // dropdown 위치: chip 가운데 기준 좌측 정렬값. min-width 200 으로 고정폭.
  // chip 이 짧으면 가운데 정렬이 화면 가장자리를 넘길 수 있어 좌우 12px 여백으로 clamp.
  const dropdownWidth = 200;
  const screenWidth = Dimensions.get('window').width;
  const EDGE_MARGIN = 12;
  const dropdownLeft = chipRect
    ? Math.max(
        EDGE_MARGIN,
        Math.min(
          chipRect.x + chipRect.width / 2 - dropdownWidth / 2,
          screenWidth - dropdownWidth - EDGE_MARGIN,
        ),
      )
    : 0;
  const dropdownTop = chipRect ? chipRect.y + chipRect.height + 6 : 0;

  return (
    <View style={styles.header}>
      <Image
        source={WORDMARK_ASSET}
        accessibilityLabel="neq,"
        style={styles.logo}
        resizeMode="contain"
      />

      {showChip && (
        <Pressable
          ref={chipRef}
          onPress={openDropdown}
          accessibilityRole="button"
          accessibilityLabel={`취향 전환: 현재 ${
            activePersona?.name ?? '기본'
          } (${personas.length}개 중)`}
          style={({ pressed }) => [
            styles.chip,
            open ? styles.chipOpen : styles.chipIdle,
            pressed && styles.chipPressed,
          ]}
        >
          <View style={styles.chipDot} />
          <Text
            style={[styles.chipLabel, open && styles.chipLabelOpen]}
            numberOfLines={1}
          >
            {activePersona?.name ?? '기본'}
          </Text>
          <Chevron open={open} />
        </Pressable>
      )}

      <Pressable
        style={styles.searchBtn}
        onPress={onSearchOpen}
        accessibilityRole="button"
        accessibilityLabel="검색 열기"
        hitSlop={8}
      >
        <IconSearch size={20} color={colors.textMuted} />
      </Pressable>

      {/* persona dropdown — RN Modal 로 portal 대체. backdrop 탭 시 닫힘. */}
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setOpen(false)}
        >
          {chipRect && (
            <Pressable
              style={[
                styles.dropdown,
                {
                  left: dropdownLeft,
                  top: dropdownTop,
                  width: dropdownWidth,
                },
              ]}
              onPress={() => {}}
            >
              <Text style={styles.dropdownHeader}>취향 전환</Text>
              {personas.map((p) => {
                const isActive = p.id === activePersonaId;
                return (
                  <Pressable
                    key={p.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                    onPress={() => {
                      if (!isActive) onPersonaSwitch(p.id);
                      setOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.option,
                      isActive && styles.optionActive,
                      pressed && !isActive && styles.optionPressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.optionLabel,
                        isActive && styles.optionLabelActive,
                      ]}
                      numberOfLines={1}
                    >
                      {p.name}
                    </Text>
                    {isActive && <CheckMark />}
                  </Pressable>
                );
              })}
              <View style={styles.divider} />
              {personas.length < MAX_PERSONAS ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="새 취향 추가"
                  onPress={() => {
                    setOpen(false);
                    onAddPersona();
                  }}
                  style={({ pressed }) => [
                    styles.addOption,
                    pressed && styles.optionPressed,
                  ]}
                >
                  <Text style={styles.addOptionLabel}>+ 새 취향 추가</Text>
                </Pressable>
              ) : (
                <Text style={styles.maxNotice}>
                  최대 3개까지 만들 수 있어요
                </Text>
              )}
            </Pressable>
          )}
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  // 2026-05-19 native↔PWA 정합 (항목 1) — 헤더 세로 공간을 PWA 정본에 맞춤.
  // web DiscoverHeader 정본: `px-5 py-3` 이지만 부모 wrap 이 `maxHeight: 48` +
  // `overflow: hidden` 으로 헤더를 48px 로 강제 클리핑한다 (discover/page.tsx:608).
  // 즉 web 의 실효 헤더 높이 = 48px.
  // 기존 native 는 `paddingVertical: spacing.md(16)` → 콘텐츠(검색버튼 40) + 32 = 72px.
  //   → web 대비 +24px, Discover deck 세로 공간을 그만큼 잠식 → 포스터가 작게 보임.
  // paddingVertical 을 spacing.xs(4) 로 축소 → 40 + 8 = 48px, web 실효 높이와 정확 일치.
  // (chip 은 36px 라 헤더 콘텐츠 하한 미초과 — chip 노출 시에도 48px 유지.)
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  logo: {
    height: WORDMARK_HEIGHT,
    width: WORDMARK_HEIGHT * WORDMARK_ASPECT_RATIO,
  },
  // 페르소나 chip — web `DiscoverHeader` chip 정합 (h-9 / px-3 / rounded-full).
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: spacing.sm + 4,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  chipIdle: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
  },
  chipOpen: {
    backgroundColor: colors.accentDim,
    borderColor: colors.accentBorder,
  },
  chipPressed: {
    opacity: 0.85,
  },
  chipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  chipLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textPrimary,
    maxWidth: 120,
  },
  chipLabelOpen: {
    color: colors.accent,
  },
  searchBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // dropdown — web 의 createPortal listbox 정합.
  modalBackdrop: {
    flex: 1,
  },
  dropdown: {
    position: 'absolute',
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    // shadow-lg 근사 — Quiet Ink: 과한 glow 금지, 옅은 elevation.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.32,
    shadowRadius: 16,
    elevation: 8,
  },
  dropdownHeader: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs + 2,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    height: 48,
  },
  optionActive: {
    backgroundColor: colors.accentDim,
  },
  optionPressed: {
    opacity: 0.7,
  },
  optionLabel: {
    fontSize: 14,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  optionLabelActive: {
    color: colors.accent,
  },
  divider: {
    height: 1,
    marginVertical: spacing.xs,
    marginHorizontal: spacing.md,
    backgroundColor: colors.borderSubtle,
  },
  addOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    height: 44,
  },
  addOptionLabel: {
    fontSize: 12,
    color: colors.textMuted,
  },
  maxNotice: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 11,
    color: colors.textMuted,
  },
});


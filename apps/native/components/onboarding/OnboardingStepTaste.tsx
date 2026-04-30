import { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { colors, spacing, fonts, fontSizePx } from '../../lib/tokens';
import { setTasteGenres } from '../../lib/store';
import { GENRE_CHIPS, type GenreChip } from './data';

/**
 * Onboarding V2 — Step 3: Taste (native).
 *
 * 디자인 산출물 StepTaste 매핑 — 장르 칩 멀티 선택 (3개 이상).
 *
 * 결정 (native 한정):
 *  - 작품 5픽은 native v1 spec #1 의 후속 위임 (D5 페르소나) 에서 처리. 본 위임은 장르 칩만.
 *  - tasteGenres 만 있어도 Cold Start V2 LLM 입력 (P0-2) 의 강한 신호 절반은 작동.
 *  - favorites 5픽이 비어있어도 #16 cold start fallback (`/api/trending`) 으로 첫 카드 즉시 노출.
 *
 * 저장: setTasteGenres → AsyncStorage account_prefs.tasteGenres.
 */

const MIN_GENRES = 3;

interface Props {
  onNext: () => void;
  initialGenres?: string[];
}

export default function OnboardingStepTaste({ onNext, initialGenres = [] }: Props) {
  const [genres, setGenres] = useState<Set<string>>(new Set(initialGenres));
  const enough = genres.size >= MIN_GENRES;

  const toggle = (g: GenreChip) => {
    setGenres((prev) => {
      const next = new Set(prev);
      if (next.has(g.id)) next.delete(g.id);
      else next.add(g.id);
      return next;
    });
  };

  const submit = async () => {
    await setTasteGenres(Array.from(genres));
    onNext();
  };

  const ctaLabel = enough ? '다음' : `${MIN_GENRES - genres.size}개 더 골라 주세요`;

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.heading}>어떤 장르를 좋아하세요?</Text>
        <Text style={styles.subtitle}>3개 이상 골라 주세요</Text>
        <Text
          style={[
            styles.counter,
            { color: enough ? colors.accent : colors.textMuted },
          ]}
        >
          {genres.size} / {MIN_GENRES}+
        </Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.chipWrap}>
        {GENRE_CHIPS.map((g) => {
          const on = genres.has(g.id);
          return (
            <Pressable
              key={g.id}
              onPress={() => toggle(g)}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: on ? colors.accent : colors.surface,
                  borderColor: on ? colors.accent : colors.border,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              {on && <Text style={[styles.chipCheck, { color: colors.bg }]}>✓ </Text>}
              <Text
                style={[
                  styles.chipLabel,
                  {
                    color: on ? colors.bg : colors.textPrimary,
                    fontWeight: on ? '600' : '500',
                  },
                ]}
              >
                {g.ko}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.ctaWrap}>
        <Pressable
          onPress={submit}
          disabled={!enough}
          style={({ pressed }) => [
            styles.cta,
            {
              backgroundColor: enough ? colors.accent : colors.surfaceRaised,
              opacity: pressed && enough ? 0.85 : 1,
            },
          ]}
        >
          <Text
            style={[
              styles.ctaLabel,
              { color: enough ? colors.bg : colors.textMuted },
            ]}
          >
            {ctaLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  head: {
    paddingHorizontal: 28,
    paddingTop: spacing.xl,
  },
  heading: {
    color: colors.textPrimary,
    fontFamily: fonts.displayReg,
    fontStyle: 'italic',
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.4,
    marginBottom: spacing.sm + 2,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSizePx.sm,
    lineHeight: 20,
    marginBottom: 4,
  },
  counter: {
    fontFamily: fonts.dataReg,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  scroll: { flex: 1 },
  chipWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chipCheck: { fontSize: 11 },
  chipLabel: { fontSize: 13 },
  ctaWrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    paddingTop: spacing.sm + 4,
  },
  cta: {
    width: '100%',
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  ctaLabel: { fontSize: 14, fontWeight: '600' },
});

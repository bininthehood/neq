import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { WORDMARK_ASSET, WORDMARK_ASPECT_RATIO } from './data';
import {
  buildFallbackSummary,
  getStaticSurveyStep,
  type PersonaContext,
  type SurveyOption,
  type SurveyStepOutput,
  type SurveySummaryOutput,
  type TasteSurveyAnswer,
} from '@neq/core';
import { track } from '../../lib/analytics';
import { createPersona, switchPersona } from '../../lib/store';
import { colors, fonts, fontSizePx, spacing } from '../../lib/tokens';
import {
  clearProgress,
  saveProgress,
} from '../../lib/survey-storage';
import { warmTrending } from '../../lib/data-prefetch';
import PersonaContextSelector from './PersonaContextSelector';
import TasteSummaryPreview from './TasteSummaryPreview';
import TasteSurveyFavoritesPicker, {
  type FavoritePickItem,
} from './TasteSurveyFavoritesPicker';
import TasteSurveyStep from './TasteSurveyStep';

/**
 * Persona v2 — 정적 풀 기반 취향 설문 state machine (native, 2026-06-06).
 *
 * web `apps/web/src/components/onboarding/PersonaSurveyController.tsx` 대응.
 * 단계 흐름:
 *   context_select → step(1) → step(2) → step(3) → favorites_pick → summary_preview → done
 *
 * 2026-06-06 정상 경로 승격:
 *   - LLM 호출 (fetchSurveyStep / fetchSurveySummary) 전부 제거
 *   - step_loading / summary_loading phase 제거 (즉시 다음 step)
 *   - error_modal phase 페기 (LLM 에러 흐름 자체 사라짐)
 *   - 모든 사용자 3-step path (정적 풀 step 2 shouldContinue=true 일관 설정)
 *
 * web 과의 차이: storage I/O 가 AsyncStorage 라 async. 그 외 흐름 동일.
 */

type Phase =
  | 'context_select'
  | 'step_question'
  | 'favorites_pick'
  | 'summary_preview'
  | 'done';

interface Props {
  initialName?: string;
  onComplete: (personaId: string) => void;
  onCancel: () => void;
  resurveyPersonaId?: string;
  /**
   * Onboarding 통합 모드 — 외부 StepHeader 사용 시.
   * 지정되면 Controller 의 SurveyHeader 가 hide. 대신 phase 변화 시
   * onSubStepChange callback 으로 부모 (onboarding) 에 진행 상황 알림.
   * 부모는 자체 StepHeader 의 progress current 갱신.
   *
   * subStep 매핑:
   *  - context_select → 1
   *  - step_question (step 1) → 2
   *  - step_question (step 2 or 3) → 3
   *  - favorites_pick → 4
   *  - summary_preview → 5
   */
  embedded?: {
    onSubStepChange: (subStep: number) => void;
  };
}

export default function PersonaSurveyController({
  initialName,
  onComplete,
  onCancel,
  resurveyPersonaId,
  embedded,
}: Props) {
  const [phase, setPhase] = useState<Phase>('context_select');
  const [context, setContext] = useState<PersonaContext | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  // 정적 풀 step 2 shouldContinue=true 로 기본 3-step path. 사용자 입력에 따라
  // 동적 변경 가능 (현 정적 풀은 항상 true 라 유지).
  const [totalSteps, setTotalSteps] = useState<2 | 3>(3);
  const [prevAnswers, setPrevAnswers] = useState<TasteSurveyAnswer[]>([]);
  const [currentOutput, setCurrentOutput] = useState<SurveyStepOutput | null>(
    null,
  );
  const [summary, setSummary] = useState<SurveySummaryOutput | null>(null);
  const [favorites, setFavorites] = useState<FavoritePickItem[]>([]);

  const startedAtRef = useRef<number>(Date.now());
  // 정적 호출이라 race 가능성 낮지만, 빠른 더블탭으로 인한 중복 saveProgress 가드.
  const inflightRef = useRef(false);

  // === 정적 풀에서 step 질문 로드 ===
  const beginStep = useCallback(
    async (
      ctx: PersonaContext,
      stepNum: 1 | 2 | 3,
      answers: TasteSurveyAnswer[],
    ) => {
      if (inflightRef.current) return;
      inflightRef.current = true;
      try {
        const output = getStaticSurveyStep(ctx, stepNum);
        if (!output) return;

        setStep(stepNum);
        setPrevAnswers(answers);
        setCurrentOutput(output);
        if (stepNum === 2) {
          setTotalSteps(output.shouldContinue ? 3 : 2);
        }
        setPhase('step_question');

        await saveProgress({
          context: ctx,
          prevAnswers: answers,
          step: stepNum,
          personaId: resurveyPersonaId,
        });
      } finally {
        inflightRef.current = false;
      }
    },
    [resurveyPersonaId],
  );

  // === 컨텍스트 선택 후 진행 상황 복구 체크 ===
  // 2026-05-27 — multi-select 적용. additionalContentTypes 는 사용자가 다중 선택한
  // 부가 콘텐츠 타입 (primary 외). PersonaContext.contentType 은 packages/core 단일
  // 값 그대로 유지 — 추천 모집단 union 확장은 server-side 변경 필요 (followup).
  // 현 단계에선 track 이벤트에 동봉해 데이터로만 수집.
  const handleContextNext = useCallback(
    async (
      picked: PersonaContext,
      options?: { additionalContentTypes?: PersonaContext['contentType'][] },
    ) => {
      setContext(picked);
      // 2026-07-10 — favorites 스텝 (3-step 뒤) 의 trending 풀 선행 warm.
      // 실측 0.5~1.0s 를 설문 진행 시간에 흡수 → 스텝 진입 즉시 렌더.
      warmTrending();
      // 2026-07-10 — resume modal 폐기 (사용자 결정: 온보딩은 초기 1회/초기화 후라
      // "이어서 하시겠어요?" 프롬프트가 어느 경우에도 맥락에 안 맞음). stale 진행분은
      // 조용히 비우고 항상 처음부터.
      await clearProgress(picked);
      startedAtRef.current = Date.now();
      const extra = options?.additionalContentTypes ?? [];
      track('taste_survey_started', {
        contentType: picked.contentType,
        companion: picked.companion,
        is_resurvey: !!resurveyPersonaId,
        additional_content_types: extra.join(','),
        additional_content_types_count: extra.length,
      });
      beginStep(picked, 1, []);
    },
    [resurveyPersonaId, beginStep],
  );

  // === step 답 제출 ===
  const handleAnswer = useCallback(
    (option: SurveyOption) => {
      if (!context || !currentOutput) return;
      const answer: TasteSurveyAnswer = {
        question: currentOutput.question,
        selectedOption: option.label,
        // 06 진단 B안 (2026-05-28) — 정상 경로 승격 후에도 PostHog 비교 baseline
        // 보존 위해 axisCategory 그대로 동봉.
        axisCategory: currentOutput.axisCategory,
      };
      const nextAnswers = [...prevAnswers, answer];
      track('taste_survey_step_completed', {
        step,
        contentType: context.contentType,
        companion: context.companion,
        selected_option_id: option.id,
      });
      const isLastStep = (step === 2 && totalSteps === 2) || step === 3;
      setPrevAnswers(nextAnswers);
      if (isLastStep) {
        setPhase('favorites_pick');
      } else {
        beginStep(context, (step + 1) as 2 | 3, nextAnswers);
      }
    },
    [context, currentOutput, prevAnswers, step, totalSteps, beginStep],
  );

  // === favorites_pick 완료 → summarize 진입 ===
  const handleFavoritesNext = useCallback(
    (items: FavoritePickItem[]) => {
      if (!context) return;
      setFavorites(items);
      track('taste_survey_step_completed', {
        step: 'favorites',
        contentType: context.contentType,
        companion: context.companion,
        favorites_count: items.length,
        skipped: items.length === 0,
      });
      beginSummary(context, prevAnswers, items);
    },
    [context, prevAnswers],
  );

  const handleFavoritesSkip = useCallback(() => {
    if (!context) return;
    setFavorites([]);
    track('taste_survey_step_completed', {
      step: 'favorites',
      contentType: context.contentType,
      companion: context.companion,
      favorites_count: 0,
      skipped: true,
    });
    beginSummary(context, prevAnswers, []);
  }, [context, prevAnswers]);

  // === 통합 요약 (정적, buildFallbackSummary) ===
  const beginSummary = useCallback(
    (
      ctx: PersonaContext,
      answers: TasteSurveyAnswer[],
      picked: FavoritePickItem[] = favorites,
    ) => {
      const favoritesPayload = picked.map((p) => ({
        title: p.title,
        tmdbId: p.id,
      }));
      const result = buildFallbackSummary({
        context: ctx,
        prevAnswers: answers,
        favorites: favoritesPayload,
      });
      track('taste_summary_generated', {
        contentType: ctx.contentType,
        companion: ctx.companion,
        summary_chars: result.tasteSummary.length,
        axes_count: result.axes.length,
        // 정상 경로 (정적 풀 승격, 2026-06-06) — fallback 아님. baseline 비교용 유지.
        used_fallback: false,
      });
      setPrevAnswers(answers);
      setSummary(result);
      setPhase('summary_preview');
    },
    [favorites],
  );

  // === "맞아요" 수락 → 페르소나 저장 ===
  // 2026-05-29 — 빠른 더블탭 race 방지. createPersona await 도중 두 번째 onPress
  // 가 들어오면 페르소나 2개 생성 → "기본"+"영화" 류 중복 노출 가능. acceptInflight
  // 가드로 단일 호출 보장. inflightRef 는 step 요청용이라 acceptInflightRef 분리.
  const acceptInflightRef = useRef(false);
  const handleAccept = useCallback(async () => {
    if (!context || !summary) return;
    if (acceptInflightRef.current) return;
    acceptInflightRef.current = true;
    try {
      const personaName = initialName?.trim() || autoName(context);
      const duration = Date.now() - startedAtRef.current;
      // design doc step 5 — favorites pick 결과를 페르소나 favorites 에 동시 저장.
      const newId = await createPersona(
        personaName,
        favorites.map((f) => f.title),
        favorites.map((f) => ({ id: f.id, title: f.title, posterUrl: f.posterUrl })),
        {
          tasteSummary: summary.tasteSummary,
          tasteSurveyAnswers: prevAnswers,
          context,
        },
      );
      track('taste_survey_completed', {
        contentType: context.contentType,
        companion: context.companion,
        duration_ms: duration,
        answers_count: prevAnswers.length,
        favorites_count: favorites.length,
        summary_chars: summary.tasteSummary.length,
        persona_created: !!newId,
      });
      await clearProgress(context);
      setPhase('done');
      if (newId) {
        await switchPersona(newId);
        onComplete(newId);
      } else {
        onCancel();
      }
    } finally {
      acceptInflightRef.current = false;
    }
  }, [context, summary, prevAnswers, favorites, initialName, onComplete, onCancel]);

  // === "다시 받기" ===
  const handleRetry = useCallback(() => {
    if (!context) return;
    track('persona_taste_resurveyed', {
      contentType: context.contentType,
      companion: context.companion,
      from_phase: 'summary_preview',
    });
    const keep = prevAnswers.slice(0, 1);
    setSummary(null);
    beginStep(context, 2, keep);
  }, [context, prevAnswers, beginStep]);

  // === 사용자 취소 처리 ===
  const handleCancel = useCallback(() => {
    if (context && phase !== 'context_select' && phase !== 'done') {
      track('taste_survey_abandoned', {
        contentType: context.contentType,
        companion: context.companion,
        abandoned_phase: phase,
        abandoned_step: step,
      });
      // 진행 중 cancel → storage progress 즉시 정리.
      // 다음 진입 시 resume modal 없이 깨끗한 컨텍스트 selector 부터.
      // (resume 의도는 사용자가 *닫지 않고 백그라운드 이동* 한 경우에 한정 — 명시
      // cancel 시 디자인 권장: clean slate. iOS E2E 회귀 결과 누적된 stale progress
      // 가 다음 wdio session 의 자동 진행 race 를 유발하는 케이스가 있어 명시 정리.)
      void clearProgress(context);
    }
    onCancel();
  }, [context, phase, step, onCancel]);

  // embedded 모드: phase 변화 시 부모 (onboarding) 에 subStep 알림.
  // done phase 에서는 onSubStepChange 호출 skip — 헤더가 1 로 fall-through 해
  // progress 역행하는 회귀 차단.
  useEffect(() => {
    if (!embedded) return;
    if (phase === 'done') return;
    let subStep = 1;
    if (phase === 'step_question') {
      subStep = step === 1 ? 2 : 3;
    } else if (phase === 'favorites_pick') {
      subStep = 4;
    } else if (phase === 'summary_preview') {
      subStep = 5;
    }
    embedded.onSubStepChange(subStep);
  }, [embedded, phase, step]);

  return (
    <View style={styles.wrap}>
      {!embedded && (
        <SurveyHeader
          phase={phase}
          step={step}
          totalSteps={totalSteps}
          onCancel={handleCancel}
        />
      )}

      {phase === 'context_select' && (
        <PersonaContextSelector onNext={handleContextNext} />
      )}

      {phase === 'step_question' && currentOutput && (
        <TasteSurveyStep
          step={step}
          totalSteps={totalSteps}
          output={currentOutput}
          onAnswer={handleAnswer}
        />
      )}

      {phase === 'favorites_pick' && (
        <TasteSurveyFavoritesPicker
          onNext={handleFavoritesNext}
          onSkip={handleFavoritesSkip}
        />
      )}

      {phase === 'summary_preview' && summary && (
        <TasteSummaryPreview
          summary={summary}
          onAccept={handleAccept}
          onRetry={handleRetry}
        />
      )}

    </View>
  );
}

// === Local helpers ===

function autoName(ctx: PersonaContext): string {
  const c =
    ctx.contentType === 'movie'
      ? '영화'
      : ctx.contentType === 'series'
        ? '시리즈'
        : '예능';
  const comp = ctx.companion === 'alone' ? '혼자' : '같이';
  return `${c} · ${comp}`;
}

function SurveyHeader({
  phase,
  step,
  totalSteps,
  onCancel,
}: {
  phase: Phase;
  step: 1 | 2 | 3;
  totalSteps: 2 | 3;
  onCancel: () => void;
}) {
  // 자체 progress (profile 진입 케이스만 사용 — onboarding 은 외부 StepHeader).
  const stages = 1 + totalSteps + 1 + 1;
  let current = 1;
  if (phase === 'step_question') current = 1 + step;
  else if (phase === 'favorites_pick') current = 1 + totalSteps + 1;
  else if (phase === 'summary_preview') current = stages;

  return (
    <View style={styles.headerWrap}>
      <View style={styles.headerRow}>
        <Pressable
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="설문 닫기"
          style={({ pressed }) => [
            styles.closeBtn,
            pressed && { opacity: 0.85 },
          ]}
        >
          <Text style={styles.closeIcon}>✕</Text>
        </Pressable>

        <Image
          source={WORDMARK_ASSET}
          accessibilityLabel="neq,"
          style={styles.brandLogo}
          resizeMode="contain"
        />

        <Text
          style={styles.headerProgress}
          accessibilityLabel={`${current} / ${stages}`}
        >
          {current} / {stages}
        </Text>
      </View>

      <View
        style={styles.progressBar}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: stages, now: current }}
      >
        {Array.from({ length: stages }, (_, i) => (
          <View
            key={i}
            style={[
              styles.progressSeg,
              {
                backgroundColor:
                  i + 1 <= current ? colors.accent : colors.border,
                opacity: i + 1 < current ? 0.7 : 1,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  headerWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md + 4,
    paddingBottom: spacing.sm + 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 32,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnPlaceholder: {
    width: 32,
    height: 32,
  },
  closeIcon: {
    color: colors.textSecondary,
    fontSize: 16,
    lineHeight: 16,
  },
  brandLogo: {
    // StepHeader logo (20px) 와 정합 — onboarding 시 워드마크 시각 동일성 유지.
    height: 20,
    width: 20 * WORDMARK_ASPECT_RATIO,
  },
  headerProgress: {
    color: colors.textMuted,
    fontFamily: fonts.dataReg,
    fontSize: 11,
    letterSpacing: 0.5,
    minWidth: 36,
    textAlign: 'right',
  },
  progressBar: {
    flexDirection: 'row',
    gap: 6,
    marginTop: spacing.md,
  },
  progressSeg: {
    flex: 1,
    height: 3,
    borderRadius: 999,
  },
});


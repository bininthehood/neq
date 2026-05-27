import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  buildFallbackSummary,
  fetchSurveyStep,
  fetchSurveySummary,
  getStaticSurveyStep,
  SurveyClientError,
  type PersonaContext,
  type SurveyOption,
  type SurveyStepOutput,
  type SurveySummaryOutput,
  type TasteSurveyAnswer,
} from '@neq/core';
import { track } from '../../lib/analytics';
import { env } from '../../lib/env';
import { createPersona, getDeviceId, switchPersona } from '../../lib/store';
import { colors, fonts, fontSizePx, spacing } from '../../lib/tokens';
import {
  clearProgress,
  loadProgress,
  saveProgress,
  type SurveyProgress,
} from '../../lib/survey-storage';
import PersonaContextSelector from './PersonaContextSelector';
import TasteSummaryLoading from './TasteSummaryLoading';
import TasteSummaryPreview from './TasteSummaryPreview';
import TasteSurveyFavoritesPicker, {
  type FavoritePickItem,
} from './TasteSurveyFavoritesPicker';
import TasteSurveyStep from './TasteSurveyStep';

/**
 * Persona v2 - LLM 동적 취향 설문 state machine (native).
 *
 * web `apps/web/src/components/onboarding/PersonaSurveyController.tsx` 대응.
 * 단계 흐름:
 *   context_select → step_loading(1) → step(1) → step_loading(2) → step(2)
 *     → [step_loading(3) → step(3) if shouldContinue]
 *     → summary_loading → summary_preview → done (persona 생성 + onComplete)
 *
 * web 과의 차이: 모든 storage I/O 가 async (AsyncStorage). 따라서 handler 들도
 * async/await. 그 외 흐름/이벤트/에러 처리는 동일.
 */

type Phase =
  | 'context_select'
  | 'resume_modal'
  | 'step_loading'
  | 'step_question'
  | 'favorites_pick'
  | 'summary_loading'
  | 'summary_preview'
  | 'error_modal'
  | 'done';

interface ErrorState {
  kind: 'rate_limit' | 'token_invalid' | 'generic';
  message: string;
}

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
   *  - step_loading/question (step 1) → 2
   *  - step_loading/question (step 2 or 3) → 3
   *  - favorites_pick → 4
   *  - summary_loading/preview → 5
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
  const [totalSteps, setTotalSteps] = useState<2 | 3>(2);
  const [prevAnswers, setPrevAnswers] = useState<TasteSurveyAnswer[]>([]);
  const [currentOutput, setCurrentOutput] = useState<SurveyStepOutput | null>(
    null,
  );
  const [summary, setSummary] = useState<SurveySummaryOutput | null>(null);
  const [favorites, setFavorites] = useState<FavoritePickItem[]>([]);
  const [error, setError] = useState<ErrorState | null>(null);

  const tokenRef = useRef<string | undefined>(undefined);
  const startedAtRef = useRef<number>(Date.now());
  const inflightRef = useRef(false);
  const fallbackSeenRef = useRef(false);

  // === LLM step 호출 + 자동 fallback ===
  const beginStep = useCallback(
    async (
      ctx: PersonaContext,
      stepNum: 1 | 2 | 3,
      answers: TasteSurveyAnswer[],
    ) => {
      if (inflightRef.current) return;
      inflightRef.current = true;
      setStep(stepNum);
      setPrevAnswers(answers);
      setCurrentOutput(null);
      setPhase('step_loading');

      const deviceId = await getDeviceId();
      await saveProgress({
        context: ctx,
        prevAnswers: answers,
        step: stepNum,
        token: tokenRef.current,
        personaId: resurveyPersonaId,
      });

      try {
        const res = await fetchSurveyStep(
          {
            context: ctx,
            prevAnswers: answers,
            step: stepNum,
            deviceId,
          },
          { token: tokenRef.current, baseUrl: env.API_BASE_URL },
        );
        if (res.newToken) tokenRef.current = res.newToken;
        const fallbackFlag = (res as SurveyStepOutput & { _fallback?: boolean })
          ._fallback === true;
        if (fallbackFlag && !fallbackSeenRef.current) {
          fallbackSeenRef.current = true;
          track('taste_survey_fallback_triggered', {
            stage: 'step',
            step: stepNum,
            contentType: ctx.contentType,
            companion: ctx.companion,
            source: 'server',
          });
        }
        if (stepNum === 2) {
          setTotalSteps(res.shouldContinue ? 3 : 2);
        }
        setCurrentOutput(res);
        setPhase('step_question');
      } catch (err) {
        const handled = handleStepError(err);
        if (handled) {
          inflightRef.current = false;
          return;
        }
        const fallback = getStaticSurveyStep(ctx, stepNum);
        if (fallback) {
          if (!fallbackSeenRef.current) {
            fallbackSeenRef.current = true;
            track('taste_survey_fallback_triggered', {
              stage: 'step',
              step: stepNum,
              contentType: ctx.contentType,
              companion: ctx.companion,
              source: 'client',
            });
          }
          if (stepNum === 2) setTotalSteps(2);
          setCurrentOutput(fallback);
          setPhase('step_question');
        } else {
          setError({ kind: 'generic', message: '잠시 후 다시 시도해주세요' });
          setPhase('error_modal');
        }
      } finally {
        inflightRef.current = false;
      }
    },
    [resurveyPersonaId],
  );

  function handleStepError(err: unknown): boolean {
    if (!(err instanceof SurveyClientError)) return false;
    if (err.code === 'rate_limit') {
      setError({ kind: 'rate_limit', message: '잠시 후 다시 시도해주세요' });
      setPhase('error_modal');
      return true;
    }
    if (err.code === 'invalid_token') {
      tokenRef.current = undefined;
      setError({
        kind: 'token_invalid',
        message: '세션이 만료됐어요. 처음부터 다시 시작합니다.',
      });
      setPhase('error_modal');
      return true;
    }
    return false;
  }

  // === 컨텍스트 선택 후 진행 상황 복구 체크 ===
  const handleContextNext = useCallback(
    async (picked: PersonaContext) => {
      setContext(picked);
      const existing = await loadProgress(picked);
      if (existing && existing.prevAnswers.length > 0) {
        setPhase('resume_modal');
        return;
      }
      startedAtRef.current = Date.now();
      track('taste_survey_started', {
        contentType: picked.contentType,
        companion: picked.companion,
        is_resurvey: !!resurveyPersonaId,
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
        // design doc step 5 — favorites_pick 진입.
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

  // === 통합 요약 호출 ===
  const beginSummary = useCallback(
    async (
      ctx: PersonaContext,
      answers: TasteSurveyAnswer[],
      picked: FavoritePickItem[] = favorites,
    ) => {
      if (inflightRef.current) return;
      inflightRef.current = true;
      setPrevAnswers(answers);
      setPhase('summary_loading');

      const deviceId = await getDeviceId();
      await saveProgress({
        context: ctx,
        prevAnswers: answers,
        step: (step === 3 ? 3 : 2) as 1 | 2 | 3,
        token: tokenRef.current,
        personaId: resurveyPersonaId,
      });

      const favoritesPayload = picked.map((p) => ({
        title: p.title,
        tmdbId: p.id,
      }));

      try {
        const res = await fetchSurveySummary(
          {
            context: ctx,
            prevAnswers: answers,
            favorites: favoritesPayload,
            deviceId,
          },
          { token: tokenRef.current, baseUrl: env.API_BASE_URL },
        );
        track('taste_summary_generated', {
          contentType: ctx.contentType,
          companion: ctx.companion,
          summary_chars: res.tasteSummary.length,
          axes_count: res.axes.length,
          used_fallback: false,
        });
        setSummary(res);
        setPhase('summary_preview');
      } catch (err) {
        const handled = handleStepError(err);
        if (handled) {
          inflightRef.current = false;
          return;
        }
        const fallback = buildFallbackSummary({
          context: ctx,
          prevAnswers: answers,
          favorites: favoritesPayload,
        });
        if (!fallbackSeenRef.current) {
          fallbackSeenRef.current = true;
          track('taste_survey_fallback_triggered', {
            stage: 'summary',
            contentType: ctx.contentType,
            companion: ctx.companion,
            source: 'client',
          });
        }
        track('taste_summary_generated', {
          contentType: ctx.contentType,
          companion: ctx.companion,
          summary_chars: fallback.tasteSummary.length,
          axes_count: fallback.axes.length,
          used_fallback: true,
        });
        setSummary(fallback);
        setPhase('summary_preview');
      } finally {
        inflightRef.current = false;
      }
    },
    [resurveyPersonaId, step, favorites],
  );

  // === "맞아요" 수락 → 페르소나 저장 ===
  const handleAccept = useCallback(async () => {
    if (!context || !summary) return;
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
    fallbackSeenRef.current = false;
    setSummary(null);
    beginStep(context, 2, keep);
  }, [context, prevAnswers, beginStep]);

  // === Resume modal handlers ===
  const handleResumeContinue = useCallback(async () => {
    if (!context) return;
    const existing = await loadProgress(context);
    if (!existing) {
      handleResumeRestart();
      return;
    }
    tokenRef.current = existing.token;
    startedAtRef.current = Date.now();
    track('taste_survey_started', {
      contentType: context.contentType,
      companion: context.companion,
      is_resurvey: !!resurveyPersonaId,
      resumed: true,
    });
    beginStep(context, existing.step, existing.prevAnswers);
  }, [context, beginStep, resurveyPersonaId]);

  const handleResumeRestart = useCallback(async () => {
    if (!context) return;
    await clearProgress(context);
    tokenRef.current = undefined;
    fallbackSeenRef.current = false;
    startedAtRef.current = Date.now();
    track('taste_survey_started', {
      contentType: context.contentType,
      companion: context.companion,
      is_resurvey: !!resurveyPersonaId,
      restarted: true,
    });
    beginStep(context, 1, []);
  }, [context, beginStep, resurveyPersonaId]);

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

  // === 에러 모달 dismiss 후 분기 ===
  const handleErrorDismiss = useCallback(async () => {
    if (!error) {
      setPhase('context_select');
      return;
    }
    if (error.kind === 'token_invalid') {
      tokenRef.current = undefined;
      if (context) await clearProgress(context);
      setContext(null);
      setPrevAnswers([]);
      setStep(1);
      setError(null);
      setPhase('context_select');
      return;
    }
    setError(null);
    handleCancel();
  }, [error, context, handleCancel]);

  // === 진입 시 device_id 인증 보장 ===
  useEffect(() => {
    getDeviceId().catch(() => undefined);
  }, []);

  // embedded 모드: phase 변화 시 부모 (onboarding) 에 subStep 알림.
  // modal/done phase 에서는 onSubStepChange 호출 skip — 헤더가 모달 뒤에서
  // 1 로 fall-through 해 progress 역행하는 회귀 차단.
  useEffect(() => {
    if (!embedded) return;
    if (phase === 'error_modal' || phase === 'resume_modal' || phase === 'done') return;
    let subStep = 1;
    if (phase === 'step_loading' || phase === 'step_question') {
      subStep = step === 1 ? 2 : 3;
    } else if (phase === 'favorites_pick') {
      subStep = 4;
    } else if (phase === 'summary_loading' || phase === 'summary_preview') {
      subStep = 5;
    }
    embedded.onSubStepChange(subStep);
  }, [embedded, phase, step]);

  // === embedded 모드 에러 모달 retry / skip ===
  // 기본 동작 (profile 진입) 은 닫기 → handleCancel. embedded 모드에서는 사용자가
  // 빠져나갈 수 없는 trap 차단을 위해 retry 우선, skip 보조 분기.
  const handleErrorRetry = useCallback(() => {
    if (!context) {
      setError(null);
      setPhase('context_select');
      return;
    }
    if (error?.kind === 'token_invalid') tokenRef.current = undefined;
    setError(null);
    beginStep(context, step, prevAnswers);
  }, [context, error, step, prevAnswers, beginStep]);

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

      {phase === 'step_loading' && (
        <TasteSummaryLoading message="질문을 만드는 중" />
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

      {phase === 'summary_loading' && <TasteSummaryLoading />}

      {phase === 'summary_preview' && summary && (
        <TasteSummaryPreview
          summary={summary}
          onAccept={handleAccept}
          onRetry={handleRetry}
        />
      )}

      <ConfirmModal
        visible={phase === 'resume_modal'}
        title="이어서 하시겠어요?"
        description="진행 중이던 설문이 남아있어요."
        primaryLabel="이어서"
        secondaryLabel="처음부터"
        onPrimary={handleResumeContinue}
        onSecondary={handleResumeRestart}
      />

      <ConfirmModal
        visible={phase === 'error_modal' && !!error}
        title={
          error?.kind === 'rate_limit'
            ? '잠시 후 다시 시도해주세요'
            : error?.kind === 'token_invalid'
              ? '세션이 만료됐어요'
              : '오류가 발생했어요'
        }
        description={error?.message ?? ''}
        primaryLabel={embedded ? '다시 시도' : '닫기'}
        secondaryLabel={embedded ? '건너뛰기' : undefined}
        onPrimary={embedded ? handleErrorRetry : handleErrorDismiss}
        onSecondary={embedded ? handleErrorDismiss : undefined}
      />
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
  if (phase === 'step_loading' || phase === 'step_question') current = 1 + step;
  else if (phase === 'favorites_pick') current = 1 + totalSteps + 1;
  else if (phase === 'summary_loading' || phase === 'summary_preview')
    current = stages;

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

        <Text style={styles.brand}>neq,</Text>

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

function ConfirmModal({
  visible,
  title,
  description,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
}: {
  visible: boolean;
  title: string;
  description: string;
  primaryLabel: string;
  secondaryLabel?: string;
  onPrimary: () => void;
  onSecondary?: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onPrimary}
    >
      <View style={modalStyles.backdrop}>
        <View style={modalStyles.card}>
          <Text style={modalStyles.title}>{title}</Text>
          <Text style={modalStyles.description}>{description}</Text>
          <View style={modalStyles.ctaCol}>
            <Pressable
              onPress={onPrimary}
              accessibilityRole="button"
              accessibilityLabel={primaryLabel}
              style={({ pressed }) => [
                modalStyles.primaryBtn,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={modalStyles.primaryLabel}>{primaryLabel}</Text>
            </Pressable>
            {secondaryLabel && onSecondary ? (
              <Pressable
                onPress={onSecondary}
                accessibilityRole="button"
                accessibilityLabel={secondaryLabel}
                style={({ pressed }) => [
                  modalStyles.secondaryBtn,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={modalStyles.secondaryLabel}>{secondaryLabel}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
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
  brand: {
    color: colors.textPrimary,
    fontFamily: fonts.displayReg,
    fontStyle: 'italic',
    fontSize: 18,
    letterSpacing: -0.2,
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

const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 4,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.displayReg,
    fontStyle: 'italic',
    fontSize: 20,
    letterSpacing: -0.2,
    marginBottom: spacing.sm,
  },
  description: {
    color: colors.textSecondary,
    fontSize: fontSizePx.sm,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  ctaCol: {
    gap: spacing.sm,
  },
  primaryBtn: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: colors.accent,
  },
  primaryLabel: {
    color: colors.bg,
    fontSize: fontSizePx.sm,
    fontWeight: '600',
  },
  secondaryBtn: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'transparent',
  },
  secondaryLabel: {
    color: colors.textSecondary,
    fontSize: fontSizePx.sm,
  },
});

export type { SurveyProgress };

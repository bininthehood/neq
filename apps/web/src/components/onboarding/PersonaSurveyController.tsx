"use client";

/**
 * Persona v2 - LLM 동적 취향 설문 state machine (design doc 125·248 행).
 *
 * 단계 흐름:
 *   context_select → step_loading(1) → step(1) → step_loading(2) → step(2)
 *     → [step_loading(3) → step(3) if shouldContinue]
 *     → summary_loading → summary_preview → done (persona 생성 + onComplete)
 *
 * 추가 분기:
 *   - 진입 시 sessionStorage 진행 상황 발견 → resume_modal
 *   - LLM 호출 실패 (1 retry 후) → packages/core static fallback 자동 진입
 *   - 401 (token 만료/invalid) → invalid_token_modal
 *   - 429 (rate limit) → rate_limit_modal
 *   - 사용자 닫기 → analytics taste_survey_abandoned + saveProgress
 *
 * PR 2-b 범위: 영화/혼자 컨텍스트 E2E. favorites 는 v2 controller 미수집
 * (design doc 131 "기존 작품 픽 UX 그대로 v1 변경 0") → summarize 호출 시
 * favorites=[]. 신규 페르소나의 작품 픽은 출시 후 swipe 세션 또는 기존
 * NewPersonaSheet 경로로 보강.
 *
 * 호출처: profile 페이지의 "새 페르소나" CTA (현재 NewPersonaSheet 의 v2 진입점).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchSurveyStep,
  fetchSurveySummary,
  getStaticSurveyStep,
  buildFallbackSummary,
  SurveyClientError,
  type PersonaContext,
  type SurveyOption,
  type SurveyStepOutput,
  type SurveySummaryOutput,
  type TasteSurveyAnswer,
} from "@neq/core";
import { getDeviceId } from "@/lib/device-id";
import { createPersona, switchPersona } from "@/lib/store";
import { track } from "@/lib/analytics";
import {
  clearProgress,
  loadProgress,
  saveProgress,
  type SurveyProgress,
} from "./_lib/survey-storage";
import PersonaContextSelector from "./PersonaContextSelector";
import TasteSurveyStep from "./TasteSurveyStep";
import TasteSummaryLoading from "./TasteSummaryLoading";
import TasteSummaryPreview from "./TasteSummaryPreview";
import TasteSurveyFavoritesPicker, {
  type FavoritePickItem,
} from "./TasteSurveyFavoritesPicker";

type Phase =
  | "context_select"
  | "resume_modal"
  | "step_loading"
  | "step_question"
  | "favorites_pick"
  | "summary_loading"
  | "summary_preview"
  | "error_modal"
  | "done";

interface FavoriteEntry {
  title: string;
  tmdbId?: number;
  posterUrl?: string | null;
}

interface ErrorState {
  kind: "rate_limit" | "token_invalid" | "generic";
  message: string;
}

interface Props {
  /** 페르소나 이름 기본값 (NewPersonaSheet 흐름에서 받은 값) 또는 undefined → 자동 명명. */
  initialName?: string;
  /** "맞아요" 수락 시 부모에 알림 (created personaId 전달). */
  onComplete: (personaId: string) => void;
  /** 사용자 취소/닫기. abandoned 이벤트 발사 후 호출. */
  onCancel: () => void;
  /**
   * 기존 페르소나 재설문 모드 — personaId 가 있으면 신규 createPersona 대신
   * updatePersonaTasteSummary 로 갱신. (PR 2-b 미사용, 인터페이스만 마련.)
   */
  resurveyPersonaId?: string;
}

export default function PersonaSurveyController({
  initialName,
  onComplete,
  onCancel,
  resurveyPersonaId,
}: Props) {
  const [phase, setPhase] = useState<Phase>("context_select");
  const [context, setContext] = useState<PersonaContext | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  /** 동적 totalSteps — 서버 shouldContinue 결과에 따라 2 또는 3. 초기 2 가정. */
  const [totalSteps, setTotalSteps] = useState<2 | 3>(2);
  const [prevAnswers, setPrevAnswers] = useState<TasteSurveyAnswer[]>([]);
  const [currentOutput, setCurrentOutput] = useState<SurveyStepOutput | null>(
    null,
  );
  const [summary, setSummary] = useState<SurveySummaryOutput | null>(null);
  const [favorites, setFavorites] = useState<FavoritePickItem[]>([]);
  const [error, setError] = useState<ErrorState | null>(null);
  /** 서버가 발급한 신규 token (TTL 30분). step 호출 간 유지. */
  const tokenRef = useRef<string | undefined>(undefined);
  /** 진입 시각 — taste_survey_completed.duration_ms 계산용. */
  const startedAtRef = useRef<number>(Date.now());
  /** 동일 step 중복 요청 차단 ref. */
  const inflightRef = useRef(false);
  /** 한 페르소나 생성에서 fallback 발생 여부 (preview 직전 한 번만 트래킹). */
  const fallbackSeenRef = useRef(false);

  // === 컨텍스트 선택 후 진행 상황 복구 체크 ===
  const handleContextNext = useCallback((picked: PersonaContext) => {
    setContext(picked);
    const existing = loadProgress(picked);
    if (existing && existing.prevAnswers.length > 0) {
      // 같은 컨텍스트의 진행 상황 발견 → resume modal
      setPhase("resume_modal");
      return;
    }
    startedAtRef.current = Date.now();
    track("taste_survey_started", {
      contentType: picked.contentType,
      companion: picked.companion,
      is_resurvey: !!resurveyPersonaId,
    });
    beginStep(picked, 1, []);
  }, [resurveyPersonaId]);

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
      setPhase("step_loading");

      // sessionStorage 진행 상황 저장 (mid-survey 복구용)
      saveProgress({
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
            deviceId: getDeviceId(),
          },
          { token: tokenRef.current },
        );
        if (res.newToken) tokenRef.current = res.newToken;
        const fallbackFlag = (res as SurveyStepOutput & { _fallback?: boolean })
          ._fallback === true;
        if (fallbackFlag && !fallbackSeenRef.current) {
          fallbackSeenRef.current = true;
          track("taste_survey_fallback_triggered", {
            stage: "step",
            step: stepNum,
            contentType: ctx.contentType,
            companion: ctx.companion,
            source: "server",
          });
        }
        if (stepNum === 2) {
          setTotalSteps(res.shouldContinue ? 3 : 2);
        }
        setCurrentOutput(res);
        setPhase("step_question");
      } catch (err) {
        const handled = handleStepError(err);
        if (handled) {
          inflightRef.current = false;
          return;
        }
        // 클라이언트 측 최종 fallback — packages/core static-survey
        const fallback = getStaticSurveyStep(ctx, stepNum);
        if (fallback) {
          if (!fallbackSeenRef.current) {
            fallbackSeenRef.current = true;
            track("taste_survey_fallback_triggered", {
              stage: "step",
              step: stepNum,
              contentType: ctx.contentType,
              companion: ctx.companion,
              source: "client",
            });
          }
          if (stepNum === 2) setTotalSteps(2);
          setCurrentOutput(fallback);
          setPhase("step_question");
        } else {
          setError({
            kind: "generic",
            message: "잠시 후 다시 시도해주세요",
          });
          setPhase("error_modal");
        }
      } finally {
        inflightRef.current = false;
      }
    },
    [resurveyPersonaId],
  );

  /** 401/403/429 등 사용자 행동이 필요한 에러는 modal 로. true = handled. */
  function handleStepError(err: unknown): boolean {
    if (!(err instanceof SurveyClientError)) return false;
    if (err.code === "rate_limit") {
      setError({
        kind: "rate_limit",
        message: "잠시 후 다시 시도해주세요",
      });
      setPhase("error_modal");
      return true;
    }
    if (err.code === "invalid_token") {
      tokenRef.current = undefined;
      setError({
        kind: "token_invalid",
        message: "세션이 만료됐어요. 처음부터 다시 시작합니다.",
      });
      setPhase("error_modal");
      return true;
    }
    return false; // session_expired / origin_blocked 등은 fallback 진입
  }

  // === step 답 제출 ===
  const handleAnswer = useCallback(
    (option: SurveyOption) => {
      if (!context || !currentOutput) return;
      const answer: TasteSurveyAnswer = {
        question: currentOutput.question,
        selectedOption: option.label,
      };
      const nextAnswers = [...prevAnswers, answer];
      track("taste_survey_step_completed", {
        step,
        contentType: context.contentType,
        companion: context.companion,
        selected_option_id: option.id,
      });
      const isLastStep =
        (step === 2 && totalSteps === 2) || step === 3;
      setPrevAnswers(nextAnswers);
      if (isLastStep) {
        // design doc step 5 — favorites_pick step 으로 진입.
        setPhase("favorites_pick");
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
      track("taste_survey_step_completed", {
        step: "favorites",
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
    track("taste_survey_step_completed", {
      step: "favorites",
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
      setPhase("summary_loading");
      saveProgress({
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
            deviceId: getDeviceId(),
          },
          { token: tokenRef.current },
        );
        track("taste_summary_generated", {
          contentType: ctx.contentType,
          companion: ctx.companion,
          summary_chars: res.tasteSummary.length,
          axes_count: res.axes.length,
          used_fallback: false,
        });
        setSummary(res);
        setPhase("summary_preview");
      } catch (err) {
        const handled = handleStepError(err);
        if (handled) {
          inflightRef.current = false;
          return;
        }
        // 통합 요약도 최종 fallback — 룰 기반 자연어 합성
        const fallback = buildFallbackSummary({
          context: ctx,
          prevAnswers: answers,
          favorites: favoritesPayload,
        });
        if (!fallbackSeenRef.current) {
          fallbackSeenRef.current = true;
          track("taste_survey_fallback_triggered", {
            stage: "summary",
            contentType: ctx.contentType,
            companion: ctx.companion,
            source: "client",
          });
        }
        track("taste_summary_generated", {
          contentType: ctx.contentType,
          companion: ctx.companion,
          summary_chars: fallback.tasteSummary.length,
          axes_count: fallback.axes.length,
          used_fallback: true,
        });
        setSummary(fallback);
        setPhase("summary_preview");
      } finally {
        inflightRef.current = false;
      }
    },
    [resurveyPersonaId, step, favorites],
  );

  // === "맞아요" 수락 → 페르소나 저장 ===
  const handleAccept = useCallback(() => {
    if (!context || !summary) return;
    const personaName = initialName?.trim() || autoName(context);
    const duration = Date.now() - startedAtRef.current;
    // 신규 페르소나 생성 — favorites step 에서 픽한 작품을 favorites 배열에
    // 동시에 저장 (design doc step 5 — 작품 픽으로 LLM seed).
    const newId = createPersona(
      personaName,
      favorites.map((f) => f.title),
      favorites.map((f) => ({ id: f.id, title: f.title, posterUrl: f.posterUrl })),
      {
        tasteSummary: summary.tasteSummary,
        tasteSurveyAnswers: prevAnswers,
        context,
      },
    );
    track("taste_survey_completed", {
      contentType: context.contentType,
      companion: context.companion,
      duration_ms: duration,
      answers_count: prevAnswers.length,
      favorites_count: favorites.length,
      summary_chars: summary.tasteSummary.length,
      persona_created: !!newId,
    });
    clearProgress(context);
    setPhase("done");
    if (newId) {
      // 새 페르소나로 즉시 전환 → 첫 추천 진입
      switchPersona(newId);
      onComplete(newId);
    } else {
      // MAX_PERSONAS 도달 — 부모가 toast 처리. 일단 cancel 처럼 동작.
      onCancel();
    }
  }, [context, summary, prevAnswers, favorites, initialName, onComplete, onCancel]);

  // === "다시 받기" → step 2 부터 재진입 (prevAnswers 부분 유지) ===
  const handleRetry = useCallback(() => {
    if (!context) return;
    track("persona_taste_resurveyed", {
      contentType: context.contentType,
      companion: context.companion,
      from_phase: "summary_preview",
    });
    // 첫 답만 유지 (step 1 답) → step 2 다시 호출
    const keep = prevAnswers.slice(0, 1);
    fallbackSeenRef.current = false;
    setSummary(null);
    beginStep(context, 2, keep);
  }, [context, prevAnswers, beginStep]);

  // === Resume modal handlers ===
  const handleResumeContinue = useCallback(() => {
    if (!context) return;
    const existing = loadProgress(context);
    if (!existing) {
      // 안전 fallback — 진행 상황이 사라졌으면 처음부터
      handleResumeRestart();
      return;
    }
    tokenRef.current = existing.token;
    startedAtRef.current = Date.now();
    track("taste_survey_started", {
      contentType: context.contentType,
      companion: context.companion,
      is_resurvey: !!resurveyPersonaId,
      resumed: true,
    });
    beginStep(context, existing.step, existing.prevAnswers);
  }, [context, beginStep, resurveyPersonaId]);

  const handleResumeRestart = useCallback(() => {
    if (!context) return;
    clearProgress(context);
    tokenRef.current = undefined;
    fallbackSeenRef.current = false;
    startedAtRef.current = Date.now();
    track("taste_survey_started", {
      contentType: context.contentType,
      companion: context.companion,
      is_resurvey: !!resurveyPersonaId,
      restarted: true,
    });
    beginStep(context, 1, []);
  }, [context, beginStep, resurveyPersonaId]);

  // === 사용자 취소 처리 ===
  const handleCancel = useCallback(() => {
    if (context && phase !== "context_select" && phase !== "done") {
      track("taste_survey_abandoned", {
        contentType: context.contentType,
        companion: context.companion,
        abandoned_phase: phase,
        abandoned_step: step,
      });
    }
    onCancel();
  }, [context, phase, step, onCancel]);

  // === 에러 모달 dismiss 후 분기 ===
  const handleErrorDismiss = useCallback(() => {
    if (!error) {
      setPhase(context ? "context_select" : "context_select");
      return;
    }
    if (error.kind === "token_invalid") {
      // 처음부터 다시 시작
      tokenRef.current = undefined;
      if (context) clearProgress(context);
      setContext(null);
      setPrevAnswers([]);
      setStep(1);
      setError(null);
      setPhase("context_select");
      return;
    }
    // rate_limit / generic → controller 닫기
    setError(null);
    handleCancel();
  }, [error, context, handleCancel]);

  // === 진입 시 device_id 인증 보장 ===
  useEffect(() => {
    // 사이드 이펙트 0 — device_id 만 확보 (없으면 device-id.ts 가 자동 발급)
    if (typeof window !== "undefined") getDeviceId();
  }, []);

  // === Render ===
  return (
    <div
      className="h-dvh flex flex-col max-w-[480px] mx-auto w-full"
      style={{ background: "var(--bg)" }}
    >
      <SurveyHeader
        phase={phase}
        step={step}
        totalSteps={totalSteps}
        onCancel={handleCancel}
      />

      {phase === "context_select" && (
        <PersonaContextSelector onNext={handleContextNext} />
      )}

      {phase === "step_loading" && <TasteSummaryLoading message="질문을 만드는 중" />}

      {phase === "step_question" && currentOutput && (
        <TasteSurveyStep
          step={step}
          totalSteps={totalSteps}
          output={currentOutput}
          onAnswer={handleAnswer}
        />
      )}

      {phase === "favorites_pick" && (
        <TasteSurveyFavoritesPicker
          onNext={handleFavoritesNext}
          onSkip={handleFavoritesSkip}
        />
      )}

      {phase === "summary_loading" && <TasteSummaryLoading />}

      {phase === "summary_preview" && summary && (
        <TasteSummaryPreview
          summary={summary}
          onAccept={handleAccept}
          onRetry={handleRetry}
        />
      )}

      {phase === "resume_modal" && (
        <ConfirmModal
          title="이어서 하시겠어요?"
          description="진행 중이던 설문이 남아있어요."
          primaryLabel="이어서"
          secondaryLabel="처음부터"
          onPrimary={handleResumeContinue}
          onSecondary={handleResumeRestart}
        />
      )}

      {phase === "error_modal" && error && (
        <ConfirmModal
          title={
            error.kind === "rate_limit"
              ? "잠시 후 다시 시도해주세요"
              : error.kind === "token_invalid"
                ? "세션이 만료됐어요"
                : "오류가 발생했어요"
          }
          description={error.message}
          primaryLabel="닫기"
          onPrimary={handleErrorDismiss}
        />
      )}
    </div>
  );
}

// === Local helpers ===

function autoName(ctx: PersonaContext): string {
  const c =
    ctx.contentType === "movie"
      ? "영화"
      : ctx.contentType === "series"
        ? "시리즈"
        : "예능";
  const comp = ctx.companion === "alone" ? "혼자" : "같이";
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
  // 진행률 — context(1) + step(1~3) + favorites(1) + summary(1) 도합
  const stages = 1 + totalSteps + 1 + 1;
  let current = 1;
  if (phase === "step_loading" || phase === "step_question") current = 1 + step;
  else if (phase === "favorites_pick") current = 1 + totalSteps + 1;
  else if (phase === "summary_loading" || phase === "summary_preview")
    current = stages;

  return (
    <div className="shrink-0 px-6 pt-5 pb-3">
      <div className="flex items-center justify-between min-h-[32px]">
        <button
          type="button"
          onClick={onCancel}
          aria-label="설문 닫기"
          className="w-8 h-8 flex items-center justify-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            color: "var(--text-secondary)",
          }}
        >
          <span style={{ fontSize: 16, lineHeight: 1 }}>✕</span>
        </button>

        <img src="/neq-logo.png" alt="neq," className="h-5 object-contain" />

        <div
          className="text-xs tabular-nums"
          style={{
            color: "var(--text-muted)",
            fontFamily: "var(--font-data)",
            letterSpacing: "0.05em",
            minWidth: 32,
            textAlign: "right",
          }}
        >
          {current} / {stages}
        </div>
      </div>

      <div
        className="flex gap-1.5 mt-4"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={stages}
        aria-valuenow={current}
      >
        {Array.from({ length: stages }, (_, i) => (
          <div
            key={i}
            className="flex-1 h-[3px] rounded-full"
            style={{
              background:
                i + 1 <= current ? "var(--accent)" : "var(--border)",
              opacity: i + 1 < current ? 0.7 : 1,
              transition:
                "background var(--duration-quick, 150ms) var(--ease-move, cubic-bezier(0.45, 0, 0.55, 1)), opacity var(--duration-quick, 150ms) var(--ease-move, cubic-bezier(0.45, 0, 0.55, 1))",
            }}
          />
        ))}
      </div>
    </div>
  );
}

function ConfirmModal({
  title,
  description,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
}: {
  title: string;
  description: string;
  primaryLabel: string;
  secondaryLabel?: string;
  onPrimary: () => void;
  onSecondary?: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: "var(--bg-overlay-heavy)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="survey-modal-title"
    >
      <div
        className="w-full max-w-sm rounded-2xl px-6 py-5"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <h3
          id="survey-modal-title"
          className="font-display italic text-[20px] mb-2"
          style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}
        >
          {title}
        </h3>
        <p
          className="text-sm mb-5"
          style={{ color: "var(--text-secondary)", lineHeight: 1.55 }}
        >
          {description}
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onPrimary}
            className="w-full py-3 rounded-lg text-sm font-semibold transition-transform active:scale-[0.98]"
            style={{ background: "var(--accent)", color: "var(--bg)" }}
          >
            {primaryLabel}
          </button>
          {secondaryLabel && onSecondary ? (
            <button
              type="button"
              onClick={onSecondary}
              className="w-full py-3 rounded-lg text-sm transition-transform active:scale-[0.99]"
              style={{
                background: "transparent",
                color: "var(--text-secondary)",
                border: "1px solid var(--border)",
              }}
            >
              {secondaryLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

"use client";

/**
 * Persona v2 — 정적 풀 기반 취향 설문 state machine (2026-06-06 정상 경로 승격).
 *
 * 단계 흐름:
 *   context_select → step(1) → step(2) → step(3) → favorites_pick → summary_preview → done
 *
 * 추가 분기:
 *   - 진입 시 sessionStorage 진행 상황 발견 → resume_modal
 *   - 사용자 닫기 → analytics taste_survey_abandoned
 *
 * 2026-06-06 정상 경로 승격:
 *   - LLM 호출 (fetchSurveyStep / fetchSurveySummary) 전부 제거
 *   - step_loading / summary_loading phase 제거 (즉시 다음 step)
 *   - error_modal phase 페기 (LLM 에러 흐름 자체 사라짐)
 *   - 모든 사용자 3-step path (정적 풀 step 2 shouldContinue=true 일관 설정)
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
  buildFallbackSummary,
  getStaticSurveyStep,
  type PersonaContext,
  type SurveyOption,
  type SurveyStepOutput,
  type SurveySummaryOutput,
  type TasteSurveyAnswer,
} from "@neq/core";
import { createPersona, switchPersona } from "@/lib/store";
import { track } from "@/lib/analytics";
import {
  clearProgress,
  loadProgress,
  saveProgress,
} from "./_lib/survey-storage";
import PersonaContextSelector from "./PersonaContextSelector";
import TasteSurveyStep from "./TasteSurveyStep";
import TasteSummaryPreview from "./TasteSummaryPreview";
import TasteSurveyFavoritesPicker, {
  type FavoritePickItem,
} from "./TasteSurveyFavoritesPicker";

type Phase =
  | "context_select"
  | "resume_modal"
  | "step_question"
  | "favorites_pick"
  | "summary_preview"
  | "done";

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
  /**
   * Onboarding 통합 모드 — 외부 StepHeader 사용 시.
   * SurveyHeader 가 hide. phase 변화 시 onSubStepChange callback 으로 부모
   * (onboarding) 에 진행 상황 알림. 부모는 자체 StepHeader 의 current 갱신.
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
  const [phase, setPhase] = useState<Phase>("context_select");
  const [context, setContext] = useState<PersonaContext | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  // 정적 풀 step 2 shouldContinue=true 로 기본 3-step path.
  const [totalSteps, setTotalSteps] = useState<2 | 3>(3);
  const [prevAnswers, setPrevAnswers] = useState<TasteSurveyAnswer[]>([]);
  const [currentOutput, setCurrentOutput] = useState<SurveyStepOutput | null>(
    null,
  );
  const [summary, setSummary] = useState<SurveySummaryOutput | null>(null);
  const [favorites, setFavorites] = useState<FavoritePickItem[]>([]);
  /** 진입 시각 — taste_survey_completed.duration_ms 계산용. */
  const startedAtRef = useRef<number>(Date.now());
  /** 동일 step 중복 요청 차단 ref (빠른 더블탭 가드). */
  const inflightRef = useRef(false);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- beginStep 은 forward useCallback, deps 추가 시 정의 순서 circular.
  }, [resurveyPersonaId]);

  // === 정적 풀에서 step 질문 로드 ===
  const beginStep = useCallback(
    (
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
        setPhase("step_question");

        // sessionStorage 진행 상황 저장 (mid-survey 복구용)
        saveProgress({
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- beginSummary 는 forward useCallback, deps 추가 시 정의 순서 circular.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- beginSummary 는 forward useCallback, deps 추가 시 정의 순서 circular.
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
      track("taste_summary_generated", {
        contentType: ctx.contentType,
        companion: ctx.companion,
        summary_chars: result.tasteSummary.length,
        axes_count: result.axes.length,
        // 정상 경로 (정적 풀 승격, 2026-06-06) — fallback 아님. baseline 비교용 유지.
        used_fallback: false,
      });
      setPrevAnswers(answers);
      setSummary(result);
      setPhase("summary_preview");
    },
    [favorites],
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
    startedAtRef.current = Date.now();
    track("taste_survey_started", {
      contentType: context.contentType,
      companion: context.companion,
      is_resurvey: !!resurveyPersonaId,
      resumed: true,
    });
    beginStep(context, existing.step, existing.prevAnswers);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleResumeRestart 는 forward useCallback (다음 함수), deps 추가 시 정의 순서 circular.
  }, [context, beginStep, resurveyPersonaId]);

  const handleResumeRestart = useCallback(() => {
    if (!context) return;
    clearProgress(context);
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

  // embedded 모드: phase 변화 시 부모 (onboarding) 에 subStep 알림.
  // modal/done phase 에서는 onSubStepChange 호출 skip — 헤더가 모달 뒤에서
  // 1 로 fall-through 해 progress 역행하는 회귀 차단.
  useEffect(() => {
    if (!embedded) return;
    if (phase === "resume_modal" || phase === "done") return;
    let subStep = 1;
    if (phase === "step_question") {
      subStep = step === 1 ? 2 : 3;
    } else if (phase === "favorites_pick") {
      subStep = 4;
    } else if (phase === "summary_preview") {
      subStep = 5;
    }
    embedded.onSubStepChange(subStep);
  }, [embedded, phase, step]);

  // === Render ===
  return (
    <div
      className={`flex flex-col max-w-[480px] mx-auto w-full ${
        embedded ? "flex-1 min-h-0" : "h-dvh"
      }`}
      style={{ background: "var(--bg)" }}
    >
      {!embedded && (
        <SurveyHeader
          phase={phase}
          step={step}
          totalSteps={totalSteps}
          onCancel={handleCancel}
        />
      )}

      {phase === "context_select" && (
        <PersonaContextSelector onNext={handleContextNext} />
      )}

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
  // 자체 progress (profile 진입 케이스만 사용 — onboarding 은 외부 StepHeader).
  const stages = 1 + totalSteps + 1 + 1;
  let current = 1;
  if (phase === "step_question") current = 1 + step;
  else if (phase === "favorites_pick") current = 1 + totalSteps + 1;
  else if (phase === "summary_preview") current = stages;

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

        {/* eslint-disable-next-line @next/next/no-img-element --
            neq 브랜드 워드마크. next/image 변환 시 LCP / aspect-ratio
            변화로 깜빡임 발생 (DESIGN.md Brand Identity, 위임 R #1). */}
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

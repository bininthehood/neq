"use client";

/**
 * Onboarding V2 컨트롤러 (D4a) — 5단계 라우팅.
 *
 * flag (`NEXT_PUBLIC_ONBOARDING_V2`) ON 시 `apps/web/src/app/onboarding/page.tsx` 가
 * 본 컴포넌트를 mount. flag OFF 면 V1 단일 단계 그대로 사용 (회귀 0).
 *
 * 단계: welcome → hello → genre → persona → ott → /onboarding/complete
 *  - 각 단계 진입 시 `onboarding_step_viewed` 발사
 *  - 각 단계 완료 시 `onboarding_step_completed` (duration_ms 포함)
 *  - 마지막 단계 완료 시 `onboarding_completed` (전체 duration + 카운트)
 *
 * account_prefs 저장은 각 단계 컴포넌트 내부에서 즉시 수행 (사용자 도중 종료해도 보존).
 *
 * 2026-06-16: notify 단계 제거. 알림 인프라 disabled
 *   (NEXT_PUBLIC_NOTIFICATIONS_ENABLED=false + VAPID 키 미설정) 로 사용자에게 토글
 *   약속만 노출되는 문제 차단. 활성화 시점 결정되면 설정 화면 또는 onboarding 재도입.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePersona } from "@/contexts/PersonaContext";
import { track } from "@/lib/analytics";
import { getAccountPrefs } from "@/lib/account-prefs";
import StepHeader from "./StepHeader";
import OnboardingStepWelcome from "./OnboardingStepWelcome";
import OnboardingStepHello from "./OnboardingStepHello";
import OnboardingStepGenre from "./OnboardingStepGenre";
import PersonaSurveyController from "./PersonaSurveyController";
import OnboardingStepOTT from "./OnboardingStepOTT";
import {
  STEP_LABELS,
  TOTAL_STEPS,
  UNIFIED_TOTAL_STEPS,
  computeUnifiedHeaderCurrent,
  type StepKey,
} from "./data";

export default function OnboardingV2Controller() {
  const router = useRouter();
  const persona = usePersona();
  const [step, setStep] = useState(0);
  // persona step (3) 내부의 sub-step (1~5). 외부 StepHeader 의 current 계산용.
  const [personaSubStep, setPersonaSubStep] = useState(1);

  // 진입 시각 — onboarding_completed 의 duration_ms 계산용.
  // 한 번도 mutate 안 함 → useState lazy init 으로 R19 purity 회피.
  const [startedAt] = useState(() => Date.now());
  // 단계 진입 시각 — onboarding_step_completed 의 duration_ms 계산용.
  // line 65 effect 에서 mutate 하므로 useRef. init Date.now() 는 첫 step
  // duration 의 baseline 이라 의미 있음 → disable + 사유.
  // eslint-disable-next-line react-hooks/purity -- useRef init Date.now() — 첫 step duration baseline (mutate 되기 전 1회)
  const stepStartRef = useRef<number>(Date.now());
  const startedTrackedRef = useRef(false);
  const lastViewedStepRef = useRef<number>(-1);

  // 진입 시 1회 onboarding_started 발사 (V1 호환)
  useEffect(() => {
    if (startedTrackedRef.current) return;
    startedTrackedRef.current = true;
    track("onboarding_started");
  }, []);

  // persona step 을 떠나면 personaSubStep 리셋 — R19 canonical prev-prop
  // tracking (헤더 stale 7/10 → 4/10 점프 회귀 차단).
  const [prevStepForReset, setPrevStepForReset] = useState(step);
  if (prevStepForReset !== step) {
    setPrevStepForReset(step);
    if (step !== 3) setPersonaSubStep(1);
  }

  // 단계 진입 시마다 step_viewed 발사 + step 시작 시각 기록 (side effect).
  useEffect(() => {
    if (lastViewedStepRef.current === step) return;
    lastViewedStepRef.current = step;
    stepStartRef.current = Date.now();
    track("onboarding_step_viewed", { step: STEP_LABELS[step] as StepKey });
  }, [step]);

  // 다음 단계로 이동 — 현재 단계 완료 이벤트 + step++
  // (event handler 의미. R19 purity false positive 회피용 disable.)
  function goNext(props?: Record<string, string | number | boolean>) {
    const stepKey = STEP_LABELS[step];
    // eslint-disable-next-line react-hooks/purity -- event handler 안 Date.now() — R19 purity false positive (render context 아님)
    const duration = Date.now() - stepStartRef.current;
    track("onboarding_step_completed", {
      step: stepKey,
      duration_ms: duration,
      ...props,
    });

    if (step < TOTAL_STEPS - 1) {
      setStep((s) => s + 1);
      return;
    }

    // 마지막 단계 완료 → 종합 이벤트 + Bridge 로 이동
    finalize();
  }

  function goBack() {
    if (step === 0) return;
    setStep((s) => s - 1);
  }

  function finalize() {
    const prefs = getAccountPrefs();
    const totalDuration = Date.now() - startedAt;
    track("onboarding_completed", {
      duration_ms: totalDuration,
      tasteGenres_count: prefs.tasteGenres.length,
      subscribedOtt_count: prefs.subscribedOtt.length,
    });

    // V1 호환: persona.refresh + onboarding 완료 시각 기록
    persona.refresh();
    try {
      localStorage.setItem("neq_onboarded", "true");
      localStorage.setItem("neq_onboarding_done", "true");
      sessionStorage.setItem("neq_onb_completed_ts", String(Date.now()));
    } catch { /* ignore */ }

    router.push("/onboarding/complete");
  }

  // 통합 progress — UNIFIED_TOTAL_STEPS / computeUnifiedHeaderCurrent 는 data.ts 정의.
  // persona sub-step 은 PersonaSurveyController 의 onSubStepChange callback 으로 갱신.
  const headerCurrent = computeUnifiedHeaderCurrent(step, personaSubStep);

  // persona step 의 subStep ≥ 2 (LLM 요청 / 답변 / favorites / summary) 에서는
  // back 정책상 onboarding 으로 복귀가 불가 (controller 내부 phase 뒤로 미지원).
  // 사용자가 LLM 행이거나 rate-limit 에러 시 빠져나갈 수 없는 trap 방지를 위해
  // 우상단 건너뛰기 버튼 제공 — 확인 후 onCancel (persona 건너뛰고 OTT 로 진행).
  const showPersonaSkip = step === 3 && personaSubStep >= 2;

  // PersonaSurveyController 에 전달하는 embedded prop — 안정 reference 로 묶어
  // 매 parent render 마다 자식의 onSubStepChange useEffect 가 재발화하지 않도록.
  // setPersonaSubStep 은 React 가 보장하는 stable identity 이므로 deps 비움 안전.
  const embeddedProp = useMemo(
    () => ({ onSubStepChange: setPersonaSubStep }),
    [],
  );

  function handlePersonaSkip() {
    if (typeof window !== "undefined") {
      const ok = window.confirm("취향 만들기를 건너뛸까요? 나중에 프로필에서 만들 수 있어요.");
      if (!ok) return;
    }
    goNext({ persona_created: false, skipped_from_header: true });
  }

  return (
    <div className="h-dvh flex flex-col max-w-[480px] mx-auto w-full" style={{ background: "var(--bg)" }}>
      <StepHeader
        current={headerCurrent}
        total={UNIFIED_TOTAL_STEPS}
        onBack={
          step > 0 && (step !== 3 || personaSubStep === 1) ? goBack : undefined
        }
        onSkip={showPersonaSkip ? handlePersonaSkip : undefined}
        skipLabel="취향 만들기 건너뛰기"
      />

      {step === 0 && <OnboardingStepWelcome onNext={() => goNext()} />}
      {step === 1 && (
        <OnboardingStepHello onNext={(name) => goNext({ has_nickname: name.length > 0 })} />
      )}
      {step === 2 && (
        <OnboardingStepGenre
          onNext={(opts) => goNext(opts?.random ? { random: true, selected_count: 0 } : undefined)}
        />
      )}
      {step === 3 && (
        <PersonaSurveyController
          onComplete={() => goNext({ persona_created: true })}
          onCancel={() => goNext({ persona_created: false })}
          embedded={embeddedProp}
        />
      )}
      {step === 4 && <OnboardingStepOTT onNext={() => goNext()} />}
    </div>
  );
}

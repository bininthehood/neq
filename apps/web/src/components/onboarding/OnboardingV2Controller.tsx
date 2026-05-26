"use client";

/**
 * Onboarding V2 컨트롤러 (D4a) — 5단계 라우팅.
 *
 * flag (`NEXT_PUBLIC_ONBOARDING_V2`) ON 시 `apps/web/src/app/onboarding/page.tsx` 가
 * 본 컴포넌트를 mount. flag OFF 면 V1 단일 단계 그대로 사용 (회귀 0).
 *
 * 단계: welcome → hello → taste → ott → notify → /onboarding/complete
 *  - 각 단계 진입 시 `onboarding_step_viewed` 발사
 *  - 각 단계 완료 시 `onboarding_step_completed` (duration_ms 포함)
 *  - 마지막 단계 완료 시 `onboarding_completed` (전체 duration + 카운트)
 *
 * account_prefs 저장은 각 단계 컴포넌트 내부에서 즉시 수행 (사용자 도중 종료해도 보존).
 *
 * 디자인 산출물 NekoOnboarding 함수 매핑.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePersona } from "@/contexts/PersonaContext";
import { track } from "@/lib/analytics";
import { getAccountPrefs } from "@/lib/account-prefs";
import StepHeader from "./StepHeader";
import OnboardingStepWelcome from "./OnboardingStepWelcome";
import OnboardingStepHello from "./OnboardingStepHello";
import OnboardingStepGenre from "./OnboardingStepGenre";
import OnboardingStepTaste from "./OnboardingStepTaste";
import PersonaSurveyController from "./PersonaSurveyController";
import OnboardingStepOTT from "./OnboardingStepOTT";
import OnboardingStepNotify from "./OnboardingStepNotify";
import { STEP_LABELS, TOTAL_STEPS, type StepKey } from "./data";

export default function OnboardingV2Controller() {
  const router = useRouter();
  const persona = usePersona();
  const [step, setStep] = useState(0);

  // 진입 시각 — onboarding_completed 의 duration_ms 계산용
  const startedAtRef = useRef<number>(Date.now());
  // 단계 진입 시각 — onboarding_step_completed 의 duration_ms 계산용
  const stepStartRef = useRef<number>(Date.now());
  const startedTrackedRef = useRef(false);
  const lastViewedStepRef = useRef<number>(-1);

  // 진입 시 1회 onboarding_started 발사 (V1 호환)
  useEffect(() => {
    if (startedTrackedRef.current) return;
    startedTrackedRef.current = true;
    track("onboarding_started");
  }, []);

  // 단계 진입 시마다 step_viewed 발사
  useEffect(() => {
    if (lastViewedStepRef.current === step) return;
    lastViewedStepRef.current = step;
    stepStartRef.current = Date.now();
    track("onboarding_step_viewed", { step: STEP_LABELS[step] as StepKey });
  }, [step]);

  // 다음 단계로 이동 — 현재 단계 완료 이벤트 + step++
  function goNext(props?: Record<string, string | number | boolean>) {
    const stepKey = STEP_LABELS[step];
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
    const totalDuration = Date.now() - startedAtRef.current;
    track("onboarding_completed", {
      duration_ms: totalDuration,
      tasteGenres_count: prefs.tasteGenres.length,
      subscribedOtt_count: prefs.subscribedOtt.length,
      notify_weekly: prefs.notificationPrefs.weeklyRec,
      notify_new_release: prefs.notificationPrefs.newRelease,
      notify_ott_expiry: prefs.notificationPrefs.ottExpiry,
      notify_monthly_report: prefs.notificationPrefs.monthlyReport,
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

  return (
    <div className="h-dvh flex flex-col max-w-[480px] mx-auto w-full" style={{ background: "var(--bg)" }}>
      {/* persona step (3) 은 PersonaSurveyController 자체 SurveyHeader 가짐 →
          onboarding StepHeader 와 중복. 그 단계에서만 hide. */}
      {step !== 3 && (
        <StepHeader current={step} total={TOTAL_STEPS} onBack={step > 0 ? goBack : undefined} />
      )}

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
        />
      )}
      {step === 4 && <OnboardingStepOTT onNext={() => goNext()} />}
      {step === 5 && <OnboardingStepNotify onNext={() => goNext()} />}
    </div>
  );
}

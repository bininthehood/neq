"use client";

import { useRouter } from "next/navigation";
import PersonaSurveyController from "@/components/onboarding/PersonaSurveyController";

/**
 * Persona v2 — onboarding 마지막 단계 (Hybrid, web).
 *
 * 기존 5단계 (Welcome/Hello/Taste/OTT/Favorites/Notify) 통과 후 finalize 시점에
 * NEXT_PUBLIC_PERSONA_SURVEY_V2_ENABLED flag ON 이면 setOnboarded 를 skip 하고
 * 이 라우트로 진입. PersonaSurveyController 가 첫 페르소나 생성을 마치면
 * neq_onboarded 를 set + router.push('/') 로 Discover 진입.
 *
 * onCancel 도 동일 — 페르소나 생성 건너뛰면 기본 default 페르소나로 진행.
 *
 * profile 의 "+ 새 취향 추가" 진입과는 별도 라우트 (close 동작 차이).
 */
export default function OnboardingPersonaV2Page() {
  const router = useRouter();

  function finalize() {
    try {
      localStorage.setItem("neq_onboarded", "true");
      localStorage.setItem("neq_onboarding_done", "true");
    } catch {
      /* ignore */
    }
    router.replace("/");
  }

  return (
    <PersonaSurveyController
      onComplete={() => finalize()}
      onCancel={() => finalize()}
    />
  );
}

"use client";

import OnboardingV2Controller from "@/components/onboarding/OnboardingV2Controller";

/**
 * /onboarding — V2 단계별 컨트롤러로 위임. V1 흐름은 default ON 정책 안착 후 제거됨.
 */
export default function OnboardingPage() {
  return <OnboardingV2Controller />;
}

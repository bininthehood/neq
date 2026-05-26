import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack } from 'expo-router';
import { colors } from '../../lib/tokens';
import { track } from '../../lib/analytics';
import { getAccountPrefs, setOnboarded } from '../../lib/store';
import StepHeader from '../../components/onboarding/StepHeader';
import OnboardingStepWelcome from '../../components/onboarding/OnboardingStepWelcome';
import OnboardingStepHello from '../../components/onboarding/OnboardingStepHello';
import OnboardingStepTaste from '../../components/onboarding/OnboardingStepTaste';
import PersonaSurveyController from '../../components/onboarding/PersonaSurveyController';
import OnboardingStepOTT from '../../components/onboarding/OnboardingStepOTT';
import OnboardingStepNotify from '../../components/onboarding/OnboardingStepNotify';
import { STEP_LABELS, TOTAL_STEPS, type StepKey } from '../../components/onboarding/data';

/**
 * 통합 10단계 onboarding progress.
 * welcome(0)/hello(1)/genre(2) → 1·2·3, persona(3) sub-step → 4~8 (5단계,
 * Controller 가 자체 표시), ott(4)/notify(5) → 9·10.
 *
 * StepHeader 와 Controller SurveyHeader 가 같은 total = UNIFIED_TOTAL_STEPS
 * 를 공유 → 사용자에게 일관된 진행률.
 */
const UNIFIED_TOTAL_STEPS = 10;
const PERSONA_STEP_OFFSET = 3; // persona 진입 직전까지의 step 수 (welcome/hello/genre).
// persona 안의 sub-step 5종 (context + LLM step1 + LLM step2/3 + favorites + summary)
// 은 Controller 의 SurveyHeader 가 stepOffset 적용해 4~8 표시.

/**
 * Onboarding V2 (D4a, native) — 6단계 router.
 *
 * 단계: welcome → hello → genre → taste → ott → notify → /onboarding/complete
 *  - 'genre' = 장르 칩 3개 선택 (구 OnboardingStepTaste 의미 유지)
 *  - 'taste' = 작품 3-5개 선택 (web `OnboardingStepTaste` 정합, 신규 추가 2026-05-18)
 *  - 각 단계 진입 시 `onboarding_step_viewed` 발사
 *  - 각 단계 완료 시 `onboarding_step_completed` (duration_ms)
 *  - 마지막 단계 완료 시 `onboarding_completed` (전체 duration + 카운트)
 *
 * account_prefs 저장은 각 단계 컴포넌트 내부에서 즉시 수행 (사용자 도중 종료해도 보존).
 *
 * Q4=A: native Notify 단계 토글은 활성화하되 "iOS 출시 후 활성화" 라벨 + push 발급 X.
 *
 * 진입 경로 (W5 Task A):
 *  - `finalize()` 에서 `setOnboarded()` 호출 → AsyncStorage 'neq_onboarded' = 'true'.
 *  - Discover (`app/index.tsx`) 의 mount effect 가 `hasOnboarded()` false 면
 *    `router.replace('/onboarding')` 로 진입. 완료 후 `complete.tsx` 가
 *    `router.replace('/')` 로 Discover 로 복귀하고 가드 통과.
 */

export default function OnboardingScreen() {
  const [step, setStep] = useState(0);

  const startedAtRef = useRef<number>(Date.now());
  const stepStartRef = useRef<number>(Date.now());
  const startedTrackedRef = useRef(false);
  const lastViewedStepRef = useRef<number>(-1);

  useEffect(() => {
    if (startedTrackedRef.current) return;
    startedTrackedRef.current = true;
    track('onboarding_started');
  }, []);

  useEffect(() => {
    if (lastViewedStepRef.current === step) return;
    lastViewedStepRef.current = step;
    stepStartRef.current = Date.now();
    track('onboarding_step_viewed', { step: STEP_LABELS[step] as StepKey });
  }, [step]);

  function goNext(props?: Record<string, string | number | boolean>) {
    const stepKey = STEP_LABELS[step];
    const duration = Date.now() - stepStartRef.current;
    track('onboarding_step_completed', {
      step: stepKey,
      duration_ms: duration,
      ...props,
    });

    if (step < TOTAL_STEPS - 1) {
      setStep((s) => s + 1);
      return;
    }

    void finalize();
  }

  function goBack() {
    if (step === 0) return;
    setStep((s) => s - 1);
  }

  async function finalize() {
    const prefs = await getAccountPrefs();
    const totalDuration = Date.now() - startedAtRef.current;
    track('onboarding_completed', {
      duration_ms: totalDuration,
      tasteGenres_count: prefs.tasteGenres.length,
      subscribedOtt_count: prefs.subscribedOtt.length,
      notify_weekly: prefs.notificationPrefs.weeklyRec,
      notify_new_release: prefs.notificationPrefs.newRelease,
      notify_ott_expiry: prefs.notificationPrefs.ottExpiry,
      notify_monthly_report: prefs.notificationPrefs.monthlyReport,
    });

    await setOnboarded();
    router.replace('/onboarding/complete');
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {/* 통합 10단계 progress: welcome(0)/hello(1)/genre(2) → 1·2·3,
            persona(3) sub-step → 4·5·6·7·8 (Controller 가 자체 표시),
            ott(4)/notify(5) → 9·10. persona step 은 Controller SurveyHeader 가 진행률
            대신 표시 → StepHeader hide. */}
        {step !== 3 && (
          <StepHeader
            current={step < 3 ? step : step + 4}
            total={UNIFIED_TOTAL_STEPS}
            onBack={step > 0 ? goBack : undefined}
          />
        )}

        <View style={styles.body}>
          {step === 0 && <OnboardingStepWelcome onNext={() => goNext()} />}
          {step === 1 && (
            <OnboardingStepHello
              onNext={(name) => goNext({ has_nickname: name.length > 0 })}
            />
          )}
          {step === 2 && <OnboardingStepTaste onNext={() => goNext()} />}
          {step === 3 && (
            <PersonaSurveyController
              onComplete={() => goNext({ persona_created: true })}
              onCancel={() => goNext({ persona_created: false })}
              embedded={{
                totalStepsOverride: UNIFIED_TOTAL_STEPS,
                stepOffset: PERSONA_STEP_OFFSET,
              }}
            />
          )}
          {step === 4 && <OnboardingStepOTT onNext={() => goNext()} />}
          {step === 5 && <OnboardingStepNotify onNext={() => goNext()} />}
        </View>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1 },
});

import { useEffect, useRef, useState } from 'react';
import { Alert, View, StyleSheet } from 'react-native';
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
// persona 안의 sub-step 5종 (context + LLM step1 + LLM step2/3 + favorites + summary)
// 은 controller 의 onSubStepChange callback 으로 부모 (StepHeader) 가 4~8 표시.

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
  // persona step (3) 내부의 sub-step (1~5). 외부 StepHeader 의 current 계산용.
  const [personaSubStep, setPersonaSubStep] = useState(1);

  const startedAtRef = useRef<number>(Date.now());
  const stepStartRef = useRef<number>(Date.now());
  const startedTrackedRef = useRef(false);
  const lastViewedStepRef = useRef<number>(-1);

  useEffect(() => {
    if (startedTrackedRef.current) return;
    startedTrackedRef.current = true;
    track('onboarding_started');
  }, []);

  // persona step 을 떠나면 personaSubStep 리셋 — 다시 들어왔을 때 헤더 stale 회귀 차단.
  useEffect(() => {
    if (lastViewedStepRef.current === step) return;
    lastViewedStepRef.current = step;
    stepStartRef.current = Date.now();
    track('onboarding_step_viewed', { step: STEP_LABELS[step] as StepKey });
    if (step !== 3) setPersonaSubStep(1);
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

  // persona subStep ≥ 2 일 때만 우상단 건너뛰기 노출. LLM 행 / rate-limit trap 차단.
  const showPersonaSkip = step === 3 && personaSubStep >= 2;
  function handlePersonaSkip() {
    Alert.alert(
      '페르소나 만들기를 건너뛸까요?',
      '나중에 프로필에서 만들 수 있어요.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '건너뛰기',
          style: 'destructive',
          onPress: () => goNext({ persona_created: false, skipped_from_header: true }),
        },
      ],
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {/* 통합 10단계 progress (모든 step 에서 동일 StepHeader 사용):
            - welcome(0)/hello(1)/genre(2) → 1·2·3
            - persona(3) sub-step (1~5) → 4·5·6·7·8 (Controller 가 onSubStepChange
              callback 으로 personaSubStep 갱신)
            - ott(4)/notify(5) → 9·10
            persona step 에서 뒤로가기 = subStep 1 (context_select) 일 때만 onboarding
            goBack (Genre 복귀). 그 외엔 controller 내부 phase 뒤로 미지원 → hide.
            대신 우상단 건너뛰기 (subStep≥2) 노출 — LLM 행 / rate-limit trap 차단. */}
        <StepHeader
          current={
            step < 3
              ? step
              : step === 3
                ? 3 + (personaSubStep - 1)
                : step + 4
          }
          total={UNIFIED_TOTAL_STEPS}
          onBack={
            step > 0 && (step !== 3 || personaSubStep === 1) ? goBack : undefined
          }
          onSkip={showPersonaSkip ? handlePersonaSkip : undefined}
          skipLabel="페르소나 만들기 건너뛰기"
        />

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
                onSubStepChange: setPersonaSubStep,
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

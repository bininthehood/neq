import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';
import PersonaSurveyController from '../../components/onboarding/PersonaSurveyController';
import { setOnboarded } from '../../lib/store';
import { colors } from '../../lib/tokens';

/**
 * Persona v2 — onboarding 마지막 단계 (Hybrid).
 *
 * 기존 5단계 (Welcome/Hello/Taste/OTT/Favorites/Notify) 통과 후 finalize 시점에
 * EXPO_PUBLIC_PERSONA_SURVEY_V2_ENABLED flag ON 이면 setOnboarded 를 skip 하고
 * 이 라우트로 진입. PersonaSurveyController 가 첫 페르소나 생성을 마치면
 * setOnboarded() + router.replace('/') 로 Discover 진입.
 *
 * onCancel 도 동일 처리 — 사용자가 페르소나 생성 건너뛰면 기본 default 페르소나로
 * 진행. setOnboarded 후 Discover 로.
 *
 * profile 의 "+ 새 취향 추가" 진입과는 별도 라우트 (close 동작 차이).
 */
export default function OnboardingPersonaV2Route() {
  const router = useRouter();

  async function finalize() {
    await setOnboarded();
    router.replace('/');
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false, animation: 'fade' }} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <PersonaSurveyController
          onComplete={() => {
            void finalize();
          }}
          onCancel={() => {
            void finalize();
          }}
        />
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
});

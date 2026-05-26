import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';
import PersonaSurveyController from '../../components/onboarding/PersonaSurveyController';
import { colors } from '../../lib/tokens';

/**
 * Persona v2 — LLM 동적 취향 설문 진입 라우트 (native).
 *
 * profile 페이지의 "+ 새 취향 추가" 버튼이 EXPO_PUBLIC_PERSONA_SURVEY_V2_ENABLED
 * flag ON 일 때 이 화면으로 push. 완료/취소 시 router.back().
 *
 * PersonaSurveyController 가 createPersona + switchPersona 까지 자체 처리하므로
 * 이 라우트는 단지 라우팅 wrapper 역할.
 */
export default function TasteSurveyRoute() {
  const router = useRouter();

  function close() {
    // QA 회귀 (iOS 26.4): router.back() 호출 후 PersonaSurveyController 가 unmount
    // 되지 않고 phase='done' state 로 stuck → SurveyHeader 만 남는 케이스 확인.
    // canGoBack 분기 제거하고 항상 replace 로 강제 — profile 으로 명시 navigation.
    router.replace('/profile');
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false, animation: 'fade' }} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <PersonaSurveyController
          onComplete={() => close()}
          onCancel={() => close()}
        />
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
});

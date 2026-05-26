import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';
import PersonaSurveyController from '../../components/onboarding/PersonaSurveyController';
import { colors } from '../../lib/tokens';

/**
 * Persona v2 — LLM 동적 취향 설문 진입 라우트 (native).
 *
 * profile 페이지의 "+ 새 취향 추가" 버튼이 EXPO_PUBLIC_PERSONA_SURVEY_V2_ENABLED
 * flag ON 일 때 이 화면으로 push.
 *
 * PersonaSurveyController 가 createPersona + switchPersona 까지 자체 처리하므로
 * 이 라우트는 라우팅 wrapper 역할.
 *
 * QA 회귀 (iOS 26.4): router.replace('/profile') 후 라우트 컴포넌트가 GC 되지
 * 않고 stale 한 상태로 다음 router.push 시 재사용되는 케이스 확인 — phase='done'
 * 잔존으로 SurveyHeader 만 남는 빈 화면. 해결로 useFocusEffect + mountKey 패턴
 * 사용: 매 focus 마다 key 갱신 → React 가 PersonaSurveyController 강제 remount.
 */
export default function TasteSurveyRoute() {
  const router = useRouter();
  const [mountKey, setMountKey] = useState<number>(() => Date.now());

  useFocusEffect(
    useCallback(() => {
      // 매 focus 시 controller 강제 remount — 이전 mount 의 phase / token /
      // refs / inflight 모두 fresh 시작. unmount/remount 가 새 focus 를 트리거
      // 하지 않으므로 무한 loop 위험 없음.
      setMountKey(Date.now());
    }, []),
  );

  function close() {
    router.replace('/profile');
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false, animation: 'fade' }} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <PersonaSurveyController
          key={mountKey}
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

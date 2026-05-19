import { Stack } from 'expo-router';
import { colors } from '../../lib/tokens';

/**
 * Onboarding Stack 레이아웃 — 2026-05-19 native↔PWA 정합성 audit (구조 #1).
 *
 * 문제: 이 디렉토리에 `_layout.tsx` 가 없으면 루트 `app/_layout.tsx` 의 <Tabs> 가
 *   `onboarding` 을 자식 라우트(index/complete)를 가진 디렉토리 노드로 취급하고,
 *   그 노드에 placeholder 탭 슬롯(▼)을 1개 합성한다 → 하단 탭바에 4번째 탭 노출.
 *
 * 해결: 이 파일로 `onboarding` 을 단일 Stack 그룹 노드로 만든다. 그러면 expo-router
 *   가 leaf 두 개(`onboarding/index`, `onboarding/complete`) 대신 `onboarding`
 *   하나만 Tabs 의 노드로 등록 → 루트 `_layout.tsx` 의
 *   `<Tabs.Screen name="onboarding" options={{ href: null }} />` 한 줄로 숨김 처리.
 *   결과: 탭바 = 발견 / 저장 / 프로필 3개.
 *
 * 각 화면(index/complete)은 자체적으로 `<Stack.Screen options={...}/>` 를 선언하므로
 * 여기서는 그룹 공통값(헤더 숨김 + 배경)만 둔다.
 */
export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        contentStyle: { backgroundColor: colors.bg },
      }}
    />
  );
}

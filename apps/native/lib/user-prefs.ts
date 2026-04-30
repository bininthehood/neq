import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Onboarding V2 (D4a, native) — 사용자 호칭 (닉네임).
 *
 * web `apps/web/src/components/onboarding/OnboardingStepHello.tsx` 의 `getUserNickname` /
 * `setUserNickname` 패턴을 AsyncStorage 로 포팅. 키는 web 과 동일 (`neq_user_nickname`).
 */

const NICKNAME_KEY = 'neq_user_nickname';

export async function getUserNickname(): Promise<string> {
  try {
    return (await AsyncStorage.getItem(NICKNAME_KEY)) ?? '';
  } catch {
    return '';
  }
}

export async function setUserNickname(name: string): Promise<void> {
  try {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      await AsyncStorage.removeItem(NICKNAME_KEY);
    } else {
      await AsyncStorage.setItem(NICKNAME_KEY, trimmed);
    }
  } catch {
    /* silent — 실패해도 진행에 영향 없음 */
  }
}

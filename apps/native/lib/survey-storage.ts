/**
 * AsyncStorage wrapper for mid-survey 진행 복구 (native 버전).
 *
 * web `apps/web/src/components/onboarding/_lib/survey-storage.ts` 의 native 대응.
 * sessionStorage 가 RN 에 없으므로 AsyncStorage 로 대체. 모든 API 는 async.
 *
 * - 컨텍스트별 key 분리 (영화/혼자 vs 예능/같이 진행 무관)
 * - AsyncStorage 실패 시 silent fallback (saveProgress false 반환)
 * - JSON.parse 실패 → 손상 데이터 즉시 clear
 * - "처음부터" 선택 → 명시적 clear API
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PersonaContext, TasteSurveyAnswer } from '@neq/core';

export interface SurveyProgress {
  context: PersonaContext;
  prevAnswers: TasteSurveyAnswer[];
  step: 1 | 2 | 3;
  token?: string;
  /** persona id (재설문 모드) — 신규 생성이면 undefined */
  personaId?: string;
}

const KEY_PREFIX = 'neq_taste_survey_progress';

function contextKey(context: PersonaContext): string {
  return `${KEY_PREFIX}:${context.contentType}-${context.companion}`;
}

export async function saveProgress(progress: SurveyProgress): Promise<boolean> {
  try {
    await AsyncStorage.setItem(
      contextKey(progress.context),
      JSON.stringify(progress),
    );
    return true;
  } catch {
    return false;
  }
}

export async function loadProgress(
  context: PersonaContext,
): Promise<SurveyProgress | null> {
  const key = contextKey(context);
  let raw: string | null = null;
  try {
    raw = await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SurveyProgress;
    if (
      !parsed.context ||
      !Array.isArray(parsed.prevAnswers) ||
      (parsed.step !== 1 && parsed.step !== 2 && parsed.step !== 3)
    ) {
      await AsyncStorage.removeItem(key).catch(() => undefined);
      return null;
    }
    return parsed;
  } catch {
    await AsyncStorage.removeItem(key).catch(() => undefined);
    return null;
  }
}

export async function clearProgress(context: PersonaContext): Promise<void> {
  try {
    await AsyncStorage.removeItem(contextKey(context));
  } catch {
    // 무시
  }
}

export async function clearAllProgress(): Promise<void> {
  try {
    const all = await AsyncStorage.getAllKeys();
    const targets = all.filter((k) => k.startsWith(KEY_PREFIX));
    if (targets.length > 0) await AsyncStorage.multiRemove(targets);
  } catch {
    // 무시
  }
}

export async function hasProgress(context: PersonaContext): Promise<boolean> {
  const p = await loadProgress(context);
  return p !== null;
}

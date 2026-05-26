/**
 * sessionStorage wrapper for mid-survey 진행 복구.
 *
 * Test plan Test 2 (mid-survey 복구 6 케이스) 의 spec 구현.
 *
 * - 컨텍스트별 key 분리 (영화/혼자 vs 예능/같이 진행 무관)
 * - quota 초과 (~5MB) → silent fallback (복구 X)
 * - JSON.parse 실패 → 손상 데이터 즉시 clear
 * - "처음부터" 선택 → 명시적 clear API
 */
import type {
  PersonaContext,
  TasteSurveyAnswer,
} from '@neq/core';

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

/**
 * 진행 상황 저장. quota 초과 / write 실패 시 silent fallback (false 반환).
 * 호출자는 false 시 Sentry 캡쳐 권장.
 */
export function saveProgress(progress: SurveyProgress): boolean {
  if (typeof window === 'undefined' || !window.sessionStorage) return false;
  try {
    const key = contextKey(progress.context);
    sessionStorage.setItem(key, JSON.stringify(progress));
    return true;
  } catch {
    // QuotaExceededError, SecurityError, etc.
    return false;
  }
}

/**
 * 컨텍스트별 진행 상황 복구. corrupt 시 자동 clear + null 반환.
 */
export function loadProgress(
  context: PersonaContext,
): SurveyProgress | null {
  if (typeof window === 'undefined' || !window.sessionStorage) return null;
  const key = contextKey(context);
  const raw = sessionStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SurveyProgress;
    // 최소 검증
    if (
      !parsed.context ||
      !Array.isArray(parsed.prevAnswers) ||
      (parsed.step !== 1 && parsed.step !== 2 && parsed.step !== 3)
    ) {
      sessionStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    // Corrupt — 즉시 clear
    sessionStorage.removeItem(key);
    return null;
  }
}

/**
 * 특정 컨텍스트의 진행 상황 명시적 clear ("처음부터" 선택 or 완료).
 */
export function clearProgress(context: PersonaContext): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    sessionStorage.removeItem(contextKey(context));
  } catch {
    // 무시
  }
}

/**
 * 모든 컨텍스트의 progress 일괄 clear (전체 리셋 / 로그아웃 등에서).
 */
export function clearAllProgress(): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(KEY_PREFIX)) keysToRemove.push(key);
    }
    keysToRemove.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    // 무시
  }
}

/**
 * 진행 상황 존재 여부 (modal trigger 결정용).
 */
export function hasProgress(context: PersonaContext): boolean {
  return loadProgress(context) !== null;
}

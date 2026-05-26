/**
 * Sharpness 휴리스틱 — step 3 진입 판정 (server-side).
 *
 * outside voice MED #5: 클라이언트 pure function 으로 둘 경우 native OTA
 * 미지원으로 휴리스틱 튜닝이 web/native 분기. 서버로 이전하면 배포 한 번에
 * 양쪽 즉시 반영.
 *
 * 판정 규칙 (보수적):
 *   1. step 2 답 옵션이 "d" (관용적으로 "무관 / 모름") 이면 → step 3 추가
 *   2. step 1·2 답 옵션 id 가 양극단 (a·d 또는 d·a) 이면 → step 3 추가
 *      (사용자의 일관성이 약하다는 signal — 한 단계 더 명확화)
 *   3. 그 외 → false (step 2 까지로 종결)
 *
 * 본 함수는 step 2 endpoint 응답 시 호출. step 1 응답에는 항상 false.
 */
import type { TasteSurveyAnswer } from '@neq/core';

/**
 * step 2 답을 받은 후 호출. step 3 진입 여부 반환.
 *
 * @param prevAnswers - step 1 + step 2 의 답 (배열 길이 2 가정)
 * @returns true = step 3 추가, false = summarize 진입
 */
export function shouldAddStep3(prevAnswers: TasteSurveyAnswer[]): boolean {
  if (prevAnswers.length < 2) return false;

  const step1Opt = parseOptionId(prevAnswers[0].selectedOption);
  const step2Opt = parseOptionId(prevAnswers[1].selectedOption);

  // Rule 1: step 2 답이 "d" (무관/모름) — 마지막 옵션 = 답 회피 시그널
  if (step2Opt === 'd') return true;

  // Rule 2: 양극단 — step 1 이 'd' (회피) 였는데 step 2 가 'a' (강한 선호) →
  // 일관성 약함. (Rule 1 이 step2='d' 를 이미 처리하므로 a·d 케이스는 dead code)
  if (step1Opt === 'd' && step2Opt === 'a') return true;

  return false;
}

/**
 * selectedOption 문자열에서 옵션 id (a·b·c·d) 추출.
 * 클라이언트가 보내는 selectedOption 은 일반적으로 label 이지만, 옵션 id 도
 * 함께 보내거나 id 만 보내는 변형 가능. 본 휴리스틱은 id 가 별도 필드로
 * 들어오는 정식 spec 으로 진화 가능 (현재는 label 기반 추정).
 *
 * 본 v1 구현은 selectedOption 이 정확히 'a' | 'b' | 'c' | 'd' 가 아닐 경우
 * 'c' 로 fallback (중립).
 */
function parseOptionId(selectedOption: string): 'a' | 'b' | 'c' | 'd' {
  const lower = selectedOption.trim().toLowerCase();
  if (lower === 'a' || lower === 'b' || lower === 'c' || lower === 'd') {
    return lower;
  }
  // label 에서 단서 추출 ("무관" / "모름" → d)
  if (
    selectedOption.includes('무관') ||
    selectedOption.includes('모름') ||
    selectedOption.includes('잘 모르')
  ) {
    return 'd';
  }
  return 'c';
}

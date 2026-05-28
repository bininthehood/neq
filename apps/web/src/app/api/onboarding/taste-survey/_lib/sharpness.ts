/**
 * Sharpness 휴리스틱 — step 3 진입 판정 (server-side).
 *
 * outside voice MED #5: 클라이언트 pure function 으로 둘 경우 native OTA
 * 미지원으로 휴리스틱 튜닝이 web/native 분기. 서버로 이전하면 배포 한 번에
 * 양쪽 즉시 반영.
 *
 * 06 진단 B안 (2026-05-28, item (f)) — Rule 2 dead code fix.
 * 기존 (`step1='d' && step2='a'`) 한정 진입 조건은 Rule 1 (step2='d') 이 먼저
 * 처리하므로 사실상 never trigger. 새 정책: prevAnswers 길이 < 3 일 때 답 분산
 * 부족 시그널 — 같은 axisCategory 가 2 회 이상 등장 또는 'd' (회피) 가 1 회
 * 이상 — 으로 step 3 진입. 의도: step3 진입률 5% → 30%.
 *
 * 판정 규칙 (개정 후):
 *   1. step 2 답 옵션이 "d" (관용적으로 "무관 / 모름") → step 3 추가
 *   2. step 1·2 답 옵션 id 가 양극단 (a·d 또는 d·a) → step 3 추가
 *      (사용자의 일관성이 약하다는 signal)
 *   3. (NEW) prevAnswers 가 같은 axisCategory 를 2 회 이상 사용 →
 *      축이 안 다양해짐. 한 단계 더 다양화 (단, prev 가 axisCategory 동봉 시만 적용)
 *   4. (NEW) prevAnswers 중 d 옵션이 1 회 이상 등장 → 회피 signal 누적,
 *      한 번 더 명확화
 *   5. 그 외 → false (step 2 까지로 종결)
 *
 * 본 함수는 step 2 endpoint 응답 시 호출. step 1 응답에는 항상 false.
 */
import type { TasteSurveyAnswer } from '@neq/core';

/**
 * step 2 답을 받은 후 호출. step 3 진입 여부 반환.
 *
 * @param prevAnswers - step 1 + step 2 의 답 (배열 길이 2 가정. 길이 < 3 만 의미)
 * @returns true = step 3 추가, false = summarize 진입
 */
export function shouldAddStep3(prevAnswers: TasteSurveyAnswer[]): boolean {
  if (prevAnswers.length < 2) return false;
  // step 3 이미 답한 상태에서 호출되면 false (방어적)
  if (prevAnswers.length >= 3) return false;

  const step1Opt = parseOptionId(prevAnswers[0].selectedOption);
  const step2Opt = parseOptionId(prevAnswers[1].selectedOption);

  // Rule 1: step 2 답이 "d" (무관/모름) — 마지막 옵션 = 답 회피 시그널
  if (step2Opt === 'd') return true;

  // Rule 2: 양극단 — d·a (Rule 1 이 step2='d' 를 이미 처리하므로 여기는
  // step1='d' && step2='a' 케이스만 trigger. a·d 는 Rule 1 에서 잡힘)
  if (step1Opt === 'd' && step2Opt === 'a') return true;

  // Rule 3 (NEW): 같은 axisCategory 2 회 이상 → 축 다양성 부족 → 한 번 더
  // (client 가 prev 에 axisCategory 동봉할 때만 발동. 미동봉이면 skip)
  const usedAxes = prevAnswers
    .map((a) => (a as TasteSurveyAnswer & { axisCategory?: unknown }).axisCategory)
    .filter((v): v is string => typeof v === 'string');
  if (usedAxes.length >= 2) {
    const counts = new Map<string, number>();
    for (const ax of usedAxes) counts.set(ax, (counts.get(ax) ?? 0) + 1);
    for (const [, c] of counts) {
      if (c >= 2) return true;
    }
  }

  // Rule 4 (NEW): prev 답 중 d 옵션이 1 회 이상 등장 → 회피 누적
  // (step2='d' 는 Rule 1 에서 잡히므로 실질적으로 step1='d' && step2!='d' 만
  // 여기서 잡힘. Rule 2 의 d·a 와 일부 중복이지만 d·b, d·c 도 포함하게 확장)
  if (step1Opt === 'd') return true;

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

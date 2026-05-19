/**
 * e2e 공통 — 앱 생존 판정 헬퍼.
 *
 * 배경 (WARN-1, 2026-05-19 재검증):
 *   기존 swipe e2e 5종은 앱 생존을 `b.$('~발견').isDisplayed()` 로 판정했으나,
 *   실제 탭 버튼 accessibilityLabel 은 `발견` 이 아니라 `index, tab, 1 of N`
 *   (expo-router 라우트명 기반). `발견` 은 TabItem 내부 <Text> 콘텐츠일 뿐.
 *   → `~발견` 은 항상 미발견 → 정상 앱을 "crash" 로 오판 (false negative).
 *
 * 올바른 판정 기준 (이전 qa-tester 검증에서 채택):
 *   1) page source 의 XCUIElement 노드 수가 임계 이상   — 앱이 살아있고 트리가 렌더됨
 *   2) Expo redbox / Render Error 텍스트가 source 에 없음 — 치명적 JS 에러 화면 아님
 *
 * crash 시 page source 는 SpringBoard / blank 트리로 노드 수가 급감하므로,
 * 노드 수 임계값 + redbox 부재 조합이 selector 라벨보다 신뢰성 높다.
 */

const REDBOX_MARKERS = [
  'Render Error',
  'numColumns on the fly',
  'Element type is invalid',
  'Unhandled JS Exception',
  'ReferenceError',
  'TypeError:',
  "Can't find variable",
  'undefined is not an object',
];

/** XCUIElement 노드 수 임계 — 정상 Discover 화면은 수십~수백, crash 후 SpringBoard 는 한 자릿수. */
const MIN_ELEMENT_COUNT = 12;

/**
 * @param {import('webdriverio').Browser} b
 * @returns {Promise<{alive: boolean, elementCount: number, redbox: boolean, reason: string}>}
 */
export async function checkAlive(b) {
  let src = '';
  try {
    src = await b.getPageSource();
  } catch (e) {
    return { alive: false, elementCount: 0, redbox: false, reason: `getPageSource 실패 — 세션 단절 (${e.message})` };
  }

  // 1) XCUIElement 노드 수
  const elementCount = (src.match(/<XCUIElementType/g) || []).length;

  // 2) redbox / Render Error 텍스트 검출
  const hitMarker = REDBOX_MARKERS.find((m) => src.includes(m));
  const redbox = Boolean(hitMarker);

  let alive = true;
  let reason = `정상 — XCUIElement ${elementCount}개, redbox 없음`;

  if (redbox) {
    alive = false;
    reason = `redbox 검출 — "${hitMarker}"`;
  } else if (elementCount < MIN_ELEMENT_COUNT) {
    alive = false;
    reason = `XCUIElement ${elementCount}개 (< ${MIN_ELEMENT_COUNT}) — 앱 트리 비정상 / crash 의심`;
  }

  return { alive, elementCount, redbox, reason };
}

/** 카드 메타(국가·연도) 추출 — 전환 확인용. 없으면 빈 문자열. */
export async function cardMeta(b) {
  try {
    const src = await b.getPageSource();
    // "미국 · 2022" / "영국 · 1975" 형태 라벨
    const m = src.match(/(?:대한민국|미국|영국|일본|프랑스|독일|스페인|캐나다|호주|이탈리아)[^"]*?\d{4}/);
    return m ? m[0] : '';
  } catch {
    return '';
  }
}

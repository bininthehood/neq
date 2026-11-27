/**
 * 떠 있는 유리 탭바 치수 (Night Pool 4단계). 탭바는 화면 위에 absolute 로 떠서
 * 콘텐츠가 그 뒤로 지나간다 → 스크롤 끝 여백·카드 정보 영역이 이 값만큼 비켜 준다.
 *
 * ponytail: 아래 안전 영역은 앱 시작 시 값(initialWindowMetrics)으로 고정 — 세로 고정 앱이라 충분.
 * 가로 회전을 지원하게 되면 useSafeAreaInsets 기반 hook 으로 바꾼다.
 */
import { initialWindowMetrics } from 'react-native-safe-area-context';

export const TAB_BAR_HEIGHT = 64;
const insetBottom = initialWindowMetrics?.insets.bottom ?? 0;
/** 화면 아래에서 탭바 아래 끝까지. 홈 인디케이터 기기는 안전 영역 안쪽으로 조금 내려 앉힌다. */
export const TAB_BAR_BOTTOM = insetBottom > 0 ? Math.max(insetBottom - 10, 12) : 12;
/** 탭바가 가리는 화면 아래 높이 — 스크롤 끝 여백 등에 더한다. */
export const TAB_BAR_SPACE = TAB_BAR_BOTTOM + TAB_BAR_HEIGHT;

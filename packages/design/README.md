# @neq/design

Quiet Ink 디자인 토큰 — 웹/네이티브 공유.

## 구성

| 파일 | 용도 | 사용처 |
|------|------|------|
| `src/tokens.ts` | JS 상수 (colors, spacing, radius, shadows, fonts, fontsV2, easings, durations, fontSize) | 네이티브 (RN StyleSheet) + 웹 (인라인 스타일 / Tailwind config) |
| `src/tokens.css` | CSS 변수 + semantic typography classes (`.t-display`, `.t-body` 등) | 웹 (`@import "@neq/design/tokens.css"`) |

## 두 폰트 시스템 (Stage 4 전환 결정)

`fonts` 와 `fontsV2` 가 병존. 호환성 유지 + Stage 4 진입 시점 전환 결정.

| 키 | 출처 | 사용 시점 |
|----|------|---------|
| `fonts.display` = `'Fraunces_700Bold'` | Day 14 시점 | 현재. apps/native 다수 컴포넌트 사용 중 |
| `fonts.data` = `'Outfit_600SemiBold'` | Day 14 시점 | 현재 |
| `fontsV2.body` = `'PretendardVariable'` | 디자인 산출물 (Day 25 분석) | Stage 4 D1~D5 진입 시 메인 세션이 전환 결정 |
| `fontsV2.display` = `'InstrumentSerif'` | 디자인 산출물 (Day 25 분석) | 동일 |
| `fontsV2.data` = `'GeistMono'` | 디자인 산출물 (Day 25 분석) | 동일 |

전환 시 작업:
- 웹: `apps/web/src/app/layout.tsx` 의 `next/font/google` import 변경 (Fraunces/Outfit → Instrument Serif/Geist Mono) 또는 `tokens.css` 의 `@import` 활용
- 네이티브: `apps/native/app/_layout.tsx` 의 `expo-font` 로딩 변경 (Fraunces/Outfit → Pretendard/Instrument Serif/Geist Mono)

## 두 토큰 시스템 (TS vs CSS)

- **TS (`tokens.ts`)** — 네이티브 필수. 웹은 인라인 스타일 / Tailwind config 매핑 시 사용
- **CSS (`tokens.css`)** — 웹만. `@import` 후 CSS 변수 (`var(--bg)` 등) + semantic classes (`<div className="t-display">`)

같은 값이지만 형식 차이. JS 상수와 CSS 변수 간 sync 책임은 디자인 토큰 갱신 시 양쪽 모두 적용.

## 사용 예

### 웹 (CSS)
```css
/* apps/web/src/app/globals.css */
@import "@neq/design/tokens.css";

.my-card {
  background: var(--surface);
  border-radius: var(--radius-lg);
  padding: var(--space-md);
  transition: transform var(--duration-quick) var(--ease-spring);
}
```

```tsx
// apps/web/src/components/MyComponent.tsx
<h1 className="t-display">오늘 뭐 볼까?</h1>
<p className="t-body">알고리즘 밖의 OTT 작품을 발견하세요.</p>
```

### 네이티브 (TS)
```tsx
// apps/native/components/MyCard.tsx
import { colors, spacing, radius, easings, durations, fontSizePx } from '@neq/design';
import Animated, { Easing, withTiming } from 'react-native-reanimated';

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
});

const enterAnimation = withTiming(1, {
  duration: durations.steady,
  easing: Easing.bezier(...easings.enter),
});
```

## 갱신 이력

- 2026-04-30 (Day 25, 보조 세션): 디자인 산출물(`_workspace/design-handoff/_incoming/neq-design/project/system/colors_and_type.css`) 기준 토큰 보강
  - 색상 12종 / 간격 2종 / 반경 1종 신규
  - shadows / typography scale / motion (easings + durations) 신규 카테고리
  - `fontsV2` 신규 (Pretendard Variable + Instrument Serif + Geist Mono) — 기존 fonts 호환 유지
  - `tokens.css` 신규 (CSS 변수 + semantic typography classes)
- 2026-04-23 (Day 14): 초안 (colors 17 / spacing 6 / radius 4 / fonts 4)

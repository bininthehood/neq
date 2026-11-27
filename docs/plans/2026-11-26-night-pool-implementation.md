# Night Pool 리디자인 구현 계획

작성 2026-11-26 · 기준 문서 [DESIGN.md](../../DESIGN.md) · 브랜치 `design/night-pool`
상태: **계획 확정(엔지니어링 검토 완료) · 0~5단계 완료** · PR-S(T1) 브랜치 `fix/hidden-keys` 준비됨

## 목표와 범위
- iOS 네이티브 앱(`apps/native`)을 Quiet Ink → Night Pool로 바꾼다. 웹(PWA)은 같은 토큰을 쓰지만 화면 반영은 마지막 단계에서 따로 한다.
- 포함: 색·폰트·모양·젤리 프레스, 다크·라이트, 리퀴드 글래스(+ iOS 26 미만 대체), 위 스와이프 "관심 없음", 친구 메모 스티커.
- 제외: 정보 구조·화면 흐름 변경, 로고 마크·앱 아이콘(외부 의뢰), Android.

## 현재 코드 실측 (2026-11-26)
| 항목 | 실측 | 의미 |
|---|---|---|
| 공유 토큰 | `packages/design/src/tokens.ts`(315줄), `tokens.css`(239줄), `apps/web/src/app/globals.css`(409줄) | 네이티브는 `@neq/design` JS 상수를 `apps/native/lib/tokens.ts`가 재수출 |
| 네이티브 색 참조 | `colors.*` 609회 / 44파일, 하드코딩 색 18회 / 10파일 | 모두 모듈 수준 `StyleSheet.create` → 라이트 모드 전환 방식이 핵심 결정 |
| `colors.accent` | 94회 (+ dim/border 23회) | 채움 용도(→ 라임)와 글자 용도(→ 라이트에서 `limeText`/아쿠아)로 갈라야 함 |
| 네이티브 폰트 | `useFonts` 9종(Fraunces·Outfit·Instrument Serif·Geist Mono), `fontFamily` 71회, 한글 본문은 시스템 폰트 | SUIT 번들 + 기본 Text 폰트 지정 방식 필요 |
| 탭바 | JS `Tabs` 4슬롯(발견·큐·저장 + 검색 액션, `tabPress` preventDefault로 시트 열기), 프로필은 헤더 | 시스템 탭바 전환 시 검색 액션 유지 여부 미확인 |
| 카드 제스처 | `app/index.tsx` `Gesture.Pan()`(L1607), `dragY`로 아래=저장 | 위 방향 분기 추가 |
| 제외 목록 | `lib/store.ts` `getActiveExcludeIds`(최근 7일), 서버 `excludeIds` 최대 300 | "관심 없음"은 영구 목록이 따로 필요 |
| 추천 문구 | `packages/core/src/types.ts` `reason: string`, 프롬프트 `apps/web/src/lib/recommend/prompt.ts` | 짧은 메모 필드 추가 |
| 도구 | Xcode 26.5 설치됨, `expo-glass-effect`는 SDK 54용 0.1.x | 글래스는 네이티브 빌드 필요(OTA 불가) |

## 브랜치·배포 순서 (교차 검토 X1)
```
main ─┬─ PR-S (서버만): hiddenKeys 검증·필터 ──▶ 배포 (앱 심사 전 필수)
      │
      └─ design/night-pool (장기 브랜치): 0~5단계 + 웹은 옛 색 고정
                     └──▶ 1.1.0 제출 직전 main 병합 (웹 화면은 그대로)
                                   └─▶ 6단계 웹 반영 (별도 PR)
```
- 웹은 `apps/web/src/app/globals.css:2` 에서 `@neq/design/tokens.css` 를 가져온다 → 이 브랜치에서 웹 import 를 **옛 값 사본 `tokens-quiet-ink.css`** 로 바꿔 고정. 6단계에서 새 파일로 전환.
- 친구 메모는 앱 계산(X5)이라 서버 의존 없음. 서버 PR-S 는 숨김뿐.

## 단계

### 0. 스파이크 (반나절, 결정용 · 코드 버림)
1. **라이트 모드 방식:** `DynamicColorIOS({light, dark})`를 토큰 값으로 넣어 기존 `StyleSheet.create`를 그대로 두는 방식이 react-native-svg `color/fill`, Reanimated 스타일, `Image tintColor`, `StatusBar`에서 동작하는지 시뮬로 확인. 안 되는 곳 목록을 만든다.
   - 되면: 609곳을 거의 안 건드린다(권장). 안 되면: 해당 컴포넌트만 `useColorScheme` 기반 동적 스타일.
2. **글래스:** `npx expo install expo-glass-effect` → 시뮬(iOS 26)에서 `GlassView` 칩·버튼·시트 상단 렌더, 부모 `opacity` 애니메이션 문제 확인. **성능(D9):** 줄 단위 `GlassContainer` 묶음(칩 줄·액션바·헤더·탭바 ≈ 4개)으로 카드 스와이프 중 프레임을 Instruments로 측정 — 기준 60fps(최소 지원 기기에서). 미달 시 칩 줄은 불투명 대체.
3. **탭바:** `expo-router/unstable-native-tabs`로 4슬롯 + 검색 액션(시트 열기)이 가능한지. 불가하면 `GlassView` 기반 자체 탭바로 간다.
- 산출: 세 결정의 결과를 이 문서에 기록.

### 0단계 결과 (2026-11-26, iPhone 17 Pro 시뮬 · iOS 26.5 · 브랜치 `spike/night-pool-0` 2615173, 병합 금지)
| 항목 | 결과 | 결정 |
|---|---|---|
| `DynamicColorIOS` — View 배경·테두리, Text, react-native-svg `fill`/`stroke`/`color`, `Image tintColor` | 정상. 시스템 밝기를 바꾸면 **재시작 없이 즉시** 전환 | 기본 방식으로 채택 (호출부 ~587곳 그대로) |
| `DynamicColorIOS` — Reanimated `Animated.*` 의 **정적** 스타일 | **크래시** `[Reanimated] Invalid color value` (Reanimated 4.1.7 CSS 스타일 처리 `css/native/style/processors/colors.ts`) | 금지 |
| `DynamicColorIOS` — `useAnimatedStyle` 반환값 | 크래시는 없지만 **아무것도 안 그려짐**(조용한 실패) | 금지 |
| 대상 규모 | `Animated.*` 에 색 스타일이 걸린 곳 약 22곳 / 12파일 (ActionBar·SwipeCard·DetailSheet·SearchSheet·PrevCardOverlay·SkeletonCard·saved·onboarding/complete·tutorial 등) | 이 곳만 `useThemeColors()`(현재 밝기의 hex 문자열, `useColorScheme` 기반)로 |
| 리퀴드 글래스 | `isLiquidGlassAvailable()`·`isGlassEffectAPIAvailable()` 모두 true, `GlassView`/`GlassContainer` 렌더 정상 (`expo-glass-effect` 0.1.10, SDK 54 호환) | 채택. 라이트에서는 틴트를 라이트 값으로 바꿔야 회색으로 탁해지지 않음 |
| 글래스 성능 | 움직이는 포스터 위 4묶음: 유리 켬/끔 모두 UI 60fps, 최악 프레임 17ms (시뮬 — Mac GPU라 실기기 부하를 대표하지 않음) | 실기기(iPhone 15 Plus) 측정은 4단계 TestFlight에서 재확인 |
| 시스템 탭바(native tabs) | 코드 확인: `expo-router` 6.0.23 `NativeTabsView` 가 `onNativeFocusChange` 에서 무조건 `JUMP_TO` — `tabPress` preventDefault 없음. react-native-screens 4.16 `experimentalControlNavigationStateInJS` 가 있으나 expo-router가 노출하지 않음 | **자체 `GlassView` 탭바** 채택 (검색 = 시트 열기 동작·E2E 라벨 유지). 검색을 실제 탭 화면(role="search")으로 바꾸는 안은 제품 결정이 필요해 보류 |
| iOS 26 미만 대체 | 설치된 시뮬 런타임이 iOS 26.4/26.5뿐이라 미확인 | 4단계에서 `isLiquidGlassAvailable()` false 강제 분기로 대체 표현 확인 + 구형 기기 TestFlight |

**후속 규칙:** 공용 `GlassSurface`·`JellyPressable` 등 Reanimated 를 쓰는 공용 컴포넌트는 처음부터 `useThemeColors()` 를 쓴다. 정적 동적색이 `Animated.*` 에 들어가면 개발 모드에서 빨간 오류 화면으로 바로 드러나지만, `useAnimatedStyle` 반환은 조용히 사라지므로 라이트·다크 스크린샷 E2E(D8 ②)로 잡는다.

### 1. 토큰·폰트 기반 (네이티브 빌드 필요 — 폰트 내장)
- `packages/design/src/tokens.ts`: Night Pool 다크·라이트 팔레트, radius·motion(jelly·sheet) 토큰. 중립 키(`bg`, `surface`, `textPrimary` …)는 이름 유지·값만 교체. **`accent`·`accentDim`·`accentBorder*`·`accentHover`는 삭제**하고 `lime`(채움)·`limeText`(글자)·`aqua`·`aquaText`만 둔다 → 타입 오류로 117곳(94 + 23)을 빠짐없이 용도별 치환(D5).
- `tokens.css`: 같은 값의 CSS 변수 + `prefers-color-scheme: light` 블록. 웹은 이 단계에서 `tokens-quiet-ink.css`(옛 값 사본)를 가리키게 해 화면 변화 0(X1).
- **색 전환 층(X4):** 공유 `@neq/design` 에는 순수 값(`palette.dark`·`palette.light`)만 둔다. iOS용 `DynamicColorIOS` 묶음은 네이티브 전용 `apps/native/lib/tokens.ts` 에서 만들어 기존처럼 `colors` 로 내보낸다 → 웹 번들에 RN 의존 없음, 네이티브 호출부 609곳 변경 없음.
- **옛 폰트 키 삭제(X5):** `fonts`·`fontsV2.displayItalic` 등 옛 키를 지워 타입 오류로 남은 참조(71회 중 해당분)를 모두 고친다 — 조용히 시스템 폰트로 떨어지는 것 방지.
- 폰트: SUIT 정적 웨이트(400·600·800·900)·Unbounded(700)·Recursive(필요 웨이트) TTF를 `apps/native/assets/fonts/`에 두고 **`app.json`의 `expo-font` 플러그인 `fonts` 배열로 빌드에 내장**(D2). 실행 즉시 사용 가능 → 런타임 `useFonts`와 글자 깜빡임(FOUT) 제거, 폰트 로딩 대기 게이트는 두지 않는다(2026-05 mount race 이력). `fontsV2`를 `{ body:'SUIT', title:'SUIT-Black', en:'Unbounded', data:'Recursive' }`로. 기본 Text 폰트는 공용 `<Text>` 래퍼 또는 루트에서 지정(스파이크에서 방식 확정). 이전 폰트 패키지 4종은 7단계에서 제거.
- 워드마크: `Image tintColor`로 아쿠아.
- **토큰 테스트(D6):** `packages/design/src/__tests__/tokens.test.ts` — ① tokens.ts ↔ tokens.css 다크·라이트 값 일치 ② 정해진 글자·배경 쌍 대비(본문 ≥ 4.5, 큰 글자·힌트 ≥ 3.0) ③ 삭제된 `accent*` 키가 CSS에도 없음.
- 검증: 위 테스트, 타입 검사(117곳 치환 누락 0), 시뮬 전 화면 스크린샷(다크), 웹 화면 깨짐 여부만 확인.

### 2. 네이티브 화면 적용 — 다크 (OTA 가능)
- 공용 컴포넌트 먼저: `JellyPressable`(90ms 찌그러짐 → 280ms 스프링, reduced-motion 대응), 칩, 토스트, 버튼.
- 화면: Discover(SwipeCard 하단 그라디언트 청록 잉크, 카드 radius 24, 액션바·칩을 카드 위로), DetailSheet, SearchSheet, Saved, Mix(큐), Profile, 온보딩, 빈·에러·스켈레톤.
- anti-slop 점검: 라임 채움 한 화면 3개 이하, 한글 넓은 자간 없음, 11px 미만 없음.
- 검증: 화면별 시뮬 확인(메모리 규칙: 수정 후 시뮬 검증), Appium 회귀 스펙.

### 3. 라이트 모드 (OTA 가능)
- 스파이크 결과대로 토큰을 다크·라이트 쌍으로. 하드코딩 18곳 정리. `app.json userInterfaceStyle: automatic`은 이미 설정됨. **상태 표시줄(X4):** `apps/native/app/_layout.tsx:179` 의 고정 밝은 글자를 화면 밝기 연동으로 변경.
- 라이트 전용 규칙: 라임은 채움만, 글자는 `limeText`/`aquaText`, `textMuted`는 큰 글자만.
- 검증: 화면별 다크·라이트 쌍 스크린샷, 대비 수치 확인.

### 4. 리퀴드 글래스 + 탭바 (네이티브 빌드 필요)
- `GlassSurface` 컴포넌트: iOS 26 + API 가용 시 `GlassView`, 아니면 불투명 `raised` + 1px `border`. 틴트·테두리 값은 DESIGN.md.
- 적용: 칩, 액션바, 헤더 버튼, 토스트, 반만 열린 시트(끝까지 올리면 `surface`). 카드·본문 금지. 같은 줄은 `GlassContainer` 하나로 묶어 발견 화면 유리 묶음 ≈ 4개 이하(D9).
- 탭바: 스파이크 결정대로. 탭 접근성 라벨(발견/큐/저장/검색)은 유지 — E2E 9개 파일이 참조.
- 검증: iOS 26 시뮬 + iOS 18 시뮬(대체 표현), 투명도 줄이기 설정, TestFlight 실기기.

### 5. 위 스와이프 "관심 없음" + 친구 메모
- 제스처: `index.tsx` Pan에 위 방향 분기(임계 100px, 탭 8px/300ms와 분리, `feedback_pan_gesture_offset_conflict` 주의). 스티커 "관심 없음", 가라앉기 퇴장(흑백 필터 미지원 시 어둡게만), 토스트 "다시 안 보여요 · 되돌리기".
- 저장: `store.ts`에 `hiddenKeys`(`'movie:1396'` 형식, 추가 시각 포함) 추가. **보관 범위는 기기 기준(X3)** — 저장한 작품과 같은 범위, 재설치 시 사라짐. `store.ts:667` '모든 데이터 초기화'가 이 키도 지우게 한다. 계정 동기화는 계정 도입 때. 추천 요청에 **새 필드 `hiddenKeys`**로 보낸다(D4) — 기존 `excludeIds`(숫자, 7일 기록)와 섞지 않아 영화·드라마 같은 id 충돌과 300개 경쟁을 함께 없앤다. 별도 상한(예: 500)을 넘으면 최근 숨김부터. 예전 앱은 필드를 안 보내므로 서버는 없을 때 무시. DetailSheet에 "관심 없음" 버튼(제스처 대체 수단).
- 서버 필터(D7, PR-S로 먼저 배포): `hiddenKeys`는 **카드를 내보내기 직전 한 곳**(스트리밍 emit·비스트리밍 응답 공통 경로)에서 `(type,id)`로 반드시 제외. 후보 단계에서도 미리 빼서 50장 개수를 유지하는 건 보조 최적화.
- **앱 필터(X2):** 서버를 거치지 않는 길 — 추천 실패 시 인기작(`apps/native/lib/api.ts:117` `/api/trending`), 관련작·장르 큐(`apps/native/app/index.tsx:1359` 부근), 이미 받아 둔 카드 — 도 막도록 화면에 카드를 올리는 공통 지점에서 한 번 더 거른다.
- 분석: PostHog `not_interested` 이벤트(신규 키, 기존 키 유지 규칙 준수).
- 친구 메모(D3 규칙 기반 + X5 **앱에서 계산**): `packages/core/src/memo.ts` 의 순수 함수 `friendMemo(rec)` 가 장르·러닝타임·시즌 수·평점·연도로 문구(12~14자 이하, 말투 금지 표현 검사)를 고른다. 카드를 그릴 때 호출 → 서버·API·프롬프트 변경 없음, 모든 카드에 즉시, 웹은 6단계에서 같은 함수 재사용.
- 테스트:
  - 스와이프 판정은 순수 함수로 분리(`apps/native/lib/swipe-classify.ts`) → 단위 테스트: 위·아래·좌·우·탭 경계(99/100px, 8px·300ms, 대각선), 기존 좌·우·아래·탭 동작 **회귀 테스트(필수)**.
  - `hiddenKeys` 저장소: 추가·되돌리기·중복·영구 저장·상한 초과 시 최근 우선(`apps/native/lib/__tests__/hidden-keys.test.ts`).
  - 서버: `hiddenKeys` 검증(형식·잘못된 값 무시·상한), 영화·드라마 같은 id 구분, **경로별 누출 없음**(스트리밍·비스트리밍·콜드스타트·폴백·탐색·phase2) — `apps/web/src/lib/__tests__/hidden-keys-filter.test.ts`.
  - 메모 규칙: 표 기반 단위 테스트(장르·러닝타임·시즌별, 길이 ≤ 14, 금지 표현 없음, 기본값) — `packages/core/src/__tests__/memo.test.ts`.
  - 앱 필터: 인기작 대체 경로·큐·이미 받은 카드에서 숨김 제외 — `apps/native/lib/__tests__/hidden-filter.test.ts`.
  - 초기화: '모든 데이터 초기화' 후 hiddenKeys 비어 있음.
  - E2E(D8) 새 스펙 2개: ① 위로 밀기 → 토스트 → 되돌리기, 상세 시트 버튼으로 숨기기, 새로고침 후 재노출 없음 ② `xcrun simctl ui booted appearance light`로 발견·큐·저장·상세 진입 + 스크린샷. 기존 회귀 스펙(탭 라벨 4종) 통과 필수.

### 6. 웹(PWA) 반영
- `globals.css` 변수 교체는 1단계에서 끝남. 컴포넌트 하드코딩 3파일, `next/font`로 Unbounded·Recursive, SUIT CDN 또는 로컬, 라이트 모드, 위 스와이프·메모. 글래스는 `backdrop-filter` 대신 불투명 대체(DESIGN.md).

### 7. 출시
- 1~3단계는 OTA로 나눠 낼 수 있지만, **4단계(글래스)가 네이티브 빌드라 한 번의 앱 업데이트(1.1.0)로 묶는 것을 권장**(디자인이 반쯤 바뀐 상태가 사용자에게 노출되지 않게).
- App Store 스크린샷 교체. `eas build/submit`, 태그는 사용자가 직접 실행.
- 이전 폰트 패키지 4종·Quiet Ink 잔재 제거.

## 순서와 규모 (CC 기준 대략)
| 단계 | 규모 | 비고 |
|---|---|---|
| 0 스파이크 | 0.5일 | 이후 방식 확정 |
| 1 토큰·폰트 | 0.5~1일 | 가장 넓게 퍼지는 변경 |
| 2 다크 화면 | 1.5~2일 | 화면 9종 + 공용 컴포넌트 |
| 3 라이트 | 1~1.5일 | 스파이크 결과에 따라 크게 달라짐 |
| 4 글래스·탭바 | 1일 | 네이티브 빌드 포함 |
| 5 관심 없음·메모 | 1일 | 서버 프롬프트 변경 포함 |
| 6 웹 | 1~1.5일 | |
| 7 출시 | 0.5일 + 심사 | |

## 위험
- **라이트 모드 비용:** `DynamicColorIOS`가 일부(svg, Reanimated 보간)에서 안 되면 수작업이 늘어난다 → 스파이크로 먼저 확인.
- **탭바:** 시스템 탭바에서 검색 액션(시트)이 안 되면 자체 탭바로 가야 하고, 시스템 유리의 변형 애니메이션은 못 쓴다.
- **E2E:** 탭 구조·접근성 트리가 바뀌면 Appium 스펙이 깨질 수 있다(9파일). 라벨 유지가 원칙.
- **폰트 용량:** SUIT 정적 4웨이트 + Unbounded + Recursive로 앱 크기 증가(수 MB). 웨이트를 필요한 만큼만.
- **Unbounded에는 한글이 없다:** 영문 원제에만. 한글이 섞이면 SUIT로 렌더되게 문자열 단위로 분리.
- **친구 메모 품질:** LLM 한마디가 진부하거나 길 수 있다 → 길이 검증 + 샘플 리뷰, 실패 시 스티커 생략.
- **디자인 혼재 노출:** 단계별 OTA 시 반쯤 바뀐 화면이 보인다 → 출시는 묶는다.

## 확정된 결정 (2026-11-26, 사용자)
1. **웹(PWA)은 네이티브 출시 후 따로.** 6단계는 1.1.0 이후 별도 트랙. 그동안 웹은 공유 CSS 변수만 바뀌므로 1단계에서 웹 화면이 깨지지 않는지 확인만 한다.
2. **출시는 1.1.0 한 번에.** 1~5단계를 모두 끝낸 뒤 한 번의 앱 업데이트. 중간 OTA로 디자인을 내보내지 않는다.
3. **"관심 없음"은 영구.** 300개 상한을 넘으면 최근 숨김부터 서버에 보낸다(오래된 숨김은 드물게 재노출 가능, 감수).
4. ~~친구 메모는 LLM 작성~~ → **엔지니어링 검토(D3)에서 규칙 기반으로 변경.** 50장 중 LLM 이유는 10~20장뿐이고(미리보기 10장·phase2는 템플릿), LLM 출력 증가가 순위 단계를 1.5~3초 늦추기 때문. 모든 카드에 즉시 붙는다.

## NOT in scope (검토에서 명시적으로 미룸)
- 웹(PWA) 화면 반영 — 1.1.0 이후 별도 PR (TODOS.md "Night Pool — 웹(PWA) 반영")
- "관심 없음" 계정 동기화 — 계정 도입 때 (TODOS.md)
- AI 개인화 친구 메모 — 규칙 기반으로 출시, 표본 부족으로 TODO도 남기지 않음 (D3)
- 정보 구조·탭 구성 변경, 로고 마크·앱 아이콘, Android

## What already exists (재사용)
| 기존 코드 | 이 계획에서 |
|---|---|
| `@neq/design` 공유 토큰 (`tokens.ts`·`tokens.css`) | 값 교체 + 다크·라이트 두 벌, 네이티브 변환층은 `apps/native/lib/tokens.ts` |
| `ActionBar` `savePulling`(끌면 1.05배) | 1.14배 + 젤리 프레스로 확장, 새로 만들지 않음 |
| `app.json` `expo-font` 플러그인 | `fonts` 배열만 추가해 빌드 내장 |
| `runtimeVersion: appVersion` | 1.1.0 으로 올리면 옛 앱에 새 JS 미배포 — 묶음 출시와 일치 |
| `lib/store.ts` `addRecHistory`·`getActiveExcludeIds` | 같은 저장 패턴으로 `hiddenKeys` 추가, 7일 기록과는 분리 |
| Appium 회귀 스펙 (탭 라벨 4종 참조) | 라벨 유지, 새 스펙 2개만 추가 |

## Failure modes
| 새 경로 | 현실적 실패 | 테스트 | 처리 | 사용자에게 |
|---|---|---|---|---|
| DynamicColorIOS 변환층 | svg·Reanimated 에서 동적 색 미지원 → 라이트에서 엉뚱한 색 | 0단계 스파이크 + 라이트 E2E 스크린샷 | 안 되는 곳만 `useColorScheme` 스타일 | 보임(검수로 차단) |
| 폰트 빌드 내장 | 파일명·PostScript 이름 불일치로 시스템 폰트 대체 | 옛 키 삭제 타입 검사 + 시뮬 확인 | — | 조용함 → 타입 검사·E2E 스크린샷으로 차단 |
| 위 스와이프 판정 | 대각선 끌기가 저장/숨김으로 오인 | `swipe-classify` 경계 테스트 + 회귀 | 방향 잠금 10px | 되돌리기 토스트로 복구 가능 |
| hiddenKeys 서버 필터 | 특정 경로(폴백 등)에서 누출 | 경로별 누출 테스트 | 내보내기 직전 단일 지점 | — |
| hiddenKeys 앱 필터 | 인기작·큐 경로 누출 | `hidden-filter.test.ts` | 화면 공통 지점 | — |
| 숨김 저장 | 상한 초과로 오래된 숨김 탈락 | 상한 테스트 | 최근 우선 | 드물게 재노출(감수) |
| 글래스 | iOS 26 미만·투명도 줄이기에서 미렌더 | iOS 18 시뮬 수동 + 설정 확인 | 불투명 대체 | 보임 |
| 글래스 성능 | 구형 기기 스와이프 끊김 | 0단계 Instruments 측정 | 칩 줄 불투명 전환 | 보임(측정으로 차단) |
| 친구 메모 | 장르 없는 작품에 어색한 문구 | 기본값 테스트 | 기본 문구 또는 생략 | — |

**Critical gap: 0** (조용히 실패하면서 테스트·처리 모두 없는 경로 없음)

## Worktree 병렬화
| 작업 | 모듈 | 의존 |
|---|---|---|
| PR-S 서버 숨김 | `apps/web/src/app/api/recommend`, `apps/web/src/lib/recommend*` | — |
| 친구 메모 규칙 | `packages/core` | — |
| 0~4단계 디자인 | `packages/design`, `apps/native/{lib,components,app}` | 0 → 1 → 2 → 3 → 4 순차 |
| 5단계 제스처·숨김 앱 쪽 | `apps/native/app/index.tsx`, `apps/native/lib/store.ts` | PR-S 계약, 2단계 |

- Lane A: PR-S (독립, 먼저 main 배포) · Lane B: 메모 규칙 (독립) · Lane C: 0→1→2→3→4→5 (순차, 같은 모듈)
- A·B를 C와 병렬로 시작 → A 병합·배포 → C 5단계에서 B 결과 연결
- 충돌 주의: B와 C 모두 `packages/core` 타입을 건드리면 `Recommendation` 정의에서 충돌 → 메모는 타입을 바꾸지 않는 순수 함수로 유지

## Implementation Tasks
- [ ] **T1 (P1, human: ~4h / CC: ~30min)** — server — PR-S: `hiddenKeys` 검증 + 내보내기 직전 필터 + 경로별 누출 테스트
  - Surfaced by: 구조 D4, 테스트 D7, 교차 X1 — route.ts:75 숫자 전용 excludeIds·영화/드라마 id 충돌
  - Files: `apps/web/src/app/api/recommend/route.ts`, `apps/web/src/lib/recommend.ts`, `apps/web/src/lib/__tests__/hidden-keys-filter.test.ts`
  - Verify: `cd apps/web && npx vitest run` + Preview 에서 hiddenKeys 요청 확인
- [ ] **T2 (P1, human: ~2h / CC: ~15min)** — native — 폰트 빌드 내장 + 옛 폰트 키 삭제
  - Surfaced by: 구조 D2, 교차 X5 — _layout.tsx:105 런타임 로딩·displayItalic 잔여 참조
  - Files: `apps/native/app.json`, `apps/native/assets/fonts/*`, `packages/design/src/tokens.ts`, 폰트 참조 컴포넌트
  - Verify: `tsc` 0 오류, 시뮬 실행 직후 글자 깜빡임 없음
- [ ] **T3 (P1, human: ~1d / CC: ~1h)** — design tokens — `accent*` 삭제·용도별 치환 117곳 + 네이티브 변환층
  - Surfaced by: 코드 품질 D5, 교차 X4
  - Files: `packages/design/src/tokens.ts`, `apps/native/lib/tokens.ts`, 네이티브 컴포넌트 44파일
  - Verify: `tsc` 0 오류, 다크·라이트 스크린샷
- [ ] **T4 (P1, human: ~3h / CC: ~20min)** — design tokens — ts↔css 일치·대비 테스트 + 웹 옛 색 고정
  - Surfaced by: 코드 품질 D6, 교차 X1
  - Files: `packages/design/src/__tests__/tokens.test.ts`, `packages/design/src/tokens-quiet-ink.css`, `apps/web/src/app/globals.css`
  - Verify: 테스트 통과 + 웹 화면 변화 0
- [ ] **T5 (P1, human: ~3h / CC: ~20min)** — native — 앱 쪽 숨김 필터 + 초기화 포함
  - Surfaced by: 교차 X2·X3 — api.ts:117 trending, index.tsx:1359 큐, store.ts:667 초기화
  - Files: `apps/native/lib/store.ts`, 카드 목록 공통 지점, `apps/native/lib/__tests__/hidden-filter.test.ts`
  - Verify: 단위 테스트 + E2E ①
- [ ] **T6 (P1, human: ~1d / CC: ~1.5h)** — native E2E — 새 스펙 2개(숨김 흐름, 라이트 진입)
  - Surfaced by: 테스트 D8
  - Files: `apps/native/e2e/not-interested-*.test.ts`, `apps/native/e2e/light-mode-*.test.ts`
  - Verify: 시뮬에서 통과 + 기존 회귀 스펙 통과
- [ ] **T7 (P2, human: ~4h / CC: ~30min)** — native glass — 줄 단위 GlassContainer + Instruments 60fps 측정
  - Surfaced by: 성능 D9
  - Files: `apps/native/components/GlassSurface.tsx`, Discover 화면
  - Verify: 최소 지원 기기 스와이프 중 60fps
- [ ] **T8 (P2, human: ~1d / CC: ~1h)** — core — `friendMemo()` 규칙 + 표 기반 테스트
  - Surfaced by: 구조 D3, 교차 X5
  - Files: `packages/core/src/memo.ts`, `packages/core/src/__tests__/memo.test.ts`
  - Verify: 테스트 통과, 실제 추천 50장 샘플 길이·문구 검토
- [ ] **T9 (P2, human: ~1h / CC: ~10min)** — native — 상태 표시줄 밝기 연동
  - Surfaced by: 교차 X4 — _layout.tsx:179 고정 밝은 글자
  - Files: `apps/native/app/_layout.tsx`
  - Verify: 라이트 모드 상단 시간·배터리 보임

## GSTACK REVIEW REPORT

| Review | Runs | Status | Findings |
|---|---|---|---|
| Step 0 범위 | 1 | 범위 유지(A) | 8개 파일 초과 — 디자인 교체라 불가피, 라이트 비용은 0단계에서 재판단 |
| 1. 구조 | 1 | 반영 | 3건 (D2 폰트 내장, D3 메모 규칙 기반, D4 hiddenKeys 전용 필드) |
| 2. 코드 품질 | 1 | 반영 | 2건 (D5 accent 이름 삭제, D6 토큰 일치·대비 테스트) |
| 3. 테스트 | 1 | 반영 | 17개 경로 GAP → 전부 계획에 테스트 추가, 회귀 2, E2E 4 (D7 단일 필터 지점, D8 E2E 2개) |
| 4. 성능 | 1 | 반영 | 1건 (D9 글래스 묶음 + 측정) |
| Outside voice | 1 (codex) | 반영 | 6건 → 교차 결정 5건 (X1 배포 분리·웹 고정, X2 앱 필터, X3 기기 기준·초기화, X4 네이티브 변환층·상태표시줄, X5 메모 앱 계산·옛 폰트 키 삭제) |
| TODOS.md | — | 2건 추가 | 웹 반영, 계정 동기화 (AI 메모는 제외) |

- Failure modes: critical gap 0
- Parallelization: 3 lanes (A·B 병렬, C 순차)
- Lake score: 10/11 (X3 은 서버 저장 대신 기기 기준 선택)

**VERDICT:** 계획 확정 — 0단계 스파이크(라이트 변환층·글래스 성능·탭바 4칸) 결과에 따라 3·4단계 세부만 조정. 착수 순서는 PR-S(T1)와 0단계를 병렬로.

NO UNRESOLVED DECISIONS

## 에이전트 결정 기록

2026-11-27 인수 이후 에이전트가 DESIGN.md·이 계획을 기준으로 정한 세부. 한 줄 이유 포함.

| 날짜 | 결정 | 이유 |
|---|---|---|
| 2026-11-27 | 1단계는 OTA 불가로 표기 정정 | 폰트를 `expo-font` 플러그인으로 빌드에 내장(D2) → 네이티브 빌드 필요. 출시는 어차피 1.1.0 한 번(결정 2)이라 일정 영향 없음 |
| 2026-11-27 | 보조 토큰 추가: `borderSubtle` #183539 / 라이트 #CFE3E1, `borderStrong` #335A60 / #98BAB7, `aquaDim`·`aquaBorder`·`limeDim` | 옛 `accent*` 삭제 후 테두리·옅은 채움 용도가 남아 있었음. DESIGN.md 팔레트 사이 값으로 보간 |
| 2026-11-27 | `info` = aqua, `success` = lime, 라이트 scrim = rgba(15,42,47,…) | 상태색을 새 팔레트 밖에서 늘리지 않음. scrim 은 라이트 글자색 기반이라 회색 얼룩 없음 |
| 2026-11-27 | 기본 글꼴은 공용 `components/Text.tsx` 래퍼(39파일 전환) + eslint `no-restricted-imports` 로 RN `Text` 직접 import 차단 | 전역 defaultProps 패치보다 명시적이고, lint 가 누락을 빌드 전에 잡음 |
| 2026-11-27 | motion(jelly·sheet) 은 radius 와 별도 객체로 토큰에 둠 | 2단계 `JellyPressable` 이 바로 가져다 쓰도록. 값은 DESIGN.md 그대로 |
| 2026-11-27 | 토큰 테스트는 web vitest include 에 추가해 실행 | `packages/design` 에 자체 러너가 없음. 새 러너 대신 기존 CI 경로 재사용 |
| 2026-11-27 | Reanimated 색 가드 테스트 `apps/native/lib/__tests__/reanimated-colors.test.ts` 추가 | 0단계에서 `useAnimatedStyle` 동적색이 조용히 사라짐을 확인 → 정적 검사로 재발 차단 |
| 2026-11-27 | 1단계 완료 판정 | tsc 네이티브·웹 0, vitest 네이티브 43/43·웹 611/611, 시뮬(iPhone 17 Pro) 다크·라이트 전환·재실행 크래시 0. 남은 옛 색(온보딩 갈색 글로우·금색 Lottie, 라이트 카드 흐린 글자, 스플래시 #12110E, 상태표시줄 고정)은 2·3단계 범위 |
| 2026-11-27 | 친구 메모(T8) `bininthehood/night-pool-memo`(d7bcec4) 를 이 브랜치에 병합만, 화면 연결은 5단계 | packages/core 순수 함수뿐이라 충돌 없음. 스티커 UI 는 위 스와이프와 같은 단계에서 붙임 |
| 2026-11-27 | `JellyPressable` 은 바깥 `Animated.View`(transform 만) + 안쪽 `Pressable`(style·색) 구조, 바깥 배치는 `containerStyle` | 호출부 StyleSheet 의 DynamicColorIOS 가 Animated.* 정적 style 에 들어가면 크래시(0단계) — 구조로 원천 차단 |
| 2026-11-27 | 젤리 프레스는 햅틱을 울리지 않음 | 기존 onPress 들이 이미 햅틱을 내므로 이중 발화(DESIGN.md 연속 발화 금지) 방지 |
| 2026-11-27 | 공용 `Chip`(알약 32·hitSlop 6=44·선택 라임)·`Button`(primary/secondary/ghost) 신설, 유리 전에는 raised + 1px border | DESIGN.md "iOS 26 미만 대체" 모양과 같아 4단계에서 `GlassSurface` 로 감싸기만 하면 됨 |
| 2026-11-27 | Discover: 헤더(워드마크)는 카드 위에 띄우지 않고, 칩 줄·큐 바·액션바·케밥만 카드 위 오버레이 | 워드마크를 포스터 위에 올리면 대비가 흔들리고 워드마크 여백 규칙을 못 지킴. 계획 2단계 문구("액션바·칩을 카드 위로") 범위 그대로 |
| 2026-11-27 | 카드 위 글자·뱃지는 테마 무관 밝은 값(`palette.dark`) + 청록 잉크 받침 rgba(4,20,24,…) | 포스터 하단 잉크는 라이트에서도 어두움 → 라이트 카드 흐린 글자(1단계 잔여) 중 카드 부분은 여기서 해소 |
| 2026-11-27 | 카드 제목 34 는 `numberOfLines={2}` | DESIGN.md 3xl 그대로 두고 긴 제목이 정보 영역을 밀어 올리지 않게 |
| 2026-11-27 | 저장 버튼 끌기 비례 확대(최대 1.14)는 5단계로 | 위 스와이프와 같은 Pan 수정에서 dragY 를 넘겨야 함. 지금은 기존 1.05 유지 |
| 2026-11-27 | 토스트는 상단 44 로 이동, 유리 전까지 불투명 raised | DESIGN.md States. 하단 토스트가 액션바·탭바와 겹치던 문제도 함께 사라짐 |
| 2026-11-27 | 영문 섹션 접두("Synopsis ·", "Cast ·", "RECENT ·", "Library ·", "Channels ·", "NAME ·", "CURATED · NEQ,")는 한글만 남기고 제거 | DESIGN.md 영문 마케팅 카피 금지 + 한글 uppercase·넓은 자간 금지. 섹션 라벨은 SUIT 600 13 textSecondary 로 통일 |
| 2026-11-27 | 10px 이하 허용은 영문·숫자 전용 Recursive 2곳만(관련작 'POSTER · N/A', 월 스크러버 연도) | anti-slop #8 예외 조건 그대로 |
| 2026-11-27 | 이유 박스(borderLeft 인용)는 raised 면 radius 14 로 | anti-slop #6. Quiet Ink 예외 2 는 Night Pool 에서 폐기 |
| 2026-11-27 | 저장 그리드 비대칭은 "가운데 열 14px 내림"으로 바꾸고 높이 변주(1.6배) 폐기 | DESIGN.md Layout 정의 그대로, 포스터 2:3 유지 |
| 2026-11-27 | 프로필 분포 막대: 1위 아쿠아, 나머지 `borderStrong`/`textMuted` | 금색·보라·코랄 하드코딩은 팔레트 밖 + 막대마다 라임이면 라임 3개 초과 |
| 2026-11-27 | 빈 상태(저장·큐)에 아이콘 48 + "발견하러 가기" secondary CTA 추가 | DESIGN.md States Empty 구조. 라임 아님(주요 CTA 아님) |
| 2026-11-27 | 흡수 Lottie 는 이미지 레이어라 `colorFilters` 불가 → 레이어 PNG 를 sharp 로 아쿠아 재색칠한 다크·라이트 JSON 두 벌, 금색 원본 삭제 | 워드마크 색별 PNG 를 새로 굽지 않는다는 규칙의 취지(형태 동일, 색만)를 지키면서 Lottie 가 tint 를 못 받는 제약 우회 |
| 2026-11-27 | 온보딩 Welcome 세리프 이탤릭 heading PNG → SUIT 900 텍스트, 갈색 vignette·앰버 glow 제거(글로우 대체 없음) | 세리프는 워드마크에만, 워드마크 글로우 금지 |
| 2026-11-27 | 스플래시: 콤마 아쿠아·투명 바탕 + 배경 #071B20 (다크 고정) | 라이트 스플래시는 3단계. ios/ 가 gitignore 라 실제 반영은 prebuild·네이티브 빌드 후 |
| 2026-11-27 | 온보딩 완료 화면 pulse halo 라임 → 아쿠아 | 대기·안내는 아쿠아 역할, 라임은 행동 |
| 2026-11-27 | 2단계 완료 판정 | tsc 네이티브·웹 0, vitest 네이티브 43/43·웹+core+design 694/694, Appium `regression-2026-05-21` 12/12(시뮬 iPhone 17 Pro iOS 26.5), 화면별 다크 스크린샷 확인. 3단계로 넘김: 상태표시줄 밝기 연동, 라이트 스플래시, 라이트 키보드·흐린 글자 점검, 밝은 바탕 라임 테두리(프로필 OTT 선택 링·장르 칩 등 라임 border) |
| 2026-11-27 | 상태표시줄 `style="auto"`(시스템 밝기 연동), 상세 시트는 포스터 히어로 위에서만 `light` 고정(스크롤로 히어로를 지나면 auto) | T9. 라이트에서 상세 히어로(어두운 포스터) 위 시간·배터리가 안 보였음 |
| 2026-11-27 | `textMeta` 토큰 신설(다크 #74918F · 라이트 #4F6D73) — 13px 이하 메타·캡션 63곳을 textMuted → textMeta. textMuted 는 큰 글리프·아이콘·placeholder·비활성 라벨에만 남김 | 라이트 textMuted 3.6 은 큰 글자·힌트 전용 규칙. 다크 textMuted 도 surface 위 4.49 라 다크 값도 아주 조금 밝힘 |
| 2026-11-27 | 라임 테두리: 채움 없는 링(OTT 행 선택, 저장됨 CTA)·작은 체크 원은 `limeText`, 라임 채움 칩·버튼은 테두리도 `lime` | 밝은 바탕 위 라임 선은 1.1:1 로 안 보임. 채움 면은 색상 차로 구분되고 올리브 외곽선은 무거워 보여 제외 |
| 2026-11-27 | 라이트 `aquaText` #007B72 → #00716A, 워드마크는 새 `wordmark` 토큰(#58DCCB / #007B72)으로 분리 | 옅은 아쿠아 면(검색 제안 칩·선택 칩·탭 캡슐) 위 4.1 → 4.6. 워드마크 색은 사용자 결정이라 그대로 고정. DESIGN.md 표·Decisions Log 반영 |
| 2026-11-27 | 어두운 잉크·scrim 위 글자는 `palette.dark` 고정: 저장 그리드 카드 라벨, 상세 히어로 뱃지, 시청 리포트 오버레이, 취향 고르기 포스터 라벨, 튜토리얼 전체 | overlay 토큰은 라이트에서도 어두운 잉크(1단계 결정) → 라이트 글자색이면 어두운 위 어두운 글자 |
| 2026-11-27 | 프로필 분포 막대 1위 `aqua` → `aquaText` | 라이트 흰 트랙 위 aqua 1.6:1, 그래픽 3:1 미달. 다크는 같은 값 |
| 2026-11-27 | 하드코딩 정리: 페르소나 모달 backdrop rgba(0,0,0,.6) → `overlay`, 포스터 라벨 받침 검정 → 청록 잉크. OTT 브랜드색 위 흰 글자·Icons 기본값 '#000'(항상 color 전달)·카드 잉크는 유지 | 테마 무관이 맞는 값만 남김 |
| 2026-11-27 | 라이트 스플래시: `ios.splash` 기본 = 민트 #EAF6F5 + 콤마 #007B72(splash-icon-light.png, 알파 재색칠), `dark` = 기존. 최상위 splash(Android·레거시)는 다크 유지 | ios/ 가 gitignore 라 반영은 prebuild·네이티브 빌드(4단계 빌드에 같이) 후. `expo config` 로 설정 반영만 확인 |
| 2026-11-27 | 라이트 진입 E2E `e2e/light-mode-2026-11-27.test.ts` 추가 + `wdio.conf.ts` 에 `IOS_SIM_UDID`·`IOS_SIM_VERSION` env 덮어쓰기 | T6 ②. 자동 판정은 RedBox·Invalid color 없음 + 탭 라벨 4종, 색은 스크린샷 검수. 부팅 시뮬 udid 가 conf 고정값과 달라 env 로 받음 |
| 2026-11-27 | 3단계 완료 판정 | tsc 네이티브·웹 0, vitest 네이티브 43/43·웹(+core+design) 705/705·core 116/116, Appium `regression-2026-05-21` 12/12 · `light-mode` 2/2(iPhone 17 Pro iOS 26.5). 발견·상세·큐·저장·검색·프로필·온보딩(Welcome·이름·장르·취향) 다크·라이트 스크린샷 확인. 4단계로 넘김: 라이트 유리 틴트(DESIGN.md 라이트 값), 다크 raised 위 작은 글자(textMeta 3.9), 라이트 스플래시 실기기 확인 |
| 2026-11-27 | `GlassSurface` 는 감싸는 컴포넌트가 아니라 누르는 요소 안 첫 자식으로 까는 배경 층(absoluteFill) + `GlassGroup`(GlassContainer) 두 개만 | JellyPressable·Pressable 구조를 그대로 두고 배경만 바꿈. 호출부 변경이 한 줄씩 |
| 2026-11-27 | 유리 판정 = `isLiquidGlassAvailable() && isGlassEffectAPIAvailable()` && 투명도 줄이기 꺼짐. 투명도 줄이기면 대체(불투명 raised + 1px border)로 | DESIGN.md "가용성은 API 로". 시스템 유리의 자동 보정보다 대비가 확실. 구독은 앱 전체 1회(마운트마다 깜빡임 방지) |
| 2026-11-27 | 대체 강제 스위치 `EXPO_PUBLIC_GLASS_FALLBACK=1` | 시뮬 런타임이 iOS 26.x 뿐 — iOS 26 미만 화면을 이 분기로 확인 |
| 2026-11-27 | 유리 조상에 opacity 금지: 토스트 등장은 위에서 미끄러지기(transform)로, 비활성(처음으로·칩·상세 이전/다음)은 아이콘·글자만 흐리게 | 부모 opacity 0 이면 유리가 안 그려짐(DESIGN.md 구현 메모) |
| 2026-11-27 | 유리 면은 그림자 끔(저장 버튼 idle·토스트) | 투명 면 그림자는 매 프레임 오프스크린 렌더 — 스와이프 중 비용 |
| 2026-11-27 | 유리 적용처: 발견 칩 줄·케밥·액션바(저장 idle 포함)·큐 바, 상세 시트 헤더 버튼(히어로 위), 토스트, 저장 화면 작품 시트(반만 여는 시트), 탭바. 발견 헤더 프로필 버튼·필터 드롭다운·필터 시트(78% 목록)·검색 시트(90%)는 불투명 유지 | 발견 유리 묶음 = 칩 줄(또는 큐 바)·케밥·액션바·탭바 4개(D9). 드롭다운은 유리 칩 위에 겹쳐 유리 위 유리. 긴 목록 시트는 본문 규칙 |
| 2026-11-27 | 유리 위 글자: 탭 라벨 11 → 13·비활성도 textPrimary, 칩 쉐브론 textPrimary, 토스트 보조 11 textSecondary → 13 SUIT 600 textPrimary(주 문구 800), 큐 바 카운트 13 textPrimary, 작품 시트 제목·취소 textPrimary | DESIGN.md "유리 위 글자: text 색, 13 이상, 600 이상" |
| 2026-11-27 | 탭바 = 기존 JS `Tabs` + `tabBarBackground` 유리, absolute 떠 있는 알약(높이 64, 좌우 16, 아래 = 안전영역−10). 화면들은 `lib/tab-bar` `TAB_BAR_SPACE` 만큼 비킴(발견 카드 정보·액션바, 큐·저장·프로필 스크롤 끝) | 검색 tabPress preventDefault·탭 라벨 4종·lazy 설정을 그대로 유지. 카드가 탭바 뒤까지 내려가 "카드 위 유리"(DESIGN.md Layout) |
| 2026-11-27 | `TAB_BAR_SPACE` 는 `initialWindowMetrics` 로 시작 시 고정 | 세로 고정 앱. StyleSheet 상수로 쓸 수 있어 카드·스켈레톤 수정이 상수 하나 |
| 2026-11-27 | 라이트 유리 틴트 `rgba(234,246,245,0.92)` (DESIGN.md 값 흰색 0.55 에서 변경), 테두리는 그대로. 토큰 `glassTint`·`glassBorder` 신설(ts·css) | 흰색 0.55·민트 0.80 은 어두운 포스터 위에서 회색으로 탁해짐(3단계 이관 건, 시뮬 스크린샷 비교). 민트 0.92 는 검은 포스터 위에서도 민트 유지 |
| 2026-11-27 | 다크 `textMeta` #74918F → #82A09E (raised 3.9 → 4.7, bg 6.3, surface 5.7). 토큰 테스트에 raised 쌍 추가 | 3단계 이관 건. textSecondary(#A9C2C0)보다는 낮게 유지해 위계 보존 |
| 2026-11-27 | app.json `version` 1.0.4 → 1.1.0 (buildNumber 48 유지 — production 프로필 autoIncrement) | 계획 결정 2(1.1.0 묶음). runtimeVersion appVersion → 1.1.0 이라 main 의 1.0.4 OTA 가 이 빌드에 섞이지 않음 |
| 2026-11-27 | 4단계 완료 판정 | tsc 네이티브·웹 0, vitest 네이티브 43/43·웹(+core+design) 705/705·core 116/116, Appium `regression-2026-05-21` 12/12 · `light-mode` 2/2 (iPhone 17 Pro iOS 26.5, 새 dev 빌드). 발견·큐 덱·상세·큐·저장(+작품 시트)·검색·프로필·토스트 다크·라이트, 대체 표현(강제 분기) 다크·라이트, 투명도 줄이기 on → 대체/off → 유리 확인. 5단계로 넘김: 저장 버튼 끌기 1.14배, 위 스와이프·스티커 |
| 2026-11-27 | 위 스와이프 임계 100px(튕김은 800px/s + 60px), 좌·아래는 기존 70px 유지, 우는 진행률 0.3 유지 | 계획 5단계 "위 100". DESIGN.md 터치 임계(수평 80·세로 100)와 다르지만 좌·아래를 바꾸면 기존 회귀 스펙·손에 익은 감도가 바뀜. 숨기기는 되돌릴 수 있어도 저장보다 보수적으로 |
| 2026-11-27 | 방향 잠금 = 처음 10px 움직인 축 고정(`lib/swipe-classify.ts` `lockAxis`), 10px 전에 끝나면 큰 축(동률 세로 — 기존 규칙) | DESIGN.md "방향 잠금: 첫 10px". 매 프레임 큰 축 판정은 대각선 끌기가 끝에서 저장/숨김으로 바뀌는 오인 경로(계획 Failure modes) |
| 2026-11-27 | 판정을 순수 함수 `classifySwipe` 로 옮기고 index.tsx 는 결과(next/prev/save/hide/none)만 분기. 경계·회귀 테스트 `swipe-classify.test.ts` 13개 | 계획 5단계 테스트 항목. 99/100·70/71·30px 튕김·대각선·탭 크기 경계 |
| 2026-11-27 | 위로 끄는 동안 카드는 올라가지 않고 최대 0.95 로 줄어듦 + 스티커. 판정 후 220ms ease-in 으로 0.6·어둡게(#041418 0.7)·끝 40% 에서 사라짐, 아래로 40px 가라앉음 | 카드를 올리면 카드 위 친구 메모가 고정된 케밥 밑으로 들어감(시뮬 확인). RN 에 흑백 필터가 없어 계획대로 어둡게만 |
| 2026-11-27 | 아래 끌기 "찜!" 라임 스티커도 함께 붙임 (위 "관심 없음" 청록 반투명 + 아쿠아 테두리), 둘 다 -6°·0.6→1.1·reduced-motion 이면 스케일 없음, VoiceOver 에서 숨김 | DESIGN.md Motion 이 두 스티커를 한 규칙으로 정의. 같은 컴포넌트라 추가 비용 0. 라임 3개 규칙의 "드래그 중 스티커" 예외 |
| 2026-11-27 | 숨김 필터는 덱 파생 한 곳(`filteredRecs` = 별점 필터 뒤 `filterHidden`, 큐는 `filterHidden(mixDeck)`). 현재 카드를 숨기면 같은 topIdx 에 다음 카드가 와서 따로 넘기지 않음 | 계획 X2 "화면에 카드를 올리는 공통 지점". 인기작 대체(`/api/trending`)·관련작·장르 큐·이미 받은 카드·prefetch 모두 이 파생값을 지남. 숨김 0개면 같은 배열 반환 |
| 2026-11-27 | 되돌리기 = 키 제거 + 그 카드를 다시 맨 위(topIdx 재설정), 토스트 "되돌렸어요" | 3초 안에 다른 카드를 넘겼어도 되돌린 작품이 바로 보여야 "되돌리기" 의미가 맞음. DESIGN.md 마이크로카피 |
| 2026-11-27 | `hiddenKeys` 저장: AsyncStorage `neq_hidden_keys`, `{key, hiddenAt}` 최근 순 500개, 중복은 앞으로, 발견 화면 포커스마다 다시 읽음 | 서버 PR #55 `HIDDEN_KEYS_MAX=500`·"앞에서부터" 와 같게. 포커스 재읽기로 프로필 '모든 데이터 초기화' 직후에도 덱이 맞음 |
| 2026-11-27 | 추천 요청 3곳(스트리밍·비스트리밍 폴백·prefetch)에 `hiddenKeys` 추가, `@neq/core` `RecommendRequest.hiddenKeys?: string[]` | 서버 미배포 동안은 필드가 무시되고 앱 필터가 거름. 웹은 아직 안 보냄(6단계) — 타입만 선택 필드라 웹 영향 없음 |
| 2026-11-27 | 상세 시트 "관심 없음" = 하단 CTA 줄 저장 옆 중성 알약(raised + border, SUIT 600 15), 발견 화면만(`onHide` 지정 시), 누르면 시트 닫고 같은 토스트 | DESIGN.md 접근성 "상세 시트에 관심 없음 버튼". 치우는 동작이라 라임·아쿠아 안 씀. 저장 화면 시트에선 저장한 작품을 숨길 이유가 약해 미노출 |
| 2026-11-27 | 숨기기 햅틱 rigid 1회 | DESIGN.md "스와이프 임계 통과 rigid" |
| 2026-11-27 | 저장 버튼 끌기 확대 = dragY 0→100px 비례 최대 1.14배를 worklet 에서 직접, 저장 직후 번쩍 1.15 는 그대로 | DESIGN.md Motion. 기존 1.05 boolean 은 임계 통과 순간에만 바뀌어 "비례" 가 아니었음 |
| 2026-11-27 | 친구 메모 스티커: 카드 우상단 중 케밥(top 60, 44) 바로 아래 top 118·right 16, 라임 채움·SUIT 800 12·-6°·radius 12, `friendMemo()` null 이면 생략, 정보 숨김(몰입) 모드에선 같이 숨김 | 카드 맨 위 오른쪽은 칩 줄·케밥 자리. 테마 무관(포스터 위) 라임/어두운 글자 고정 |
| 2026-11-27 | 분석: `not_interested` {tmdb_id, media_type, title, source: swipe_up·detail_button, action: hide·undo}. 기존 `card_swiped` 에 direction 'up' 값 추가(키 그대로), 옛 `card_not_interested` 이름은 손대지 않음 | 숨기기와 되돌리기를 한 이벤트로 — 순 숨김 = hide − undo. 기존 이름·속성 변경 금지 규칙 |
| 2026-11-27 | 네이티브 `saved_viewed` {saved_count, has_saved_items} — 저장 탭 포커스마다 1회 | 웹 saved/page.tsx 는 페이지 진입마다 1회. 네이티브 탭은 미리 마운트돼 있어 포커스가 "여는 순간" |
| 2026-11-27 | 네이티브 `card_viewed` (웹과 같은 속성 tmdb_id·title·source·stack_index·total_loaded·providers_count·saved), (tmdbId, 위치) 바뀔 때 1회, 큐 덱은 source 'mix_deck' | PostHog 확인: 네이티브 전 기간 0건 → 주지표(첫 세션 저장률) 분모. 웹과 같은 중복 방지 키 |
| 2026-11-27 | 모든 이벤트에 `$app_version`·`$app_build` — PostHog `customAppProperties` 로 `Constants.expoConfig` 의 version·ios.buildNumber 보강 | SDK 는 expo-application(네이티브 모듈, 미설치)이 있을 때만 채움. EAS production autoIncrement + appVersionSource local 이라 빌드에 내장되는 app.json 값 = 실제 빌드 번호 |
| 2026-11-27 | 내부 표시 = 슈퍼 속성 `is_internal_build: true` (`register`), dev 빌드(`__DEV__`)만. 스토어 빌드는 미설정 | 네이티브 익명 사용자는 사람 프로필이 없어 사람 속성이 저장 안 됨(코디네이터 확인). **TestFlight 는 표시 못 함**: TestFlight 와 스토어가 같은 production 바이너리라 빌드 env 로 못 가르고, JS 로는 판별 API 가 없음. 방법이 필요하면 ① 로컬 Expo 모듈(Swift ~15줄)로 `Bundle.main.appStoreReceiptURL.lastPathComponent == "sandboxReceipt"` 확인 — 네이티브 코드 추가·새 빌드, iOS 18 에서 API deprecated 지만 동작 ② PostHog 에서 제임스 기기 distinct_id 로 거르기. 지금은 미적용 |
| 2026-11-27 | `first_open` {platform} — 설치 후 첫 실행 1회(AsyncStorage `neq_first_open_tracked`, 데이터 초기화에도 유지). 1.1.0 으로 업데이트한 기존 사용자(온보딩 완료 또는 저장 있음)는 보내지 않음. `captureAppLifecycleEvents` 는 안 켬 | SDK "Application Installed" 는 이전 버전에서 lifecycle 기록이 없던 기존 사용자도 설치로 셈 → 업데이트 첫날 신규가 부풀려짐. `app_open` 과 이름이 겹치지 않는 별도 이벤트. 한계: 온보딩 전 이탈했던 기존 사용자는 신규로 셈 |
| 2026-11-27 | `save_failed` {reason: storage_write, error_name, tmdb_id} — `toggleSaved` 쓰기 실패 한 곳(발견·상세 공통 경로). 발견은 오류 토스트 "저장하지 못했어요" 후 카드 제자리, `card_saved` 는 저장 성공 뒤에 발사하도록 순서만 바꿈 | 읽기 실패는 safeGet 이 빈 값으로 삼켜 실패 지점이 쓰기뿐. 예전엔 쓰기가 실패해도 card_saved 가 먼저 나가 저장률이 부풀 수 있었음(이름·속성은 그대로) |
| 2026-11-27 | 세션 리플레이 켬: `posthog-react-native-session-replay` 1.6.0(PostHog iOS 3.58.3, peer react·react-native *, iOS 13+ — SDK 54/RN 0.81 pod install·Release 빌드 확인). `maskAllTextInputs`·`maskAllImages`·`maskAllSandboxedViews` true(기본값 명시), `captureLog` false, `captureNetworkTelemetry` true, `throttleDelayMs` 1000(기본), `sampleRate` = `EXPO_PUBLIC_POSTHOG_REPLAY_SAMPLE_RATE`, 기본 스토어·TestFlight 1.0 / dev 0 | 실트래픽 일 1~3 명(표본 하한 메모리)이라 샘플을 버리면 볼 세션이 없음. 트래픽이 늘면 env 로 낮춤(코드 변경 없이 새 빌드). 콘솔 로그는 dev 에서 작품 제목 등 track 페이로드가 찍혀 끔. dev 0 은 시뮬 기록이 섞이지 않게. PostHog 프로젝트 스위치는 안 건드림 |
| 2026-11-27 | 성능: 튜토리얼 밖에서는 `isDragging` state 를 안 바꿈(터치 시작·끝마다 발견 화면 전체 재렌더 2회 제거), SwipeCard `CardInner` memo, 다음에 쌓일 카드(top+3~+5) 포스터 메모리 prefetch | 결과·원인 분석은 아래 "5단계 결과" |
| 2026-11-27 | 5단계 완료 판정 | 아래 "5단계 결과". 계측 추가(card_viewed·saved_viewed·not_interested·first_open·save_failed·앱 버전·is_internal_build·세션 리플레이)는 코디네이터 요청 반영. 남은 것: PR #55 배포, 실기기 끊김 확인, TestFlight 내부 표시 방법 결정 |
| 2026-11-27 | (1.1.0(49) 피드백) 유리 평평함 원인 = 틴트. EAS 이미지는 원인 아님 — `eas.json` 에 `ios.image` 추가 안 함 | 빌드 49 로그(`eas build:view` → 로그 파일): `macos-sequoia-15.6-xcode-26.0`, Xcode 26.0 (17A324), iPhoneOS26.0.sdk. EAS 문서도 SDK 54 기본(`sdk-54`/`auto`) = Xcode 26.0. 유리는 켜져 있었고 다크 0.40·라이트 0.92 틴트가 굴절을 덮어 불투명 면처럼 보였음 |
| 2026-11-27 | 유리 틴트 다크 0.40→0.15·테두리 0.18→0.24, 라이트 0.92→0.80 (ts·css·DESIGN.md) | 시뮬 비교: 다크 0.15 에서 뒤 포스터 색·글자가 굴절돼 비침, 칩 글자 대비 유지. 라이트 0.60 은 어두운 포스터 위 회색, 0.80 은 민트 유지 + 굴절·림 보임 |
| 2026-11-27 | PostHog 슈퍼 속성 `glass_available`(isLiquidGlassAvailable 원값) + `reduce_transparency`, iOS 매 실행 `register` | 다음 빌드에서 실제로 켜졌는지·투명도 줄이기로 대체 면인지 이벤트로 확인. 슈퍼 속성이라 OS 업데이트·설정 변경도 따라감 |
| 2026-11-27 | 탭 아이콘 정렬: 탭 버튼 `flex 1 + alignSelf stretch + padding 0 + 가운데`, `tabBarIconStyle` 100% | 원인: 라이브러리 기본 버튼(justifyContent flex-start·padding 5·31×28 아이콘 틀)에 48pt 아이콘+라벨이 넘쳐 위로 붙음. 부수 발견: 버튼 너비가 42pt(슬롯 93)뿐이었음 → 터치 영역도 슬롯 전체로. alignSelf 를 빼면 너비 0 → XCUITest 트리에서 탭이 사라짐(E2E 로 확인) |
| 2026-11-27 | 탭 구조: 4번째 슬롯 = 프로필(라벨 '프로필', lazy 기본), 검색 = 각 화면(발견·큐·저장·프로필) 헤더 우상단 '검색 열기' 버튼이 자기 SearchSheet 를 직접 엶. `app/search.tsx`·`lib/search-trigger.ts` 삭제, `search_opened` 는 각 버튼에서 | 제임스 요청(f2f60b7 의 반대). 탭 가로채기가 없어져 트리거 모듈이 필요 없음. 프로필 헤더의 '닫기'는 탭이 됐으니 검색으로. 웹(PWA)은 6단계 범위라 미변경 |
| 2026-11-27 | E2E: `tapTab('검색')` → `tapTab('검색 열기')`(regression·extended), light-mode 는 `tapTab('프로필')`, 탭 라벨 4종 검사 = 발견·큐·저장·프로필 | `tapByLabel('프로필')` 을 쓰는 나머지 스펙은 탭 접근성 라벨이 같아 그대로 동작 |
| 2026-11-27 | 카드 유리 = 정적 "유리 테두리"(림 1.5 + 안쪽 잉크 1 + 위 72px 반사광), `CardInner` 안(이전 카드 오버레이와 동일), 테마 무관. DESIGN.md anti-slop #12 를 "포스터 면" 금지로 좁힘 | 제임스 요청 "카드가 평면". 움직이는 카드 위 `GlassView` 는 매 프레임 뒤를 다시 샘플링하고 2026-06 깜빡임 이력 → 포스터를 덮지 않는 가장 가벼운 방식부터. 프레임 전후 같음(아래 결과) |

### 4단계 결과 (2026-11-27, iPhone 17 Pro 시뮬 · iOS 26.5)

**시뮬 프레임 (카드 좌 스와이프 15회, Reanimated `useFrameCallback` UI 스레드, 임시 계측 — 커밋 안 함)**
| 조건 | 평균 | 최악 프레임 | 25ms 초과 프레임 |
|---|---|---|---|
| 유리 켬 | 60fps | 50ms | 22 |
| 대체(불투명) | 60fps | 74ms | 21 |
- 유리 유무 차이 없음. 25ms 초과는 스와이프 1회당 ~1.4개로 두 조건 같음 → 카드 교체(JS·이미지) 시점 비용이지 유리 비용 아님. 시뮬은 Mac GPU 라 실기기 GPU 부하를 대표하지 않는다 → TestFlight 실기기에서 재측정.

### 5단계 결과 (2026-11-27, iPhone 17 Pro 시뮬 · iOS 26.5)

**검증:** tsc 네이티브·웹 0 · vitest 네이티브 67/67(새 24개: swipe-classify 13 · hidden-keys 6 · hidden-filter 5)·웹(+core+design) 705/705·core 116/116 · eslint 오류 0(경고 33 = 변경 전과 같음) · Appium `regression-2026-05-21` 12/12 · `light-mode` 2/2 · 새 `not-interested-2026-11-27` 2/2 (탭 라벨 4종 유지 포함). 발견(친구 메모·찜!/관심 없음 스티커·저장 버튼 1.14배)·상세("관심 없음" 버튼)·토스트 다크·라이트 스크린샷 확인.

**카드 교체 프레임 — 측정 방법을 바꿈.** 4단계 수치(스와이프당 ~1.4)는 Appium 드래그로 쟀는데, 카드가 안 바뀌는 40px 짧은 끌기도 제스처당 1.67개가 나왔다(JS 지연 0) → XCTest 터치 주입이 시뮬 메인 스레드를 멈추는 계측 오염. 그래서 앱 안에서 좌 스와이프를 프로그램으로 15회 발생시키고 그동안 XCTest 호출 없이 `useFrameCallback`(UI)·rAF(JS) 간격을 쟀다 (임시 계측, 커밋 안 함).

| 빌드 | 조건 | UI 25ms 초과 / 15회 | UI 최악 | JS 25ms 초과 / 15회 | JS 최악 |
|---|---|---|---|---|---|
| Debug (Metro) | HEAD 38de155 (Appium 드래그) | 34~39 | 89ms | 56~57 | 193ms |
| Debug (Metro) | 5단계 + isDragging 수정 (Appium 드래그) | 36~42 | 96ms | 40~42 | 140ms |
| Debug (Metro) | 5단계 최종 (앱 안 스와이프) | 22~26 | 44~77ms | 36~47 | 89~100ms |
| Release | 5단계, 리플레이 끔 | 24 · 24 | 53~72ms | 31~39 | 40~51ms |
| Release | 5단계, 리플레이 켬(샘플 1.0) | 21 · 22 | 67~71ms | 36~44 | 53~84ms |

- **원인 위치:** UI 프레임 지연은 모두 스와이프 시작 후 420~520ms — 좌 스와이프 퇴장 애니메이션(300ms)이 끝나고 360ms 에 오는 덱 전진 commit 직후다. 발견 화면 전체(index.tsx ~2,500줄) 재렌더가 Release 에서도 JS 40~50ms 이고, 그 commit 이 UI 스레드에 반영될 때 1~2프레임이 밀린다.
- **원인 아님(실험으로 배제):** 3번째 카드 마운트(덱 2장으로 줄여도 같음), 카드 그림자(`shadowsNative.lg` 제거해도 같음), 유리(4단계), 닫힌 상세 시트 재렌더(rec 를 null 로 줘도 같음), 세션 리플레이(위 표).
- **넣은 것:** 튜토리얼 밖 `isDragging` state 토글 제거 → 터치마다 화면 전체 재렌더 2회 제거(Debug JS 지연 56 → 41), `CardInner` memo, 다음 카드 포스터 prefetch(시뮬은 네트워크가 빨라 수치 변화 없음 — 실기기 셀룰러에서 팝인 방지용).
- **체감 영향:** 밀리는 프레임이 퇴장 애니메이션이 끝난 뒤라 한 장씩 넘길 땐 화면에 움직이는 것이 없다. 보일 수 있는 경우는 360ms 직후 바로 다음 카드를 끌기 시작할 때뿐(그 전 끌기는 연속 스와이프 가드가 막음).
- **더 줄이려면 (구조 변경이라 이번엔 안 함):** ① 덱 전진을 발견 화면 state 에서 떼어 덱 전용 컴포넌트(카드 스택 + 액션바)로 분리 — 전진 commit 이 화면 전체가 아니라 스택만 다시 그림. 가장 효과 클 것으로 봄, 반나절~1일 + 제스처 회귀 위험 ② 전진 commit 을 퇴장 애니메이션 중간이 아니라 지금처럼 뒤에 두되 `startTransition` 으로 낮은 우선순위 렌더 — 작은 변경이지만 Fabric 에서 UI 반영 프레임이 줄어드는지는 미검증 ③ 실기기 Instruments 로 먼저 확인 — 시뮬 xctrace Time Profiler 는 이번에 기록 후 처리 단계에서 멈춰 결과를 못 얻음.
- **앱 크기:** 세션 리플레이는 PostHog iOS 3.58.3 정적 링크(시뮬 `libPostHog.a` 32MB 는 심볼 포함이라 대표값 아님). 실제 증가분은 이번에 못 쟀다 → EAS 빌드 후 App Store Connect "앱 크기"를 1.0.4 와 비교.

### 1.1.0(49) 실기기 피드백 반영 (2026-11-27, iPhone 17 Pro 시뮬 · iOS 26.5)

피드백(iPhone 15 Plus): ① 탭바 아이콘 중심 ② 카드도 유리 느낌 ③ 검색↔프로필 위치 교체 ④ 유리가 평평함. 결정은 위 결정 기록.

**카드 유리 테두리 프레임 (Debug·Metro, 앱 안 좌 스와이프 15회, UI `useFrameCallback`·JS rAF, 임시 계측 — 커밋 안 함)**
| 조건 | UI 25ms 초과 / 15회 | UI 최악 | JS 25ms 초과 / 15회 |
|---|---|---|---|
| 전 (틴트 변경만) | 23 · 29 | 85 · 44ms | 35 · 39 |
| 후 (카드 유리 테두리) | 25 · 24 · 22 | 87 · 87 · 80ms | 41 · 43 · 39 |
- 늘지 않음(5단계 Debug 22~26 과 같은 범위). 최악 80~87ms 는 전에도 있던 덱 전진 commit(5단계 원인 분석).

**검증:** tsc 네이티브·웹 0 · vitest 네이티브 67/67 · 웹(+core+design) 705/705 · eslint 오류 0 · Appium `regression-2026-05-21` 12/12 · `light-mode` 2/2 · `not-interested` 2/2 · `extended-2026-05-21` 9/9. 발견·상세·큐·저장·검색·프로필 다크·라이트 스크린샷.

**다음 빌드에서 확인:** PostHog 에서 1.1.0 새 빌드 이벤트의 `glass_available`·`reduce_transparency`. `glass_available=false` 면 기기 OS 가 iOS 26 미만이거나 런타임 판정 실패, `reduce_transparency=true` 면 의도된 불투명 대체.

**실기기 테스트 준비 (제임스 실행 — 에이전트는 실행하지 않음)**
- 버전: `app.json` 1.1.0 / runtimeVersion(appVersion) 1.1.0 / buildNumber 48 → production autoIncrement 로 49. `eas.json` `appVersionSource: local`.
- 빌드에 들어가는 네이티브 변경: `expo-glass-effect` 0.1.10, 폰트 내장(SUIT·Unbounded·Recursive, expo-font 플러그인), 라이트·다크 스플래시, **`posthog-react-native-session-replay` 1.6.0(5단계)**. 전부 OTA 불가 → 새 빌드 필수.
- 확인 완료(2026-11-27): EAS SDK 54 기본 이미지 = `macos-sequoia-15.6-xcode-26.0`(빌드 49 로그) → `ios.image` 지정 불필요.
- EAS production 환경 변수: `EXPO_PUBLIC_POSTHOG_KEY`·`EXPO_PUBLIC_POSTHOG_HOST` 는 기존 그대로. 리플레이 샘플링을 바꾸려면 `EXPO_PUBLIC_POSTHOG_REPLAY_SAMPLE_RATE`(0~1, 미설정 = 1.0). 리플레이가 실제로 쌓이려면 PostHog 프로젝트 설정의 모바일 리플레이도 켜져 있어야 함(웹과 공용 스위치 — 에이전트는 안 건드림).
- 명령 (apps/native 에서):
  - `eas build --platform ios --profile production`
  - `eas submit --platform ios --profile production --latest` → TestFlight
- 실기기 체크리스트:
  1. 발견 카드 스와이프 중 끊김 없음 (iPhone 15 Plus, Instruments Animation Hitches 또는 체감) — 특히 한 장 넘긴 직후 바로 다음 카드를 끌 때. 미달 시 위 "더 줄이려면" ①
  2. 위로 밀기(100px) → 카드가 작아지며 어둡게 가라앉음 → 상단 토스트 "다시 안 보여요 · 되돌리기" → 되돌리기 누르면 그 카드가 다시 맨 위 + "되돌렸어요"
  3. 끄는 동안 스티커: 아래 "찜!"(라임)·위 "관심 없음"(청록), 저장 버튼이 끄는 만큼 커짐(최대 1.14), 대각선으로 끌 때 처음 방향으로 고정
  4. 상세 시트 하단 "관심 없음" → 시트 닫히고 같은 토스트, 앱 재시작·새 추천 뒤에도 그 작품이 다시 안 나옴
  5. 친구 메모 스티커(카드 우상단 케밥 아래)가 포스터 위에서 읽히는지, 메모 없는 작품은 스티커 없음
  6. 라이트·다크 스플래시 → 첫 화면 이음매(콤마 색·바탕색)
  7. 폰트 즉시 적용(깜빡임 없음), SUIT·Unbounded·Recursive
  8. 유리: 라이트 틴트가 어두운 포스터 위에서 회색으로 탁해지지 않는지, 다크 대비
  9. 설정 > 손쉬운 사용 > 투명도 줄이기 켜고 앱 → 불투명 대체
  10. iOS 26 미만 기기가 있으면 대체 표현 확인 (최소 지원 iOS 15.1 — 없으면 시뮬 강제 분기 결과로 갈음)
  11. 탭바: 검색 탭 = 시트 열기, 탭 전환, 프로필·저장·큐 스크롤 끝이 탭바에 가리지 않음, 홈 인디케이터와 간격
  12. 토스트(첫 카드에서 우 스와이프 "첫 번째 작품이에요")가 위에서 내려오고 유리로 보임
  13. PostHog: TestFlight 기기 이벤트에 `$app_version` 1.1.0 · `$app_build` 49, `card_viewed`·`saved_viewed`·`not_interested`·`first_open`(새로 설치한 경우) 도착, 세션 리플레이에서 포스터·입력이 가려져 보이는지. TestFlight 이벤트는 `is_internal_build` 가 안 붙으므로(결정 기록) 제임스 기기 distinct_id 로 거를 것
- 주의: 서버 PR #55(hiddenKeys)는 아직 main 미배포 — 앱 필터만으로 숨김이 동작하지만, 숨긴 작품이 서버 응답에 섞여 한 배치의 카드 수가 줄 수 있다. 심사 제출용 빌드는 PR #55 배포 뒤.

# Night Pool 리디자인 구현 계획

작성 2026-11-26 · 기준 문서 [DESIGN.md](../../DESIGN.md) · 브랜치 `design/night-pool`
상태: **계획 확정(엔지니어링 검토 완료) · 0단계 완료** · PR-S(T1) 브랜치 `fix/hidden-keys` 준비됨

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

### 1. 토큰·폰트 기반 (OTA 가능)
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

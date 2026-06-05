---
name: mobile-qa
description: "neq native (Expo RN) 시뮬레이터/에뮬레이터 QA. iOS Simulator 우선 + Android Emulator 보조. 시뮬 부팅 → dev client (com.neq.app) 부착 → Appium 자동 회귀 (9 spec / 46 케이스) → 수동 탐색 → 리포트. 'QA', '시뮬레이터 QA', '에뮬레이터 QA', 'Native QA', '회귀 돌려줘', 'E2E 실행', '시뮬 띄워줘' 요청 시 사용. PWA QA 는 본 스킬 대상 아님 (ux-review / qa 사용). 실기기/TestFlight 는 testflight-qa 사용."
---

# Mobile QA — neq Native Simulator 검증

`apps/native` (Expo RN) 앱을 **시뮬레이터/에뮬레이터에서 실행해 회귀·탐색**하는 워크플로입니다. iOS Simulator 가 정본이고, Android Emulator 는 플랫폼별 회귀 스폿 체크용 보조 트랙입니다.

## 책임 경계

| 영역 | 스킬 | 비고 |
|------|------|------|
| **Native 시뮬레이터 / 에뮬레이터** | **`mobile-qa`** | 본 스킬 — dev client (`com.neq.app`) on Simulator |
| TestFlight 실기기 회귀 + 출시 게이트 | `testflight-qa` | EAS Build 이후 단계 |
| PWA (`apps/web`) 기능 / 빌드 / 시각 검증 | `ux-review`, `qa` | 본 스킬 대상 아님 |
| SwiftUI 네이티브 (gstack 계열) | `ios-qa` | neq 와 무관 |

`qa-tester` 에이전트가 호출합니다. PWA 검증 요청이 들어오면 본 스킬 대신 `ux-review` / `qa` 로 라우팅하세요.

## 언제 사용하나요?

- 새 native 기능/버그 fix 를 시뮬레이터에서 빠르게 확인하고 싶을 때
- `apps/native/e2e/` 회귀 spec 9종을 한꺼번에 돌릴 때
- TestFlight 빌드 올리기 전 sanity check
- PWA ↔ Native 정합성 회귀 추적 (예: `project_native_parity_gaps`)
- A2 React mount race 등 시뮬레이터-only 회귀 패턴 재현

## 전제 조건

진입 전 다음이 확보돼야 합니다. 깨졌다면 진단부터 보고하고 자동 회귀는 BLOCKED 처리:

- macOS + Xcode (Simulator.app, `xcrun simctl`)
- (선택) Android Studio + Android SDK platform-tools (`adb`, `emulator`)
- `appium`, `appium-xcuitest-driver` 설치 (`apps/native/package.json` devDeps)
- Expo Go iOS 빌드 — App Store 에서 시뮬레이터에 설치
- `apps/native` 의 `npm install` 완료

## 워크플로 (6 Phase)

### Phase 0 — 컨텍스트 + 환경 점검

1. `_workspace/` 에 이전 mobile-qa 리포트가 있는지 확인 → 같은 범위면 부분 재실행
2. 환경 점검 (실패 시 BLOCKED 표기):
   - `xcrun simctl list devices booted` — 시뮬레이터 부팅 가능 여부
   - `lsof -ti:4723` — Appium 포트 점유 확인
   - `apps/native/wdio.conf.ts` 의 `udid='4EDF2CB4-81BE-41B2-9D5C-AEB1DDE14E29'` (iPhone 17 Pro / iOS 26.4) 가 로컬에 존재하는지: `xcrun simctl list devices | grep <udid>`
   - **dev client 빌드 존재 여부**: `xcrun simctl get_app_container booted com.neq.app 2>/dev/null` — 비어있으면 Phase 2 에서 `npx expo run:ios` 1회 빌드 필요
3. 환경 분기:
   - 자동 회귀만: Phase 2 → 3 → 6
   - 수동 탐색만: Phase 2 → 4 → 6
   - 풀 회귀: Phase 1 → 2 → 3 → 4 → (Android 필요시 5) → 6

### Phase 1 — 빌드 매니페스트 정합성 (간단)

시뮬레이터 회귀에서도 매니페스트 drift 가 있으면 결과 해석이 흐려집니다. 빠르게 비교:

| 항목 | 출처 | 검증 |
|------|------|------|
| bundleId (default — simulator-devclient) | `wdio.conf.ts` bundleId | `com.neq.app` |
| bundleId (legacy — expo-go) | `wdio.conf.ts` bundleId (E2E_TARGET=expo-go) | `host.exp.Exponent` |
| bundleId (standalone) | `app.json` ios.bundleIdentifier | `com.neq.app` |
| version | `app.json` expo.version | 의도한 marketing version |
| associatedDomains | `app.json` ios | `applinks:neq.me` — 실기기 전용 (시뮬 SKIP) |

**중요 (2026-06-02~):** `b1b0d5a` (Welcome 4차 라운드) 가 `lottie-react-native` 네이티브 모듈을 추가하면서 Expo Go 로는 Welcome 화면이 깨집니다. **default 트랙은 `simulator-devclient` (`com.neq.app` 시뮬 빌드)** 입니다. `expo-go` 분기는 Lottie 가 없는 sanity 회귀용 legacy 옵션으로만 보존.

자세한 매니페스트 (buildNumber / EAS submit / Android 키스토어) 검증은 `testflight-qa` 의 Phase 1 에 위임. 본 스킬은 시뮬 회귀 해석에 필요한 4개만.

### Phase 2 — 시뮬레이터 부팅 + dev client 부착

기본 트랙 = **simulator-devclient** (`com.neq.app` 시뮬 빌드 + Metro dev server).

```bash
# 1) iOS Simulator 부팅 (이미 부팅돼 있으면 SKIP)
xcrun simctl boot 4EDF2CB4-81BE-41B2-9D5C-AEB1DDE14E29
open -a Simulator

# 2) com.neq.app dev client 가 시뮬에 설치돼 있는지 확인
xcrun simctl get_app_container booted com.neq.app 2>/dev/null \
  || (cd apps/native && npx expo run:ios)
# = 미설치 시 dev client 1회 빌드. 첫 빌드 60~180s. 한번 설치 후에는 Metro 부착만 필요.

# 3) Metro (Expo dev server) 부팅 — dev client 분기 (백그라운드)
cd apps/native && npx expo start --dev-client &
# = npm run ios 가 expo run:ios (재빌드 강제) 라서, 재빌드 불필요 시 start --dev-client 권장.

# 4) Appium 서버 부팅 (별도 터미널 / 백그라운드)
appium --relaxed-security --port 4723 &
```

dev server 첫 번들이 30s+ 걸리므로 자동 회귀 진입 전 `Bundling complete` 로그 확인.

#### Phase 2 — expo-go 분기 (legacy, 옵션)

Lottie 등 네이티브 모듈에 의존하지 않는 sanity 회귀가 필요한 경우만:

```bash
# Expo Go 가 시뮬에 설치돼 있는지 확인
xcrun simctl get_app_container booted host.exp.Exponent 2>/dev/null \
  || echo "[BLOCKED] Expo Go 미설치 — Simulator 에서 App Store > Expo Go 설치"

# Expo dev server (Expo Go 분기)
cd apps/native && npx expo start --go &
```

현재 main 브랜치에서는 Welcome 화면이 Lottie 의존이라 expo-go 트랙에서는 step 0 진입 자체가 BLOCKED 예상.

### Phase 3 — 자동 회귀 (E2E simulator-devclient 분기)

`wdio.conf.ts` 의 `specs: ['./e2e/**/*.test.ts']` 글롭이 9 spec / 46 케이스를 자동 픽업합니다:

| spec | 케이스 | 커버 |
|------|--------|------|
| `regression-2026-05-21.test.ts` | 12 | 핵심 플로우 회귀 (P0×4 / P1×5 / P2×3) |
| `extended-2026-05-21.test.ts` | 9 | Saved B2/B3, SearchSheet |
| `filters-2026-05-21.test.ts` | 6 | 필터 칩 조합 (5칩 dropdown) |
| `onboarding-favorites-2026-06-04.test.ts` | 4 | 온보딩 step 7 favorites |
| `shared-mode-regression.test.ts` | 4 | 공유 모드 + deeplink (S1 testflight 분기 SKIP) |
| `refresh-race-2026-06-06.test.ts` | 4 | 새로고침 직후 빠른 좌 스와이프 race 차단 (R1~R4, commit `22f52e7` 회귀) |
| `swipe-card.test.ts` | 3 | 스와이프 사이클 + Reanimated |
| `persona-taste-survey.test.ts` | 3 | Persona v2 동적 설문 |
| `hybrid-onboarding-2026-05-27.test.ts` | 1 | 통합 온보딩 (V2) |

```bash
# Default — simulator-devclient (com.neq.app 시뮬 빌드)
cd apps/native && npm run test:e2e:ios
# = E2E_TARGET=simulator-devclient (default)

# Legacy — Expo Go 분기 (Lottie 도입 후 BLOCKED 예상)
cd apps/native && npm run test:e2e:ios:expo-go

# 실기기 — testflight 분기 (testflight-qa 스킬 영역)
cd apps/native && IOS_DEVICE_UDID=<udid> npm run test:e2e:ios:testflight
```

베이스라인: **`project_native_e2e_status` 참조** (출시 게이트 baseline). 6/6 commit `212fec7` 로 `refresh-race-2026-06-06.test.ts` 신규 합류 (R1~R4 = +4 케이스 → 42 → 46). 시뮬 dev 에서만 재현되는 **A2 React mount race** 는 [[feedback_native_a11y_e2e_patterns]] §1 의 retry-with-poll 헬퍼로 우회 — flaky 항목 발견 시 헬퍼 적용 여부부터 확인.

FAIL 항목은 `spec 명 + describe + line + 재현 로그 경로 (e2e/_logs/)` 로 리포트.

### Phase 4 — 수동 탐색 (시뮬 검증 가능 영역)

시뮬레이터에서 의미 있는 영역만 (실기기-only 항목은 `testflight-qa` 위임):

1. **온보딩 V2 7단계** — favorites_pick 스크롤·"다음/건너뛰기" 버튼 노출 (회귀 패턴: PR `pwa onboarding 7단계 스크롤 fix` 와 동일 증상 — `OnboardingV2Controller` ↔ `PersonaSurveyController` h-dvh 중첩)
2. **스와이프 사이클** — 좌/우/아래 + Detail 진입. Reanimated worklet cleanup (cycle 제한)
3. **Persona v2 설문 흐름** — context → step → favorites → summary. LLM 실패 시 static fallback
4. **필터 + 캐시** — 9 조합 (all/movie/series × all/kr/foreign) localStorage 일관성
5. **빈 상태 / 에러 UI** — 추천 0개, fetch 실패, rate limit 429
6. **다국어 / 다이나믹 타입** — iOS 시뮬 Settings > Display > Larger Text 단계별
7. **다크 / 라이트** — 시뮬 Settings > Developer > Appearance (시각 회귀는 `ux-review` 위임)

각 항목 PASS / FAIL / WARN / SKIP / BLOCKED 분류. 시뮬에서 검증 불가한 항목은 SKIP + `testflight-qa` 위임 표기.

#### 실기기 전용 (본 스킬 SKIP)

- Universal Link (`https://neq.me/...`) 실 동작
- iOS 권한 prompts 실 노출 (특히 알림 — 현재 disabled 유지 검증)
- 푸시 게이트 (VAPID / FCM)
- 메모리 압박 / 백그라운드 복귀 실제 거동
- Reanimated 4 Fabric crash (시뮬에서 미해결 — `project_native_transition` 참조)

→ 위 항목 발견 시 본 리포트에 SKIP + `testflight-qa` 로 라우팅 권고.

### Phase 5 — Android Emulator 스폿 체크 (보조)

iOS Simulator 회귀가 GREEN 일 때만 진입. 풀 회귀가 아닌 **플랫폼 격차 스폿 체크**:

```bash
# Android Emulator 부팅
emulator -list-avds
emulator -avd <avd-name> -no-snapshot &
adb devices

# Expo Go (Android) — Play Store 에서 에뮬에 설치 후
cd apps/native && npm run android
```

Appium Android 분기 자동 회귀는 `wdio.conf.ts` 미정 (UiAutomator2 capabilities 별도 필요). 본 Phase 에서는:
- 앱 부팅 → discover 진입 sanity
- 스와이프 1사이클
- 1 필터 전환

까지만. 본격 Android 회귀는 별도 트랙으로 분리 권고. SKIP / WARN 으로 표기해도 무방.

### Phase 6 — 리포트

`_workspace/mobile-qa-YYYY-MM-DD.md` 로 저장:

```markdown
# Mobile QA — {날짜} {범위}

## Summary
- iOS Simulator: PASS N / FAIL M / WARN K / SKIP J / BLOCKED B
- Android Emulator: PASS / FAIL / SKIP (스폿)
- 차단 항목: …

## Phase 1 — 매니페스트
- [PASS] bundleId host.exp.Exponent / version 0.1.0

## Phase 2 — 시뮬 부팅
- [PASS] iPhone 17 Pro / iOS 26.4 / Expo Go 부착 12s

## Phase 3 — 자동 회귀 (E2E expo-go)
- [PASS] regression-2026-05-21 12/12
- [FAIL] extended-2026-05-21 — B2 SearchSheet 닫기 hit miss (e2e/_logs/...)

## Phase 4 — 수동 탐색
- [PASS] 온보딩 7단계 스크롤 회복 확인
- [WARN] 필터 9 조합 중 1건 캐시 invalidation 누락

## Phase 5 — Android (옵션)
- [SKIP] AVD 미부팅 — 본 회귀 트랙 제외

## Recommendation
- 차단 1건 (Phase 3 B2) — frontend-builder 에 SendMessage
- 비차단 1건 (Phase 4 캐시) — 별도 트랙
- 실기기 위임 1건 (권한 prompt) — testflight-qa 라우팅
```

리포트 작성 후 결정:
- 차단 0 → 다음 단계 (TestFlight 업로드 / PR merge) 권고
- 차단 ≥ 1 → 해당 영역 에이전트 (`frontend-builder` / `rec-engineer` / `content-manager`) 에 SendMessage

## 에러 핸들링

- Simulator 미부팅 / udid mismatch → `[BLOCKED] Simulator <udid>` + `xcrun simctl list devices` 결과 첨부
- dev client (`com.neq.app`) 미설치 → Phase 2 의 `npx expo run:ios` 1회 빌드 (60~180s). 빌드 실패 시 `xcodebuild` 로그 첨부 BLOCKED
- Expo Go 미설치 (expo-go 트랙만) → `[BLOCKED] Expo Go install` + App Store 안내
- Appium 포트 충돌 (4723) → 점유 PID 확인 + `kill` 권고 (사용자 확인 후)
- Expo dev server bundle 실패 → metro 로그 + `apps/native/_workspace/` 의 최근 에러 확인
- WDA 빌드 실패 → 시뮬 첫 회 한정 정상 (1~2분). 2회 이상 실패 시 BLOCKED + xcodebuild log
- 일부 spec 만 mocha load 실패 → 해당 spec 만 BLOCKED, 나머지 회귀는 진행

## 다른 스킬과의 조합

- **빌드 전 코드 정합성** → 본 스킬 Phase 1 + `frontend-builder` 의 build 명령
- **PWA QA** → `qa` / `ux-review` 로 라우팅
- **시각 / DESIGN.md** → `ux-review`
- **실기기 / TestFlight / 출시 게이트** → `testflight-qa`
- **추천 데이터 / TMDB 회귀** → `tmdb-integration` (Phase 4 의 추천 로딩 검증 시)

## 후속 작업 지원

후속 실행 시:
- 이전 리포트의 FAIL / WARN 항목 우선 재검증
- 같은 빌드면 부분 재실행 (변경 영역의 Phase 만)
- 시뮬 dev 에서만 재현되는 A2 mount race 류는 retry-with-poll 헬퍼 적용 우선 검토

## 관련 참조

- `apps/native/wdio.conf.ts` — E2E target 분기 정본
- `apps/native/e2e/` — 회귀 spec 디렉토리
- `apps/native/_workspace/` — Native 작업 로그
- memory: `project_native_e2e_status` · `project_native_parity_gaps` · `feedback_native_a11y_e2e_patterns` · `feedback_reanimated_fabric_crash`

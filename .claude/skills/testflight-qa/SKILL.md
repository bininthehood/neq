---
name: testflight-qa
description: "neq native 앱의 TestFlight 베타 단계 실기기 QA. IPA/EAS 매니페스트 검증, cold start, iOS 권한 prompts, Universal Link 실기기 동작, 푸시 게이트, 크래시/Reanimated 4 회귀, E2E testflight 분기 재실행, 베타 테스터 피드백, 출시 게이트 점검. 'TestFlight QA', '베타 QA', '실기기 회귀', '출시 게이트', '출시 전 점검', 'IPA 검증', '베타 테스트', 'TestFlight 빌드 검증', 'EAS 빌드 QA' 요청 시 사용. PWA/코드 통합 정합성은 mobile-qa, SwiftUI 앱은 ios-qa 사용 — 본 스킬은 Expo RN + TestFlight 실기기 단계 전용."
---

# TestFlight QA — neq 베타 단계 실기기 검증

TestFlight 로 배포된 standalone 빌드를 실기기에서 회귀·탐색·게이트 점검하는 워크플로우입니다. `mobile-qa` 가 빌드 전 코드 정합성에 집중한다면, 이 스킬은 **EAS Build → TestFlight 설치 이후의 실기기 단계** 만 담당합니다.

## 언제 사용하나요?

- 새 TestFlight 빌드를 업로드한 직후 회귀를 돌릴 때
- App Store 제출 전 출시 게이트 점검이 필요할 때
- 베타 테스터가 보고한 이슈를 실기기에서 재현·진단할 때
- Universal Link / 권한 / 푸시처럼 시뮬레이터에서 검증이 불완전한 항목을 확인할 때

## 책임 경계

| 영역 | 스킬 | 비고 |
|------|------|------|
| 코드/API shape 정합성, 빌드/타입 에러 | `mobile-qa` | 빌드 전 단계 |
| 시뮬레이터 자동 회귀 (Expo Go dev) | `mobile-qa` + 직접 `npm run test:e2e:ios` | 5 spec / 31 케이스 baseline |
| TestFlight 실기기 회귀 + 출시 게이트 | **`testflight-qa`** | 본 스킬 |
| SwiftUI 네이티브 (gstack) | `ios-qa` | neq 에는 부적합 (Expo RN) |

본 스킬은 `qa-tester` 에이전트가 호출합니다. neq 하네스 오케스트레이터의 출시 단계 검증 트랙입니다.

## 전제 조건

실기기 QA 진입 전 다음이 충족되어야 합니다:

- TestFlight 에 빌드 업로드 완료 (`eas build --platform ios --profile production` + `eas submit`)
- 실기기에 TestFlight 앱에서 해당 build 설치 완료
- `apps/native/wdio.conf.ts` 의 `testflight` 분기를 사용할 환경변수 준비:
  - `IOS_DEVICE_UDID` — `xcrun xctrace list devices` 또는 Xcode > Devices 에서 확인
  - `IOS_DEVICE_NAME` (선택, 기본 `iPhone`)
  - `IOS_PLATFORM_VERSION` (선택, 기본 `26.5`)
  - `IOS_TEAM_ID` (선택, 기본 `67YXH2WD77` = eas.json submit profile)
- 실기기 USB 연결 + 개발자 모드 ON + appium-xcuitest WDA 신뢰 완료
- Appium 서버 가동 (`appium --relaxed-security --port 4723`)

전제가 깨졌다면 진단부터 — 자동 회귀를 무리하게 돌리지 않고 사용자에게 무엇이 막혔는지 보고합니다.

## 워크플로우 (5 Phase)

### Phase 0 — 컨텍스트 확인

1. `_workspace/` 에 이전 TestFlight QA 리포트가 있는지 확인
2. 새 빌드 번호인지 비교 (이전 리포트의 buildNumber vs 현재 `app.json` ios.buildNumber)
3. 같은 빌드 재실행이면 부분 재실행 (실패 항목만), 새 빌드면 전체 회귀

### Phase 1 — 빌드 매니페스트 정합성

코드 베이스의 메타데이터가 실제 TestFlight 빌드와 어긋나면 이후 모든 검증이 무의미합니다. 먼저 정합 확인:

| 항목 | 출처 | 검증 |
|------|------|------|
| bundleId | `apps/native/app.json` ios.bundleIdentifier | `com.neq.app` 와 TestFlight 앱 매칭 |
| buildNumber | `apps/native/app.json` ios.buildNumber | EAS dashboard 의 빌드 번호와 동일 |
| version | `apps/native/app.json` expo.version | 의도한 marketing version |
| autoIncrement | `apps/native/eas.json` production | `true` — 수동 충돌 방지 |
| ascAppId | `apps/native/eas.json` submit.production.ios | `6773622396` |
| appleTeamId | `apps/native/eas.json` submit.production.ios | `67YXH2WD77` |
| associatedDomains | `apps/native/app.json` ios | `applinks:neq.me` |
| Android 패키지 SHA-256 | `apps/web/public/.well-known/assetlinks.json` | EAS Android build 키스토어 fingerprint 와 일치 |

`eas build:list --platform ios --status finished --limit 5` 로 최근 빌드 메타 확인 가능. 사용자 자격증명이 없는 환경이면 SKIP 으로 표기하고 매니페스트 비교만 수행합니다.

### Phase 2 — 자동 회귀 (E2E testflight 분기)

`wdio.conf.ts` 에 이미 분기가 들어있습니다. 실기기로 점프하면 5 spec / 31 케이스 baseline 회귀:

```bash
# Appium 서버 (별도 터미널)
appium --relaxed-security --port 4723

# 실기기 회귀
cd apps/native && IOS_DEVICE_UDID=<udid> E2E_TARGET=testflight npm run test:e2e:ios
```

- 전체가 PASS 면 출시 게이트 (Phase 4) 로 진행
- FAIL 항목은 spec 명 + 케이스 명 + 라인 으로 리포트
- 시뮬레이터 dev mode 에서만 재현되던 **A2 React mount race** ([[feedback_native_a11y_e2e_patterns]] §1) 가 실기기 prod 에서 사라지는지 확인 — 사라졌다면 회귀 spec 의 retry-with-poll 헬퍼는 유지하되 가설 1 (Expo Go reconciler race) 근거 강화로 기록

자세한 spec 별 커버리지와 SKIP 사유는 `references/release-gate.md` 의 "자동 회귀 매트릭스" 참조.

### Phase 3 — 수동 탐색 (실기기 전용 항목)

자동화로 검증이 불완전한 영역을 사람이 손으로 확인합니다. 영역별 체크리스트는 `references/manual-test-matrix.md` 에 있으며, 본문에는 진입점만 둡니다:

1. **Cold start / first-launch** — 앱 완전 종료 후 첫 실행 시 splash → discover 도달 시간, persona 마이그레이션 정상 동작
2. **iOS 권한 prompts** — 알림(현재 disabled — prompt 자체 노출 금지), 카메라/사진, 추적(NSUserTrackingUsageDescription) 문구·시점
3. **Universal Link** — `https://neq.me/share/<id>` 메모/메시지 앱에서 길게 누르기 → "neq 에서 열기" 노출 + share 라우트 진입
4. **Custom scheme** — `neko://` 진입점 동작 (associatedDomains 무관 fallback)
5. **백그라운드 복귀 / 메모리 압박** — 다른 앱 5분 전환 후 복귀 시 상태 유지, 메모리 경고 시 graceful degradation
6. **크래시 패턴 회귀** — `references/crash-regression.md` 참조. Reanimated 4 zIndex int prop, 무한 worklet cleanup, Fabric cloneShadow 회귀
7. **푸시 게이트 (현재 disabled)** — `NEXT_PUBLIC_NOTIFICATIONS_ENABLED=false` 상태가 유지되는지, 권한 prompt 비활성, VAPID 미설정이라도 앱이 정상 동작

각 항목 결과는 PASS / FAIL / WARN / SKIP / BLOCKED 로 분류합니다.

### Phase 4 — 출시 게이트 점검

실기기 회귀 + 수동 탐색이 끝나면 App Store 제출 직전 게이트로 들어갑니다. 게이트 자체 체크리스트는 `references/release-gate.md` 에 있으며 핵심은:

- Universal Link 자격증명 의존 4건 (apple-app-site-association · assetlinks.json · associatedDomains · intentFilters) 실기기에서 동작 확인
- 베타 테스터 피드백 수집 채널 정상 — PostHog 키 셋업, TestFlight 피드백 인박스 확인
- 출시 준비도 자동 점검 (`scripts/posthog-release-readiness.ts` 6 쿼리) — 기준 미달 시 출시 보류

게이트 미통과 항목은 차단(blocker) / 비차단(non-blocker) 로 표기, 차단 항목 0 일 때만 PASS.

### Phase 5 — 리포트 + 변경 이력

`_workspace/testflight-qa-YYYY-MM-DD-build-<N>.md` 로 저장합니다. 양식:

```markdown
# TestFlight QA — {날짜} build {N}

## Summary
- PASS: N / FAIL: M / WARN: K / SKIP: J / BLOCKED: B
- 차단 항목: …

## Phase 1 — 매니페스트
- [PASS] bundleId com.neq.app / build 9 / version 0.1.0

## Phase 2 — 자동 회귀
- [PASS] regression-2026-05-21 12/12
- [FAIL] extended-2026-05-21 — B2 SearchSheet 닫기 hit miss (실기기 신규)

## Phase 3 — 수동 탐색
- [WARN] cold start 3.1s — baseline 2.4s 대비 +0.7s

## Phase 4 — 출시 게이트
- [PASS] Universal Link 4/4
- [SKIP] PostHog 출시 준비도 (W7 직전 재실행)

## Recommendation
- 차단 1건 (Phase 2 B2) — frontend-builder 에게 SendMessage
- 비차단 1건 (Phase 3 cold start) — Phase 5 정리 후 별도 트랙
```

리포트 작성 후 다음 중 하나를 결정합니다:
- 차단 없음 → 출시 진행 권고
- 차단 있음 → 해당 영역 에이전트에게 수정 요청, 재빌드 후 본 워크플로우 재실행

## 다른 스킬과의 조합

- **빌드 전 검증** → `mobile-qa` (코드 정합성) → TestFlight 업로드 → 본 스킬
- **시각/UX 회귀** → `ux-review` 와 교차 (특히 권한 prompt 문구, 출시 게이트 시각 항목)
- **TMDB 데이터 회귀** → `tmdb-integration` (Phase 3 의 추천 로딩 latency 차이 비교)

## 에러 핸들링

- Appium 서버 미가동 → `[BLOCKED] Appium 서버 미가동` 으로 표기, 회귀 SKIP
- 실기기 미연결 / WDA 빌드 실패 → `[BLOCKED]` + xcodeOrgId·signing 가이드 안내
- EAS 자격증명 부재 → 매니페스트 비교만 수행, `eas build:list` 항목 SKIP
- 5 spec 중 일부 spec 자체가 mocha 로 로드 실패 → 해당 spec 만 [BLOCKED] 표기, 나머지 회귀는 진행

## 후속 작업 지원

이 스킬은 출시 직전마다 반복 호출됩니다. 후속 실행 시:
- 이전 리포트의 FAIL/WARN 항목을 우선 재검증
- 같은 빌드 번호로 재실행 → 부분 재실행 (Phase 2,3 만)
- 새 빌드 번호 → 전체 워크플로우 재실행

## 관련 참조

- `references/manual-test-matrix.md` — 실기기 수동 탐색 상세 매트릭스
- `references/release-gate.md` — 출시 게이트 체크리스트 (Universal Link 자격증명 의존 4건 포함)
- `references/crash-regression.md` — Reanimated 4 / Fabric / native a11y 회귀 패턴
- `apps/native/wdio.conf.ts` — testflight 분기 정본
- `apps/native/eas.json` — submit profile 정본
- memory: `project_native_e2e_status` · `project_universal_link_checklist` · `feedback_native_a11y_e2e_patterns` · `feedback_reanimated_fabric_crash`

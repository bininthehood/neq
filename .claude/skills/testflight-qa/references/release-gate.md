# 출시 게이트 체크리스트

TestFlight 베타 회귀 + 수동 탐색이 끝난 뒤, App Store 제출 직전에 점검하는 항목입니다. 차단(blocker) 항목이 0 일 때만 출시 진행합니다.

## 자동 회귀 매트릭스 (Phase 2 참고)

`apps/native/wdio.conf.ts` 의 `E2E_TARGET=testflight` 분기로 실기기 회귀를 돌립니다. 현재 5 spec / 31 케이스:

| spec | 케이스 | 책임 영역 | TestFlight 회귀 기대 |
|------|--------|----------|---------------------|
| `regression-2026-05-21.test.ts` | 12 (P0×4 / P1×5 / P2×3) | Discover 스와이프, Detail, Saved tab, 연속 스택, 프로필 | 12/12 PASS |
| `extended-2026-05-21.test.ts` | 9 (B1×2 / B2×4 / B3×3) | Onboarding 진입 보호, Saved 필터/sheet/검색, Report, Long-press | 9/9 PASS |
| `filters-2026-05-21.test.ts` | 6 | 5칩 a11y mount + 각 dropdown open/close | 6/6 PASS |
| `swipe-card.test.ts` | 3 | initial smoke + 좌/우 스와이프 | 3/3 PASS |
| `hybrid-onboarding-2026-05-27.test.ts` | 1 | hybrid 통합 회귀 가드 (persona X + Alert 건너뛰기) | 1/1 PASS — 본 빌드에서 첫 실기기 검증 권장 |

**SKIP / 의도된 미커버:**
- `Option tap → filter state 전환` (B4) — dev env 한계로 SKIP. EAS prod build 검증 필요. TestFlight 단계에서 해소되는지 확인 후 spec 확장 결정
- Onboarding 6단계 destructive walk-through — 사용자 데이터 보호로 baseline 에서 제외
- VoiceOver 실사용자 a11y — Appium pan 부분 검증만. 본 단계에서 수동 toggle 검증

## Universal Link 자격증명 의존 4건

[[project_universal_link_checklist]] 의 자격증명 의존 4건이 모두 실기기에서 동작해야 출시 가능합니다.

| # | 항목 | 검증 방법 | 차단 여부 |
|---|------|----------|----------|
| 1 | `apple-app-site-association` (apps/web/public/.well-known) | `curl -sI https://neq.me/.well-known/apple-app-site-association` → 200 + `application/json` | 차단 |
| 2 | `assetlinks.json` (apps/web/public/.well-known) | `curl https://neq.me/.well-known/assetlinks.json` → SHA-256 가 EAS Android 키스토어와 일치 | 차단 |
| 3 | `app.json ios.associatedDomains` | `applinks:neq.me` 포함 + TestFlight 빌드에서 실제 동작 (manual-test-matrix §3-1) | 차단 |
| 4 | `app.json android.intentFilters` | `https://neq.me/share/*` autoVerify 동작 (manual-test-matrix §3-2) | 차단 |

검증 명령:

```bash
# 1. AASA
curl -sI https://neq.me/.well-known/apple-app-site-association | head -5

# 2. assetlinks
curl -s https://neq.me/.well-known/assetlinks.json | jq '.[0].target.sha256_cert_fingerprints'

# 3-4. app.json 검증
jq '.expo.ios.associatedDomains' apps/native/app.json
jq '.expo.android.intentFilters' apps/native/app.json
```

자격증명 무관 4건 (라우트 / typed routes / Next.js serving / 도메인 확정) 은 [[project_universal_link_checklist]] 에 따르면 이미 commit `a33d566` 으로 완료되었으나, 실기기 동작 확인 시 같이 검증합니다.

## 빌드 매니페스트 게이트

| 항목 | 출처 | 기대 |
|------|------|------|
| bundleId iOS | `app.json` ios.bundleIdentifier | `com.neq.app` |
| bundleId Android | `app.json` android.package | `com.neq.app` |
| version | `app.json` expo.version | App Store Connect 의 marketing version 과 동일 |
| buildNumber iOS | `app.json` ios.buildNumber | EAS dashboard 의 finished 빌드 번호 |
| versionCode Android | `app.json` android.versionCode | Play Console 의 internal track 빌드 번호 |
| autoIncrement | `eas.json` build.production | `true` |
| ascAppId | `eas.json` submit.production.ios | `6773622396` |
| appleTeamId | `eas.json` submit.production.ios | `67YXH2WD77` |

`eas build:list --platform ios --status finished --limit 5` 로 최근 빌드 메타 점검. 자격증명 미보유 환경이면 매니페스트 비교만 [PASS] 처리하고 dashboard 항목은 [SKIP].

## 운영 게이트

| 항목 | 검증 | 차단 여부 |
|------|------|----------|
| PostHog 이벤트 수집 | `EXPO_PUBLIC_POSTHOG_KEY` EAS Secret 등록 + TestFlight 빌드의 distinct_id 가 PostHog Live 에 노출 | 차단 |
| PostHog 출시 준비도 6 쿼리 | `scripts/posthog-release-readiness.ts` 실행 → 모든 쿼리 기준 통과 | 차단 |
| Sentry / 크래시 리포트 | (없으면 SKIP — 운영 결정 영역) | 비차단 |
| TestFlight 피드백 인박스 | App Store Connect 접근 + 첫 베타 피드백 잡힘 확인 | 차단 |
| 베타 테스터 안내 문서 | 사용자 보고 채널 + 알려진 이슈 명시 | 비차단 |

PostHog 출시 준비도는 W7 직전 첫 실행이 [[project_posthog_release_readiness]] 에 기록되어 있습니다. 기준 미달 항목이 있으면 출시 보류 후 데이터 누적 대기.

## 출시 준비 확인 마지막 점검

- [ ] App Store Connect: 빌드가 "Ready to Submit" 상태
- [ ] 심사 정보: 데모 계정 / 심사용 안내 / 스크린샷 / 마케팅 텍스트 확정
- [ ] 개인정보 처리방침 URL 동작 (neq.me/privacy 또는 동등)
- [ ] 데이터 수집 명세 (Apple App Privacy) 가 실제 코드와 일치 — PostHog/TMDB/OpenAI 외 추가 수집 없음 확인
- [ ] 외부 의뢰 자산 영역 ([[project_phase5_brand_assets]]) 임시 자산이 실 자산으로 교체되었는지 — 교체 안 됐다면 [WARN]
- [ ] [[project_brand_neq]] 브랜드/도메인 노출 일관성 (앱 내 텍스트, 워드마크, 도메인)
- [ ] 디바이스 격리 ([[project_anon_auth_device_isolation]]) 출시 후 결정 — 본 시점에서는 c 폐기 상태가 유지되는지만 확인

## 결과 기록 형식

```markdown
## Phase 4 — 출시 게이트
- [PASS] Universal Link 4/4 (UL #1~4 실기기 진입 확인)
- [PASS] 매니페스트 — bundleId / build / version 일치
- [PASS] PostHog distinct_id 수집 — Live 에서 5 이벤트 관측
- [FAIL] PostHog 출시 준비도 — `recommendation_loaded.errors_pct` 12% (기준 5%)
  조치: 24h 추가 누적 후 재실행 권고. 그 사이 신규 enrich 회귀 원인 조사 필요
- [WARN] 외부 의뢰 자산 — discover 워드마크 임시 자산 그대로
```

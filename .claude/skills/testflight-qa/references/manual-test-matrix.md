# 실기기 수동 탐색 매트릭스

TestFlight 빌드를 실기기에 설치한 뒤 사람이 손으로 확인하는 영역입니다. 자동화로 잡히지 않거나, 시뮬레이터에서는 검증이 불완전한 항목만 모았습니다.

## 진입 전 준비

- 실기기 한 대 (iOS 18.x 이상 권장)
- TestFlight 앱에서 해당 빌드 설치 + 첫 실행 권한 (개발자 신뢰)
- 다음 데이터를 미리 비워두면 cold path 가 깨끗합니다:
  - 앱 삭제 → 재설치 (persona / saved / recommendation cache 초기화)
- 검증 전후로 PostHog Live 탭에서 `app_open` / `recommendation_loaded` 가 들어오는지 확인할 수 있다면 더 좋습니다.

## 1. Cold start / first-launch

| 항목 | 기대 | 측정/관찰 |
|------|------|----------|
| splash 노출 시간 | 1.5s 이내 (실기기 baseline) | 시계 또는 화면 녹화 timestamp |
| splash → discover 도달 | 3s 이내 (LLM cold 포함) | 영상 record + 프레임 카운트 |
| persona 마이그레이션 | 신규 설치도 crash 없이 onboarding 으로 진입 | discover 도달 후 첫 추천 카드 노출 |
| Fast Refresh artifact 없음 | Expo Go dev 의 "Connecting to Metro" 모달 미노출 | 첫 화면 캡처 |
| network 차단 first-launch | 오프라인 안내 UI + 재시도 옵션 | Wi-Fi/셀룰러 OFF 상태로 cold |

A2 mount race ([[feedback_native_a11y_e2e_patterns]] §1) 가 실기기 prod 에서 사라지는지 함께 관찰합니다. 첫 카드 tap onPress 가 1회 attempt 에 발화하면 가설 1 (Expo Go reconciler race) 근거가 굳습니다.

## 2. iOS 권한 prompts

현재 알림은 **비활성** (`NEXT_PUBLIC_NOTIFICATIONS_ENABLED=false`). 권한 prompt 가 노출되면 안 됩니다. 다른 권한은 `app.json` infoPlist 의 문구가 실기기에서 그대로 보이는지 확인:

| 권한 | 문구 출처 | 검증 |
|------|----------|------|
| ATT (`NSUserTrackingUsageDescription`) | `app.json` ios.infoPlist | TestFlight 첫 진입 시 system dialog 문구가 "추천 품질 개선을 위해…" 와 일치 |
| 알림 | (현재 disabled) | system permission dialog 노출 0건. 설정 앱 > 앱 > 알림 항목 자체가 없어야 함 |
| 사진/카메라 | (현재 사용 안 함) | 노출 시 즉시 [FAIL] — 의도하지 않은 권한 요청 |
| 위치 | (현재 사용 안 함) | 동일 |

권한 dialog 문구는 App Store 심사에서 reject 사유가 자주 되는 영역입니다. 모호한 한글 문구가 있으면 [WARN] 으로 표기합니다.

## 3. Universal Link 실기기 검증

자격증명 의존 4건 ([[project_universal_link_checklist]]) 이 실기기에서 동작하는지가 본 스킬의 핵심 게이트 중 하나입니다.

### 3-1. iOS Universal Link

1. iPhone 메모 앱에서 `https://neq.me/share/{유효한_id}` 입력 → 길게 누름
2. 컨텍스트 메뉴에 "neq 에서 열기" 가 노출되는지 확인
3. 탭 시 앱이 열리고 `app/share/[id].tsx` 라우트로 진입 → 해당 콘텐츠 detail 노출
4. 동일 동작을 iMessage / Safari 주소창 입력으로 반복

실패 케이스:
- "neq 에서 열기" 메뉴가 안 보임 → `apple-app-site-association` 파일이 200/JSON 으로 서빙 안 됨 또는 Team ID 불일치
- 메뉴는 보이지만 web 으로 fallback → associatedDomains 미적용 (development build 의심) 또는 첫 설치 후 swiped-up 으로 강제 등록 필요

### 3-2. Android App Link

1. Android 기기에서 `https://neq.me/share/{id}` 를 Chrome 에 입력
2. "neq 에서 열기" intent chooser 또는 자동 진입 확인
3. autoVerify 가 동작했다면 chooser 없이 바로 앱 진입

실패 케이스:
- chooser 만 뜨고 자동 진입 안 됨 → `assetlinks.json` SHA-256 가 실제 EAS Android 키스토어와 다름
- 앱 진입 후 빈 화면 → `app/share/[id].tsx` 라우트 누락 or `id` 파라미터 처리 실패

## 4. Custom scheme

associatedDomains 미적용 fallback 으로 `neko://` 가 동작해야 합니다:

```
xcrun simctl openurl booted neko://share/<id>   # 시뮬레이터
```

실기기에서는 Safari 주소창에 `neko://share/<id>` 입력. 메모 앱 길게 눌러 "열기" 도 가능.

## 5. 백그라운드 복귀 / 메모리 압박

| 시나리오 | 기대 |
|---------|------|
| 다른 앱 5분 사용 후 복귀 | 마지막 화면 유지, 카드 위치/필터 상태 보존 |
| 다른 앱 30분 사용 후 복귀 | 토큰 유효 + 추천 카드 stale 표시 없이 정상 |
| Settings > 배터리 > 백그라운드 새로고침 OFF | 앱 실행 후 첫 fetch 만 살아있음 |
| 저사양 기기에서 메모리 경고 (Xcode > Devices > simulate memory warning) | crash 없이 sheet/modal 닫고 메인 화면 유지 |
| 비행기 모드 ON | 오프라인 안내 + 캐시된 추천 노출 |

## 6. 크래시 패턴 회귀

자세한 패턴은 `crash-regression.md` 참조. 실기기에서는 다음 시나리오를 손으로 돌립니다:

1. **SwipeCard zIndex** ([[feedback_reanimated_fabric_crash]] 패턴 2) — 카드 10장 연속 스와이프, 7~10번째 깊이의 카드가 보이는 순간 SIGABRT 없는지 확인
2. **무한 worklet** (패턴 1) — Bridge / Tutorial 데모 / FilterChips dropdown 을 30초 이상 열어두고 다른 화면 전환
3. **DetailSheet 빠른 open/close** — 0.5s 간격으로 10회 반복 — gesture-handler unmount race 없는지

## 7. 푸시 게이트 (현재 disabled)

알림은 활성화되지 않은 상태가 정상입니다. 다음을 확인합니다:

| 항목 | 기대 |
|------|------|
| 권한 prompt | 노출 0건 |
| Settings > 앱 > 알림 | 항목 자체 없음 또는 비활성 표시 |
| `EXPO_PUBLIC_POSTHOG_KEY` ([[feedback_native_posthog_env]]) | EAS Secret 등록 — TestFlight 빌드의 PostHog 이벤트가 들어와야 함 |
| in-app banner / toast 형태 안내 | 푸시 비활성 안내 UI 자체 미노출 (의도된 상태) |

활성화 결정이 내려지면 본 영역에 권한 prompt 문구 검증, foreground/background 시나리오 매트릭스를 추가합니다.

## 8. 베타 테스터 피드백 채널

테스터가 실제로 피드백을 줄 수 있는 경로가 살아있는지 확인:

- TestFlight 앱 내 "피드백 보내기" 동작 (스크린샷 첨부 가능 여부)
- TestFlight 피드백 인박스 (App Store Connect) 접근 가능
- PostHog 에 베타 테스터 distinct_id 가 잘 들어가는지 — 빌드 1~2회 실행 후 PostHog Live 에서 식별
- 사용자 보고 채널 (이메일/디스코드/슬랙 — 운영팀과 합의된 채널) 안내 노출

피드백 수집이 끊겨 있으면 베타 단계가 무의미합니다. 이 영역은 차단(blocker) 으로 다룹니다.

## 결과 기록 형식

리포트의 Phase 3 섹션은 항목별 한 줄 + 필요한 경우 재현 메모:

```markdown
## Phase 3 — 수동 탐색
- [PASS] 1. cold start 2.6s — baseline 2.4s 대비 +0.2s, 허용 범위
- [PASS] 2. ATT 권한 dialog 문구 일치
- [FAIL] 3-1. iOS Universal Link — Safari 주소창 → 앱 진입 안 됨, web fallback
  재현: iOS 18.4 / iPhone 15 / TestFlight build 9
  의심: associatedDomains 적용 누락 또는 AASA 첫 fetch 실패
- [WARN] 5. 메모리 경고 — DetailSheet 열린 상태에서 sheet 잔존
- [SKIP] 7. PostHog — EAS Secret 미등록 환경, 빌드 9 에서는 검증 불가
```

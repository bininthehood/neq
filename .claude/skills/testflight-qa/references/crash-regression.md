# 크래시 / 메모리 / a11y 회귀 패턴

TestFlight 단계에서 재발 여부를 확인할 회귀 패턴입니다. 모두 5/13~5/27 사이 native 전환 중 한 번씩 잡혔던 이슈입니다.

## 1. Reanimated 4 + Fabric `cloneShadowTree` SIGABRT

### 1-1. 패턴 2 — int prop 에 동적 double ([[feedback_reanimated_fabric_crash]])

`useAnimatedStyle` 결과로 `zIndex` 같은 int prop 에 비정수 double 이 흘러가면 `folly::to<long long, double>` 변환 실패 → abort.

**재현 시나리오:**
- 카드 10장 연속 우측 스와이프
- 7~10번째 깊이의 카드가 보이는 순간 (animatedDepth `9.9` 같은 비정수 도달)

**현재 fix:** `apps/native/components/SwipeCard.tsx` 의 `Math.round(10 - animatedDepth.value)` (commit `b53b91e`). 본 회귀에서는:

```bash
grep -n "Math.round" apps/native/components/SwipeCard.tsx
```

가드가 살아있는지 확인하고, 실기기에서 위 시나리오 30회 반복 시 SIGABRT 없는지 관찰.

**유사 검사 대상:**
- Fabric `BaseViewProps` 의 int prop 들: `zIndex`, `accessibilityLevel`, `accessibilityElementsHidden`, `numberOfLines`
- 현재 코드 내 `useAnimatedStyle` 반환에서 int prop 사용처를 grep 으로 점검

```bash
grep -rn "useAnimatedStyle" apps/native/ | head -20
```

### 1-2. 패턴 1 — 무한 worklet cleanup 누락

`withRepeat(..., -1, false)` 가 unmount 시 cleanup 안 되면 매 frame shadow tree clone 누적.

**현재 fix:**
- Bridge orbit (commit `f671b5c`) — `cancelAnimation` 추가
- Tutorial 데모 (commit `7f4a557`)

**회귀 확인 시나리오:**
- Bridge orbit 노출 화면을 30초 이상 띄운 뒤 다른 화면 전환 → 메모리 그래프 (Xcode > Devices > Memory) 누적 없는지
- Tutorial 데모 화면 빠른 진입/이탈 10회 반복

## 2. Root layout dual-tree cycle ([[feedback_root_layout_dual_tree_cycle]])

조건부로 빈 View 와 Provider tree 를 토글하면 무한 mount cycle + Hermes OOM. race 차단은 leaf 에서만 해야 합니다.

**회귀 확인:**
- `app/_layout.tsx` 의 conditional 렌더 패턴 점검 — 빈 View 토글 가드가 leaf 가 아닌 root 에 있으면 [FAIL]
- 첫 실행 후 30초 idle 상태에서 메모리 그래프가 우상향이면 의심

## 3. Native a11y E2E 4종 트랩 ([[feedback_native_a11y_e2e_patterns]])

E2E 자동 회귀가 실기기에서 새로 깨진다면 대개 아래 4종 중 하나입니다:

| # | 트랩 | 우회 위치 |
|---|------|----------|
| 1 | 첫 Pressable tap onPress race | retry-with-poll 헬퍼 — 모든 chip/search 진입 |
| 2 | 동일 a11y label 의 다중 element (backdrop vs 버튼) | `$$('~검색 닫기')` last 매칭 |
| 3 | wrap Pressable 의 자식 a11y 흡수 | wrap 에 `accessible={false}` |
| 4 | 시뮬레이터 상태 leak (DetailSheet/Search/dropdown 잔존) | `ensureBackToDiscover` cleanup |

TestFlight 실기기에서는 #1 (mount race) 이 사라질 수 있습니다 (가설 1 — Expo Go reconciler race). 사라졌다면:
- 회귀 spec 의 retry-with-poll 헬퍼는 유지 (개발 환경 호환)
- 본 리포트에 "TestFlight 빌드에서 retry 1회 attempt 내 성공률 100%" 기록 → 가설 1 근거 강화

## 4. PostHog 초기화 lazy ([[feedback_native_posthog_env]])

`apps/native/.env` 에 `EXPO_PUBLIC_POSTHOG_KEY` 라인 자체가 없으면 `PostHogProvider` 가 no-op. TestFlight 빌드의 경우 EAS Secret 으로 주입되어야 합니다.

**검증:**

```bash
# EAS 환경에 등록되어 있는지
eas env:list production | grep POSTHOG

# 실기기에서 첫 실행 후 PostHog Live (project: neq) 에 distinct_id 노출 확인
```

빌드에 키가 없으면 베타 단계에서 사용자 행동 데이터 누락 — 출시 게이트 차단 항목.

## 5. iOS 18.x WebView 잔여 이슈

PWA 시기에 `webinspectord` 연결 실패 이슈가 있었습니다. 네이티브 전환 후 WebView 경유 안 하므로 자연 해소되었지만, 다음 경우 확인:

- `share/[id].tsx` 진입 시 외부 링크 처리 — `Linking.openURL` fallback 동작
- TMDB 외부 링크 클릭 시 in-app browser (Expo `expo-web-browser`) 정상 open

## 진단 도구

| 문제 | 도구 |
|------|------|
| crash log | Xcode > Window > Devices and Simulators > 기기 선택 > "View Device Logs" |
| 메모리 누수 | Xcode > Open Developer Tool > Instruments > Allocations / Leaks |
| 네트워크 | Charles Proxy / Proxyman (TestFlight 빌드는 NSAppTransportSecurity 기본값 — HTTPS 만) |
| Universal Link 디버깅 | iOS Settings > Developer > Universal Links 디버깅 메뉴 |
| EAS 빌드 로그 | `eas build:view <build-id>` |

## 결과 기록 형식

```markdown
## Phase 3 — 크래시 회귀
- [PASS] SwipeCard zIndex — 30회 연속 스와이프 SIGABRT 0건
- [PASS] Bridge orbit — 30s idle 후 메모리 누적 없음
- [PASS] A2 mount race — TestFlight prod 에서 1회 attempt 100% 성공 (가설 1 근거 ↑)
- [SKIP] PostHog key — EAS Secret 미보유 환경
```

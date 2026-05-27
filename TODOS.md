# TODOS

## Open

### Hybrid onboarding 후속 — informational deferrals (v0.3.3.0 review)

- **Priority:** P2
- **#3 embedded 인라인 객체:** `OnboardingV2Controller.tsx` / `apps/native/app/onboarding/index.tsx` 의 `embedded={{ onSubStepChange: setPersonaSubStep }}` 인라인 객체 — 매 render 새 reference. `useMemo` 로 안정화. visible bug 0 이지만 useEffect 자주 발화
- **#7 UNIFIED_TOTAL_STEPS=10 매직:** web/native 양쪽 하드코딩 + `TOTAL_STEPS=6` 와 분리. `STEP_LABELS.length + PERSONA_SUB_STEPS - 1` 로 derive
- **#8 StepHeader interface comment:** "0..4" → "0..N-1 (N = total)" — comment-only 정정 (이미 web 은 fix 일부 반영, native 도 동기화 검토)
- **#9 Android splash bg:** `expo-splash-screen` plugin 미등록 — EAS Android build 에서 splash 가 `#12110E` 로 실제 반영되는지 검증 필요. iOS 만 fix 적용된 가능성
- **#10 Fabric `initialWindowMetrics=null` first install:** Reanimated 4 Fabric 환경에서 첫 cold launch 시 safe-area inset 측정 race 검증 필요 (notched iOS / Android cutout 기기)

### Approach C: 행동 로그 LLM 요약 prepend (출시 후 검증 게이트)

- **What**: 페르소나의 최근 7일 swipe 로그를 gpt-4o-mini 에 던져 "3문장 자연어 취향 요약" 생성 → recommend API LLM curation system 프롬프트에 prepend. UI/스키마 변경 0, 서버사이드 한 파일.
- **Why**: 본 design (LLM 동적 취향 설문) 의 가설이 "취향 축 부족 = 진짜 wedge" 인데 검증되지 않음. 행동 로그 path 는 동일 가설을 사용자 마찰 0 으로 측정 가능. office-hours Phase 3.5 서브에이전트 cold read 의 48h prototype 제안.
- **Pros**: 사용자 마찰 0, 콜드 스타트 자동 해결 (행동 로그 누적 후), 설문 UX 와 시너지 가능 (둘 다 같이 prepend).
- **Cons**: 콜드 스타트 약함 (행동 로그 0 인 신규 페르소나), 비용 증가 (페르소나당 추가 LLM 호출 1회).
- **Context**: design doc Reviewer Concern #4 의 pivot 옵션. 출시 후 4주 Success Criteria 8개 중 2-3 미달 시 도입. 구현: `apps/web/src/app/api/recommend/route.ts` 의 system 프롬프트 조립부에 LLM 호출 추가 + Redis 24h TTL 캐시.
- **Depends on / blocked by**: 본 design (LLM 동적 설문) ship + 출시 후 1-2주 데이터 수집 (PostHog Success Criteria 측정).
- **Trigger 조건**: Success Criteria #2 (save rate ×1.15) 또는 #5 (만족도 3.8/5) 미달 → Approach C 도입 검토 시작
- **참조**: design doc `james-main-design-20260524-185113.md`, Approach C 섹션 + Reviewer Concern #4

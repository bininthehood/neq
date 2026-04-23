# Changelog

All notable changes to Neko will be documented in this file.

> 변경 이력은 사용자·운영 관점의 **의미 있는 변경**만 기록합니다.
> 세부 커밋 단위 변경은 git log와 [`DEVLOG.md`](./DEVLOG.md) 참조.

## [0.3.2.0] - 2026-04-17

### Added
- **Taste Context (페르소나 v1)** — 같은 사용자의 서로 다른 취향 컨텍스트를 분리. 온보딩 픽/시청 반응/seen titles를 컨텍스트별로 분리하고 saved/archived는 글로벌 유지
- 페르소나 드롭다운(로고 옆) + 미니 온보딩 바텀시트
- 페르소나 관리 UI (최대 3개)
- vitest + @testing-library 테스트 인프라 + store-persona 테스트 27개

### Changed
- Storage schema v1 → v2 원자적 마이그레이션
- `WatchReport`에 `contextId?` 추가
- 추천 seed: persona favorites + watchReports만 (saved 제외)

### Fixed
- `<button>` 안의 `<button>` 중첩으로 인한 hydration 에러 → persona 생성 localStorage 쓰기 실패

## [0.3.1.0] - 2026-04-16

### Added
- **Supabase Anonymous Auth** — `signInAnonymously()` + `auth.uid()` 기반 RLS 정책
- 온보딩 픽 Supabase 동기화
- 네이티브 앱(Expo) 본 포팅 — FilterChips / DetailSheet / Profile 화면
- 네이티브 Discover 폴리싱 2차 (배지 플랫화, 3-stop 그라디언트, 탭 immersive, 검색 바텀시트, 3탭 BottomNav)
- PWA 추천 개인화 signal에 `savedCount` 포함 (개인화 임계 21+ → 10+로 하향)

### Changed
- 타입 단일 출처를 `@neq/core`로 고정 — apps는 re-export만
- `recommend.ts` 중복 정의(RecommendFilter, WatchFeedback) 제거
- 로고 "Neko" → **"neq,"** (Fraunces 세리프 텍스트 마크) — 앱 전반 적용

### Removed
- anon key + device_id RLS 정책 5개 (보안 실효성 0, anonymous auth로 대체)
- 네이티브 mock 데이터 (실제 API 전환 완료)

## [0.3.0.0] - 2026-04-15

### Added
- **Quiet Ink 디자인 시스템** — 웜 뉴트럴 + 앰버 골드(#C4A35A) + Fraunces 세리프. Warm Cinema 전면 폐기
- 작품 검색 + OTT 가용성 조회 — Discover 헤더 검색 아이콘 → SearchSheet 바텀시트
- `/api/search/providers` 엔드포인트
- Discover Cold Start 자동 필터 폴백 — 결과 부족 시 년도→origin→OTT 순차 해제
- 되감기 애니메이션 — rAF 기반 VHS 되감기 효과 (RewindOverlay)
- Saved 페이지 OTT 필터 + 그룹핑 뷰
- Turborepo 모노레포 전환 — `apps/web` + `apps/native` + `packages/core` + `packages/design`
- 네이티브(Expo SDK 54) 앱 스캐폴드 + 스와이프 카드 PoC

### Changed
- 추천 엔진 재설계 — favorites(온보딩) 기반 → saved의 loved/good 기반
- Profile "내 취향" → "좋아한 작품" (loved/good 기반으로 재설계)
- 검색 input font-size 16px (iOS 자동 줌 방지)
- SwipeCard 포스터 `object-top` (하단 잘림 방지)

### Removed
- `/onboarding` 필수 진입 제거 — `/` → `/discover` 직접 진입
- `/reset` 페이지 + FirstLoadingScreen — -760줄
- `favorites` 관련 함수 및 `onboarding_*` analytics 이벤트

### Fixed
- Cold start + 좁은 필터 조합 시 빈 결과 안내 개선
- 예능 필터 Reality/Talk 장르 3페이지 수집
- 마지막 카드 무한 루프 (`refreshRecommendations`를 `setTopIdx(0)` 전에 호출)

## [0.2.2.0] - 2026-04-13

### Added
- **시청 리포트 넛지 UX** — Saved 저장 24시간+ 미시청 작품 개별 넛지 카드 + Discover 재진입 토스트
- 년도별 필터 (최근/2010년대/클래식) + 예능 카테고리 (Reality + Talk)
- 4개 analytics 이벤트 — nudge_shown/reported/dismissed, reentry_nudge_shown
- Sentry 에러 모니터링 (`@sentry/nextjs`) — client/server/edge 3개 설정
- 광고 카드 feature flag 기반 설계 (`AD_ENABLED=false`, DAU 10K+ 시 활성화)
- Supabase DB 연동 — profiles/saved_items/watch_reports/seen_titles/archived_items 5개 테이블 + 배치 동기화

### Changed
- **추천 아키텍처 근본 리팩토링** — `loadMore` 완전 제거 → 서버 50개 대량 배치 + 클라이언트 `prefetchNextBatch` (남은 10장 시 트리거)
- **Cold Start 16초 → 4초** — favorites 없는 신규 사용자에게 TMDB trending 직접 반환, LLM 완전 스킵
- TMDB 랜덤 페이지 + 결과 셔플 → 매 호출마다 다른 추천
- immersive 모드 — 탭 시 포스터만 풀스크린, UI 전부 숨김
- 스켈레톤 카드 덱 뒤에 로딩 표시
- Rate limit 60/분으로 완화

### Fixed
- 시리즈 필터 0개 → 크로스타입 보충으로 20개
- reason 10-15자 → 26-33자 (프롬프트 강화)
- 같은 제목 중복 → ID + title 이중 제거
- 무한 loadMore 루프 → exhausted 상태 + 자동 refresh (근본 해결은 리팩토링)
- passive event listener → touch-action: none
- stale closure 3건 (swipingRef, recsRef, prefetchAbortRef)

## [0.2.0.0] - 2026-04-10

### Added
- **프로필 탭 신설** — Discover/Saved/Profile 3탭 구조. backend-ready 아키텍처 (device_id + schema version + UserDataExport)
- **PostHog 측정 인프라** — 22종 이벤트 인스트루먼테이션, `track()` 헬퍼 + `NekoEvent` 타입, `trackedRef` 가드 패턴 (React Strict Mode 이중 실행 방지)
- Cold Start 전용 로딩 메시지 ("요즘 인기 작품을 가져오고 있어요…")
- exclude 목록 50개 → 150개 확장 (중복 방어 강화)
- `topIdx` sessionStorage 저장/복원 (Saved 다녀와도 카드 위치 유지)

### Changed
- **리브랜딩: Neko → neq,** — GitHub 레포, localStorage 키, 컴포넌트명, manifest, 아이콘 전체 교체
- **Anti-slop UI 개선** — 필터 칩 pill → 밑줄 탭, ActionBar 비대칭 배치, 감정별 tint 리액션, border 최소화
- 추천 프롬프트 구조화 — [역할] → [선정 기준] → [제외] → [이유 작성법] → [출력 형식]
- Reason 2~3문장 (핵심 매력 + 취향 연결), 해요체 톤 통일
- 프리페치 — 남은 카드 8장 이하일 때 다음 배치 백그라운드 자동 로드
- Discover 리팩토링 892줄 모놀리스 → SwipeCard/DetailSheet/FilterChips/ActionBar/StatusScreens 분리
- PWA 강화 — Service Worker, 오프라인 폴백, 보안 헤더, 폰트 프리로드
- `handleCardTap`: showWatched 토글 → Detail 열기
- "본 적 있나요?" 오버레이: 아래로 스와이프(드롭다운 패턴)로 호출

### Removed
- Discover 헤더 `1/N` 카운터 + 재설정 버튼 (프로필 탭으로 이관)
- 프로필 내 데이터 백업 UI ("AI가 만든 기능" 느낌, 함수는 store.ts에 보존)

## [0.1.1.0] - 2026-04-09

### Fixed
- localStorage 파싱 실패 시 앱 크래시 방지 — safeParse 래퍼로 모든 JSON.parse 호출 보호
- 필터 빠르게 변경 시 이전 응답이 현재 상태를 덮어쓰는 race condition — AbortController로 stale fetch 취소
- 컴포넌트 unmount 후 setTimeout이 state를 set하는 문제 — 타이머 ref 추적 + cleanup

## [0.1.0.0] - 2026-04-09

### Added
- 커스텀 404 페이지 — Warm Cinema 디자인 시스템 적용, /discover로 복귀 링크
- 스와이프 튜토리얼 오버레이 — 첫 사용자에게 제스처 안내 (패스, 이전 카드, 새로고침)
- API 에러 핸들링 — try/catch + 사용자 친화적 에러 메시지 + 재시도 버튼
- Vercel Analytics 통합 — 페이지뷰 자동 추적
- .env.example 템플릿

### Changed
- 타입 안전성 개선 — `any` 타입을 `Record<string, string>`, `Recommendation`으로 교체
- 튜토리얼 오버레이 DESIGN.md 준수 — 타이포 스케일 정렬, 비대칭 레이아웃, 한글 레이블 통일

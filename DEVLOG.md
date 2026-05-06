# Neko 개발 일지

> 최근 엔트리만 이 파일에 유지합니다. 오래된 기록은 아카이브로 이동했어요.
> - [2026-04 Week 1-2 아카이브](./devlog/archive/2026-04-w1-2.md) — Day 1 ~ Day 10 (2026-04-06 ~ 04-15)
> - 핵심 설계/제품 결정은 [`DECISIONS.md`](./DECISIONS.md)로 분리되어 있습니다.

---


## 2026-05-06 (Day 16)

### 진행 요약
**디자인 핸드오프 v2 통합 → Search UX 통일 → Saved 종합 정리 → 온보딩 6단계 분리.** 약 12일치 누적 작업을 단일 PR(#5, `feat/v2-handoff-search-ux`)로 정리. 사용자 직접 검증 + 즉각 피드백 사이클을 18+회 돌리며 UX 정합성 다듬기. type-check OK, vitest 31 files / 383 tests PASS 일관 유지.

### 완료된 작업

**Search UX 통일 (가장 큰 구조 변경)**
- `/search` 라우트 제거 → BottomNav 4탭 → 3탭 (Discover / Saved / Profile)
- 모든 페이지 헤더 우측 search 버튼 + 자체 SearchSheet 마운트 → 어디서 진입하든 cancel 시 그 페이지로 자연 복귀
- DetailSheet → cast 클릭 시 `detail.closeDetail()` 제거 → DetailSheet 유지하면서 SearchSheet z-stacking 위에 띄움 → cancel 시 detail 그대로 노출
- SearchSheet `mode` prop / page 분기 / openSearch query wiring 모두 롤백 (옵션 검토 후 단일 sheet 패턴 채택)
- 인물 panel 안 작품 → `SelectedWorkPanel` nested 표시 + selectedWork 외 카드 dim 0.35 + 작품 카드 row 단위 panel 끼움 (CSS Grid `gridColumn: 1 / -1`)
- DetailSheet 호출에 `isSaved` / `onToggleSave` (toast undo) / `onShare` prop 누락 보강 → save 버튼 정상 노출 (이전엔 prop 가드로 미렌더 회귀)
- `lib/share.ts` 신규 — `navigator.share` + clipboard 폴백 통합

**헤더 일관성 (3탭 구조)**
- Saved/Profile 헤더 padding `pt-6 pb-2` → `h-12` (Discover 와 동일 height 48px)
- H1 fontSize 32 → 20 (이전엔 14→18→20 사용자 직접 검증으로 단계 조정), weight 600
- Saved 헤더 가운데에 Grid·List·Preview 3-way segmented 토글 (button w-11 h-11, segmented padding 1 + border 1 = 정확히 h-12 fit)
- OTT별 보기 underline 토글을 VIEW_FILTERS row 우측 끝에 통합 (단독 줄 제거)

**Saved 종합 정리**
- Progress bar 영역 (저장 N편 / N편 남음) 제거 — 필터 탭으로 정보 확인 가능
- 시청 리포트 stats card: `viewFilter === "watched" || "archived"` 한정 노출
- "오늘 뭐 볼까" banner: `viewFilter === "all" || "unwatched"` 한정 노출 (탐색 vs 회고 컨텍스트 분리)
- `filteredSaved` 정렬 제거 — 봤어요 토글 시 위치 이동 불편 해결
- `dropped` 라벨 "포기했어" → "안 맞았어" 통일 (REACTIONS + stats 표시 양쪽)
- saved 삭제 toast undo 동선 — rec + 시청 리포트 보존 후 복원
- 빈 상태 안내 분기 세분화 (all / unwatched / watched / archived 별 적합 메시지)

**Saved Preview 모드 (신규 viewMode)**
- Coverflow 패턴: 큰 hero (포스터 비율 `object-contain`) + 하단 가로 스크롤 카드들 (히스토리 패턴)
- hero 우측상단 "봤어요?" reaction 진입 + reporting overlay (PosterCard 패턴 재사용)
- `selectedPreviewId` state 자동 보정 effect — ottFilter/viewFilter 변경 시 첫 작품으로 fallback
- preview 활성 시 `groupByOTT` 자동 OFF + OTT 토글 hide
- scroll wrapper에 `flex flex-col` 추가 → hero `flex-1` height 0 회귀 fix

**Saved OTT 그룹 정밀화**
- 다중 OTT 분류 (한 작품 여러 OTT 그룹 중복 노출) — "맨 앞 OTT 만 분류" 모호함 해결
- 빈 그룹 placeholder ("이 OTT에는 저장된 작품이 없어요")
- ottFilter 활성 시 단일 그룹만 노출 + 자동 `groupByOTT` 해제

**Saved 그리드 mason packing**
- CSS columns (`columnCount: 2`) + PosterCard `breakInside: avoid` + `marginBottom: 12px`
- height 240/200 변형 시각 효과 유지하면서 좌-우 빈 row 공간을 위로 자연 packing

**Saved archive 동선 강화**
- archive 버튼 ✓/↩ 텍스트 → `IconArchive` SVG (위 뚜껑 + 박스, 시청 ✓와 시각 구분)
- 토글 노출 조건 `report` → `(report || isArchived)` — archived 자체로 unarchive 가능
- 기본 그리드 PosterCard에 `isArchived` / `onArchiveToggle` prop 누락 보강

**DetailSheet save 가시성**
- isSaved 색상 `--accent-dim` (12% alpha, 면 거의 안 보임) → `--surface-raised` (solid) + `--accent-border` + accent text
- SelectedWorkPanel save 버튼도 동일 패턴 통일 (toast undo 포함)

**데이터 초기화 cloud wipe**
- `lib/sync.ts` `wipeCloudData` 신규 — `saved_items` / `watch_reports` / `seen_titles` / `archived_items` / `profiles.onboarding_picks·account_prefs` 모두 비움
- 이전엔 `clearAllUserData` 가 localStorage 만 비우고 다음 sync 가 cloud 에서 끌어와 회귀 (사용자 직접 보고)

**온보딩 V1 정리 + 6단계 분리**
- V1 흐름 폐기 (`apps/web/src/app/onboarding/page.tsx` 363→10 줄, `isOnboardingV2Enabled` flag + `sync.ts` v2Enabled 분기 모두 제거)
- 픽 자동 archive 처리 (V1+V2 양쪽) — saved 메인 노출 X, archived 탭 한정. `archiveItem` 을 `fetch` 전 미리 호출 → race condition 회피
- 3단계 (taste 단일) → **3-1 Genre + 3-2 Taste** 로 분리. 총 6단계
  - **Genre 신규**: `flex flex-wrap` 동그란 chip + 갯수 자유 (최소 1개), `account_prefs.tasteGenres` 즉시 저장
  - **Taste 변형**: 선택 작품 + 검색 input sticky 분리 / 카로셀 영역만 스크롤 / 장르별 추천 카로셀 (`/api/tmdb/by-genre` 신규 엔드포인트)
- `GENRE_CHIPS` 에 `tmdbMovieId` 매핑 (15종, variety 만 null)
- `STEP_LABELS` 6단계 (welcome → hello → genre → taste → ott → notify)

**OTT 단계 favicon 적용**
- 기존 short text 박스 → `getOTTIcon` favicon 이미지 (Netflix/TVING/wavve/Watcha/Disney+/Apple TV+/Coupang Play)
- `OTT_ICON_LOOKUP` 매핑 (data.ts id → providers 객체 키 차이 보정)

**.gitignore + 정리**
- root 디버그용 스크린샷 81개 삭제 + `.gitignore` 패턴 추가 (`/*.png`, `/*.jpg`, `/*.jpeg`, `/*.zip`)

### 주요 결정

- **Search 모달 단일 패턴 (옵션 Y)**: BottomNav search 탭은 layout flow에 두지 않고 각 페이지 자체 SearchSheet 마운트. cancel 시 그 페이지 컨텍스트 보존이 사용자 의도. `/search` 라우트 자체는 페이지답게 동작하기 어려워 (modal sheet UX와 페이지 정합성 충돌) 폐기.
- **3탭 BottomNav**: 처음 3탭→4탭→3탭 사이클 후 안착. 4탭 search는 modal 인지가 약했음. 헤더 search 버튼 단일 entrypoint로 단순화.
- **CSS columns mason packing**: 사용자 요청은 "빈 공간을 자연스럽게 위로 밀어 올림" — JS 라이브러리 없이 CSS columns로 충족. 카드 순서가 column-by-column 으로 약간 변경되지만 시각 효과 우선.
- **온보딩 6단계 분리**: Genre + Taste 2단계로 나누면 단계당 인지 부담 ↓, 추천 카로셀 컨텍스트 명확. variety 장르는 TMDB movie 카테고리 미존재 → 카로셀 빈 처리.
- **Preview 모드 단일 hero**: groupByOTT 와 충돌해 자동 OFF. 정보 밀도는 낮아지지만 사용자 명시 요청 (Coverflow 패턴).

### 영향 / 다음 단계

- 다음 단계 백로그
  - Saved DetailSheet hero morph (Discover만 적용된 morph를 Saved 에도)
  - Discover hero morph P1 정량 정렬 (현재 translateY only → 좌표 measure)
  - DESIGN.md Decisions Log 정리 (이번 사이클 누적 예외 4건)
  - immersive dead code 청소 (사용자 결정 — 보류, 추후 재사용 가능성)

- PR #5 (`feat/v2-handoff-search-ux`) 머지 대기 — 3개 커밋 누적 (`c378984` / `3ec16ea` / `980d79f`)


## 2026-04-24 (Day 15)

### 진행 요약
**TMDB 미러 Phase 1 완성.** `/api/recommend` enrich 단계(4.8~12.3s) 병목 해소를 위한 자체 카탈로그 미러 구축. Vercel Hobby 10초 제약으로 Vercel cron → **GitHub Actions로 이전**. Supabase 500MB 한도 대응으로 `popularity≥1.0` 필터 도입. 메인/보조 세션 병렬 작업으로 Open Questions 6개 해소 + Phase 2 초안 사전 준비.

### 완료된 작업

**TMDB 미러 Phase 1 (커밋 5개)**
- `supabase/migrations/20260424_tmdb_mirror.sql` — `tmdb_catalog`, `tmdb_metadata`, `tmdb_crawl_queue` + `pg_trgm` + RLS. 멱등 ALTER 패턴
- `scripts/tmdb-catalog-sync.ts` — Daily ID Export 스트리밍 gunzip + popularity 필터 + 1000건 배치 upsert + 2-step soft delete
- `.github/workflows/tmdb-catalog-sync.yml` — 매일 08:00 UTC + workflow_dispatch
- `apps/web/src/lib/supabase-admin.ts` — service_role 싱글톤 (Phase 2 대기)
- 스키마 후속 3회 반영: `providers_fetched_at`(Q5), `poster_path`/`backdrop_path`(mapping-validation)

**실측 검증 (GitHub Actions 4회 실행)**
- 1.4M → 98K active + 1.3M soft-deleted (`popularity<1.0` 자동 정리)
- movie 45.6K + tv 52.4K = 98,057 active 레코드
- 정상 운영 시 일일 duration 1~2분 예상

**Prod 스모크 테스트 3건**
- `/api/recommend` warm latency 7.85~9.67s (p95 ≤10s 간신히 충족), **cold start 20s 관찰**
- Profile 페이지 TMDB Attribution 문구 정상 렌더 (`prod-profile-attribution.png`)
- Bridge → Discover 전환 정상, CoachMark dismiss flag(`neq_coach_swipe_done`) 저장 확인

**정리 작업**
- `apps/web/vercel.json` 삭제 (Vercel cron 폐기)
- 루트 Playwright 스크린샷 5개 삭제
- `turbo.json` env에 `CRON_SECRET` 추가
- 프로젝트 메모리에 TMDB 라이선스 제약 저장 (`project_tmdb_license.md`)

### 주요 결정

| 항목 | 결정 | 근거 |
|------|------|------|
| catalog-sync 실행 환경 | Vercel cron → **GitHub Actions** | Hobby 10초 한도 · 로컬 실측 279s |
| popularity 필터 | `≥1.0` | Supabase 무료 500MB 장기 여유 (catalog ~12MB + metadata 160MB + pgvector 78MB = 250MB) |
| Phase 4 pgvector 차원 | **256** (1536 → 축소) | Supabase 500MB 내 유지 |
| soft delete 구조 | **2-step SELECT+UPDATE IN + LIMIT 5000** | PostgREST UPDATE의 LIMIT가 SQL에 안 내려가 60s timeout 발생 |
| poster/backdrop 저장 | `path`만 저장 (prefix는 읽기 시) | recommend.ts w500 / share w1280 크기별 URL 동적 생성 필요 |
| 초기 bulk 실행 환경 | GitHub Actions (Phase 2) | 로컬 2.2h 대비 CI 재현성 |
| Supabase 플랜 | 무료 유지 | popularity 필터 + pgvector 차원 축소로 한도 내 |

### 배운 점

**PostgREST `.update().limit()` 함정**
- `.update().limit(N)`을 쓰면 SQL에 LIMIT이 안 내려가고 서버가 전체 UPDATE 시도 → `canceling statement due to statement timeout`
- 해결: SELECT로 `LIMIT` 적용해 id 목록을 확보한 뒤 `UPDATE ... WHERE id IN (...)` 2-step
- PostgREST UPDATE LIMIT은 문서상 지원이지만 실측에서 안정성 낮음

**TMDB Daily ID Export는 API Key 불필요 + 공개 공식 경로**
- `files.tmdb.org/p/exports/` 공개 gzip. 약관상 의도된 사용법
- catalog는 "어떤 ID가 존재하는지" 인덱스용이고, detail 크롤은 Phase 2부터

**Supabase RLS + service_role의 단순한 패턴**
- RLS enable만 걸고 정책 없음 → service_role 전용 (anon/authenticated 완전 차단)
- `SUPABASE_SERVICE_ROLE_KEY`는 서버 전용 싱글톤으로 분리

**병렬 세션의 가치**
- 보조 세션이 Phase 2 초안(`_workspace/phase2-draft/`) + `mapping-validation.md`를 선행 작성
- 메인 세션이 Phase 1 검증하는 동안 블로커 3건 조기 발견 (poster_path, vercel.json 중복, providers_fetched_at)

### 남은 과제

- [ ] **사용자 조치**: Supabase Dashboard SQL Editor에서 `20260424_tmdb_mirror.sql` 재실행 (providers_fetched_at + poster_path/backdrop_path 반영). 멱등 ALTER라 안전
- [ ] Phase 2 착수 — `_workspace/phase2-draft/` 초안 기반으로 bulk-crawl + 98K metadata 적재
- [ ] `/api/recommend` cold start 20초 개선 검토 (Vercel function cold start 문제)
- [ ] CoachMark 오버레이 UI 자체 스크린샷 재검증 (localStorage 조작 + 즉시 캡처)
- [ ] 어제 배포분 데이터 2~3일 누적 후 p50/p90 · providers_count 분포 분석

### 배포 상태

커밋 5건 main 푸시 완료:
```
f8f560c fix(tmdb-mirror): tmdb_metadata에 poster_path/backdrop_path 원본 저장
67a2b35 fix(tmdb-mirror): soft delete MAX_ITERATIONS 1500 + 도달 시 경고 로그
f590209 fix(tmdb-mirror): soft delete를 2-step SELECT+UPDATE IN으로 전환
fb10418 fix(tmdb-mirror): soft delete 배치 루프 + Actions timeout 30분
4f8de2b feat(tmdb-mirror): Phase 1 — Daily ID Export 카탈로그 미러
```

---


## 2026-04-23 (Day 14)

### 진행 요약
문서 정리 + 릴리스 이력 회고 정리. 사용자 지표를 PostHog에서 직접 확인하여 **암묵적 릴리스가 이미 발생했음**을 확인. VERSION을 0.1.1.0 → **0.3.2.0**으로 맞춤. DEVLOG 분할, DECISIONS.md 신설, CHANGELOG 재개.

### 완료된 작업

**문서 구조 재편**
- `DEVLOG.md` 1619줄 → 482줄 — Day 11~13만 유지
- `devlog/archive/2026-04-w1-2.md` 신설 (1152줄) — Day 1~10 이관
- `DECISIONS.md` 신설 (172줄) — 20개 핵심 설계 결정을 ADR 스타일로 정리
  - Product/UX 4건, Recommendation 4건, Client 3건, Design 3건, Data/Infra 4건, Native 2건
  - Appendix에 기각된 9개 대안 + 사유
- `CHANGELOG.md` 재개 — 0.2.0.0 ~ 0.3.2.0 까지 5개 릴리스 회고 롤업

**M9 달성 확인 (PostHog 직접 조회)**
- `scripts/watch-events.sh` 패턴 재사용 + HogQL 쿼리로 숫자 확인
- 고유 사용자: 19명 (첫 이벤트 2026-04-10, Day 7 PostHog 통합 직후부터)
- 누적 이벤트: 2,325건
- **헤비 리텐션 5명** (100+ events, 6-10일 활동 span)
- 외부 사용자 유입 시작: **2026-04-16 전후** (DAU 1→6 점프)
- 피크: 2026-04-17 DAU 9명
- 현재(오늘) DAU 7명 — 지속 유입 중

**VERSION 0.1.1.0 → 0.3.2.0**
- Day 5 이후 VERSION 방치 상태였음 — 실제 코드는 0.3.2 수준까지 진행
- 실사용자 보유 확인(19명) → "암묵적 릴리스 이미 발생" 프레임으로 전환
- CHANGELOG 회고 롤업을 현실 반영으로 정당화 → VERSION도 현재 릴리스 버전으로 갱신

### 주요 결정

| 항목 | 결정 | 근거 |
|------|------|------|
| DEVLOG 관리 | 최근 엔트리만 유지 + 월별 아카이브 | 1600+줄은 LLM 컨텍스트 비용 과다 |
| DECISIONS 분리 | 설계 결정은 별도 문서 | 휘발성(일지) vs 지속성(결정) 분리 |
| VERSION 갱신 | 현재 상태 반영 (0.3.2.0) | 사용자 실유입 확인 → 릴리스 존재 |
| CHANGELOG 구조 | 회고 롤업 5개 릴리스 | [Unreleased] 대비 현실과 정렬 |

### 배운 점

**"릴리스는 태깅 행위가 아니라 사용자 도달 순간"**
- 태그·CHANGELOG·VERSION이 없어도 사용자가 쓰고 있으면 **릴리스는 이미 일어난 것**
- 문서가 현실을 반영하지 않으면 다음 의사결정이 왜곡됨 (오늘 "[Unreleased]로 두자" 제안이 잘못될 뻔했던 이유)
- 실제 숫자를 보고 프레임을 수정하는 규율이 중요 — 본인 감각이 틀릴 수 있음

**문서 분리의 LLM 컨텍스트 효과**
- 1619줄 DEVLOG → 매 `retro`/`document-release` 스킬 실행 시 토큰 낭비
- 482줄 DEVLOG + 172줄 DECISIONS로 분리 → 평균 참조 비용 절감
- 아카이브는 접근 빈도 낮으므로 원본 그대로 보존 (요약 금지)

### 남은 과제
- [ ] 오늘 메인 세션 작업(커밋 4개: telemetry + detail_opened + 썸네일 로딩 + swipe up)에 대한 Playwright 검증
- [ ] 네이티브 앱에 DEVLOG/DECISIONS 변경 영향 없는지 확인 (문서만 변경이므로 영향 없을 예정)
- [ ] DEVLOG 월 단위 아카이브 정책 (매월 말 자동화할지, 수동 유지할지)

---


## 2026-04-17 (Day 13)

### 진행 요약
**Taste Context (페르소나 v1)** 기획부터 구현까지 한 세션에 완료. 같은 사용자의 다른 취향 컨텍스트(영화 vs 예능 vs 시리즈)를 분리하여 추천 품질 개선. 기존 "전체 초기화 후 재온보딩" 워크어라운드를 해결.

풀 파이프라인: office-hours(기획) → plan-eng-review(아키텍처) → plan-design-review(UI) → neko-orchestrator(구현) → investigate(버그 수정) → ship(배포).

### 완료된 작업

**페르소나 기능 기획 (/office-hours)**
- "같은 사람의 다른 취향 컨텍스트" 프레이밍 확립 (Netflix 멀티프로필과 차별화)
- Codex second opinion: saved는 글로벌 유지, 온보딩 픽/시청 반응만 분리
- 디자인 문서 작성 + adversarial review 2라운드 (8.5/10)

**아키텍처 리뷰 (/plan-eng-review)**
- 10개 이슈 발견 + 전부 해결. Codex outside voice가 결정적:
  - sync.ts 충돌 발견 → push/pull 모두 default persona only 가드
  - saved 누수 → seed에서 saved 제외, exclude에만 유지
  - 키 분리 → 단일 blob으로 재결정 (데이터 소량, 간단+안전)
  - 반응형 모델 → PersonaContext + Provider 도입
  - 파일 범위 6→10개로 확장 (sync, routing, saved 추가)

**디자인 리뷰 (/plan-design-review)**
- 초기 4/10 → 최종 8/10. 7개 차원 리뷰
- UI 패턴: Dropdown (로고 옆), 미니 온보딩 바텀시트
- DESIGN.md(Quiet Ink) 토큰 매핑 완료
- 목업 3종 생성 (gstack designer)

**구현 (/neko-orchestrator + frontend-builder)**
- `packages/core/src/types.ts`: WatchReport.contextId?, Persona 인터페이스, schema v2
- `apps/web/src/lib/store.ts`: persona CRUD, v1→v2 원자적 마이그레이션, export/import v2
- `apps/web/src/contexts/PersonaContext.tsx`: React Context + Provider
- `apps/web/src/hooks/useRecommendations.ts`: seed = persona favorites + reports만
- `apps/web/src/app/discover/page.tsx`: 헤더 드롭다운 전환기
- `apps/web/src/app/profile/page.tsx`: 페르소나 관리 + 미니 온보딩 바텀시트
- `apps/web/src/app/onboarding/page.tsx`: 첫 persona 생성
- `apps/web/src/lib/sync.ts`: default persona only push/pull 가드
- UX 리뷰: CRITICAL 1 + HIGH 2 수정 (터치 타겟, anti-slop 그리드, 바텀시트 임계값)
- QA 리뷰: sync push 가드 추가, loadRecs 중복 호출 제거

**테스트 인프라 (vitest)**
- vitest 세팅 + store-persona 테스트 27개 전부 통과
- 커버리지: 마이그레이션 (v1→v2, 멱등성, 빈 상태), CRUD (생성, 전환, 삭제, 최대3개), 데이터 격리, 글로벌 유지, export/import, hasOnboarded

**버그 수정 (/investigate)**
- `<button>` 안에 `<button>` 중첩 → hydration 에러 → createPersona localStorage 쓰기 실패
- 수정: 외부 `<button>`을 `<div role="button">`으로 변경

### 주요 결정
| 결정 | 값 | 근거 |
|------|---|------|
| Storage | 단일 blob (neq_personas) | Codex: 데이터 소량, 간단+안전 |
| saved | 글로벌 유지 | Codex 도전 채택: 한 곳에서 전체 보기 |
| Seed | persona only, saved 제외 | persona 간 추천 누수 방지 |
| Sync | default only | Supabase 스키마 변경 없이 v1 제한 |
| UI | Dropdown (로고 옆) | 공간 절약, 필터칩과 비경쟁 |
| Reactivity | PersonaContext | localStorage만으로 재렌더링 불가 |

### 기술 스택 변경
- vitest + @testing-library/react + jsdom 추가
- PersonaContext (React Context) 신규

### 남은 과제
- Supabase 스키마 확장 (persona별 동기화, v2)
- 네이티브 앱 persona 포팅
- 페르소나 삭제 기능 (v1에서는 최대 3개 제한으로 충분)
- 아바타/성격 태그 (Full Persona, Approach B)

---

## 2026-04-16 (Day 12)

### 진행 요약
**병렬 세션:** 타입 drift 제거 + Supabase anonymous auth + 네이티브 본 포팅 (FilterChips → DetailSheet → Profile) + Discover 일괄 폴리싱 2차. 공유 레이어·이중 UI 작업의 경계를 문서화하고 피드백 처리 프로세스 확립.

**메인 세션:** Vercel 배포/PostHog 복구 + Supabase 동기화 3건 복합 원인 진단 → 복구 완료 + 온보딩 픽 Supabase 동기화 추가. 실사용자 이벤트·저장 데이터 정상 수집 경로 확보.

두 세션이 각자 영역에서 main 브랜치 직접 커밋, 충돌 없음.

### 완료된 작업

**타입 drift 제거 (`eee9821`)**
- `apps/web/src/lib/types.ts` 로컬 정의 전부 삭제 → `@neq/core` re-export
- `recommend.ts`에 중복 정의된 `RecommendFilter`/`WatchFeedback` 제거
- `@neq/core/types.ts`에 web 기준 필수 필드 반영 (`director`, `cast`, `runtime`, `seasons`, `country`, `backdrop` — 웹은 필수 타입이므로)
- `UserDataExport`, `TMDBResult`, `USER_DATA_SCHEMA_VERSION` core로 이관
- `apps/native/lib/mock.ts` 삭제 (실제 API 전환 완료)

**Supabase anonymous auth (`508f937`)**
- `apps/web/src/lib/supabase.ts`에 `ensureAuth()` + `getAuthUid()` 추가
  - 세션 없으면 `signInAnonymously()` 자동 호출, 싱글톤 Promise로 동시성 처리
- `sync.ts` `getOrCreateProfile()` 3단계:
  1. `auth.uid()`로 프로필 조회 → 있으면 반환
  2. 기존 `device_id` 프로필에 `user_id` 연결 (마이그레이션)
  3. 둘 다 없으면 신규 생성
- `supabase/002_anonymous_auth.sql`
  - `profiles.user_id uuid REFERENCES auth.users(id) UNIQUE`
  - anon 전면 허용 5개 정책 삭제
  - `auth.uid()` 기반 5개 테이블 RLS 신규 정책
- Supabase 대시보드에서 Anonymous Sign-Ins 활성화 + SQL 실행 완료

**네이티브 본 포팅 (Phase 3)**
- `FilterChips` (`0790eac`): 4칩 드롭다운, API 필터 매핑
  - `@neq/core`에 `discover.ts` 이관 (`FilterType/Origin/Year`, `OTT_OPTIONS`, 라벨)
- `DetailSheet` (`74cc247`): 바텀시트 + Pan 드래그 닫기 + OTT 열기 + Share
  - 탭 = 시트 오픈 (→ 폴리싱 2차에서 **포스터 immersive**로 변경)
- `Profile` (`4f8df1e`): 좋아한 작품 / 시청 기록 / 초기화 / 앱 정보
  - `apps/native/lib/store.ts`에 `getWatchReports`, `addWatchReport`, `getWatchStats`, `getDeviceId`, `clearAllUserData` 추가
  - `expo-crypto` 의존성

**Discover 일괄 폴리싱 1차 (`ea3933f`)**
- 메타 라인 (국가·연도·시간 + OTT 아이콘)
- ActionBar (Share + Refresh + Save)
- TutorialOverlay (첫 3장 힌트)
- 빈 상태 메시지 분기
- `@neq/core`에 `ott.ts` + `country.ts` 이관

**Discover 일괄 폴리싱 2차 (`a0085fa` + `4776b0e`)**
- 사용자 피드백 6건 반영:
  - 로고: "Neko" → **neq,** (Fraunces)
  - 카운터 제거
  - 폰트: `@expo-google-fonts/fraunces + outfit` + `useFonts` + SplashScreen 제어
  - 배지 플랫화 (둥근 pill → 텍스트 + textShadow)
  - 3-stop LinearGradient 적용
  - 탭 = **포스터 immersive** (DetailSheet는 ⓘ 버튼으로만)
  - ActionBar 4+1 (⟲ ⤴ ⓘ ⟳ + ♥)
  - BottomNav 4탭 → 3탭 + 아이콘 (발견/저장/프로필)
  - Search 탭 제거 → 우상단 ⌕ → `SearchSheet` 바텀시트
  - TutorialOverlay 스타일 약화
- `packages/design/tokens.ts`에 `fonts` 상수 추가

**공유 레이어/이중 UI 경계 문서화**
- `_workspace/feedback-intake.md`: 피드백 라벨링 템플릿 (`[data]/[core]/[design]/[ui-web]/[ui-native]/[ui-both]/[infra]`)
- `_workspace/feedback-log.md`: 시간순 피드백 로그 (빈 상태에서 시작)
- 원칙: 데이터/로직/토큰은 자동 공유, UI 렌더링만 이중 작업
- 반복 `[ui-both]` 3회 이상 패턴 시 `packages/core/hooks/*` 로 headless 훅 추출 검토 (옵션 A, 지금은 C)

### 격차 인식 — 정직한 parity 추정

Discover 기준:
- 구조/레이아웃: ~70%
- 시각 디테일 (아이콘·간격·shadow): ~45%
- 다른 화면 (Saved/Profile/DetailSheet/SearchSheet): 40-55%
- 인터랙션/애니메이션: 미측정
- **전체 체감: 55-65%**

완전 픽셀 일치는 ROI 낮음. 실사용 피드백 받으며 점진 개선하기로 결정.

### 결정 이력

| 항목 | 결정 | 근거 |
|------|------|------|
| 검색 접근 | 탭 제거 → 우상단 ⌕ → 바텀시트 | 웹 parity |
| 카드 탭 | 포스터 immersive | 웹 동작 일치, DetailSheet는 ⓘ로 |
| 공유 전략 | 옵션 C (현재 구조 유지 + 라벨링) | 성급한 훅 추출 회피, 3회+ 반복 시 재검토 |
| 아이콘 | 유니코드 문자 | SVG 포팅 보류, ROI 낮음 |
| Pretendard | 시스템 폰트 폴백 | iOS 기본 한글 폰트로 충분 |

**PWA 피드백 기반 추천 로직 수정 (`332685b`)**
- 문제: saved 많이 해도 watchReport 없으면 영영 "탐색" 모드 — 취향 반영 체감 안 됨
- 원인: `totalFeedback` 만으로 모드 판정. saved는 signal로 안 썼음.
- 수정:
  - `totalSignal = totalFeedback + savedCount` 로 변경
  - 임계치 cold start 50개 대비 반응률 기준 재조정:
    - `≤4` 탐색 (반응률 ≤8%)
    - `5~9` 혼합 (반응률 10~18%)
    - `≥10` 개인화 (반응률 20%+)
  - 이전 21+ → 10+ 로 하향. saved 10만 해도 개인화 진입
- 레이어: recommend.ts / route.ts / useRecommendations.ts / @neq/core/api.ts / 네이티브 index.tsx

### 커밋 & 배포

| SHA | 내용 |
|-----|------|
| `eee9821` | 타입 단일 출처 — @neq/core re-export |
| `508f937` | Supabase anonymous auth + RLS |
| `0790eac` | FilterChips 포팅 + API 필터 |
| `74cc247` | DetailSheet 포팅 |
| `4f8df1e` | Profile 화면 + 4번째 탭 |
| `ea3933f` | Discover 폴리싱 1차 (메타/OTT/ActionBar/Tutorial/빈상태) |
| `a0085fa` | Discover 폴리싱 2-1차 (로고/폰트/배지/그라디언트) |
| `4776b0e` | Discover 폴리싱 2-2차 (검색/ActionBar/BottomNav) |
| `332685b` | saved 누적도 큐레이션 모드 signal로 포함 |

### 남은 작업

- [ ] 취향 단계 인디케이터 UI (Profile 또는 Discover 힌트) — **내일 #2**
- [ ] 필터별 exclude 캐시 재검토 (실재 여부 조사 후 판단) — **내일 #3**
- [ ] 다른 화면 개별 폴리싱 (Saved Pinterest grid, Profile chip style, DetailSheet backdrop 등)
- [ ] SVG 아이콘 포팅 (react-native-svg, 웹 Icons 컴포넌트 번역)
- [ ] EAS Build + TestFlight
- [ ] PostHog 실사용자 피드백 수신 → `_workspace/feedback-log.md` 기록 → 처리
- [ ] 반복 `[ui-both]` 패턴 3회+ 시 headless 훅 추출 검토

### 추천 엔진 동작 (오늘 명확히 문서화)

Cold start → 취향 반영 전환 흐름:

1. **Cold start** (`favorites.length === 0`)
   - `getColdStartRecommendations()` 빠른 경로 (TMDB trending, LLM 스킵, 3-5초)
   - 장르별 메가히트 50개, variety는 Reality+Talk 3페이지

2. **LLM 큐레이션 모드 분기** (`totalSignal = feedback + savedCount` 기준)
   - `≤4` 탐색 70% / 취향 30%
   - `5~9` 혼합 50/50
   - `≥10` 개인화 70% + 30%는 의외성 필수

3. **클라이언트 페이로드**
   - `favorites` (loved/good 우선 + saved, max 20)
   - `feedback` (WatchReport 있을 때만)
   - `exclude` (seenTitles ∪ savedTitles, max 150)
   - `savedCount` (saved 총 개수 — 신규)
   - `filter` (UI 필터)

4. **서버 파이프라인** (favorites 있을 때)
   - TMDB 검색 → /recommendations 병합 → 메타 풍부화 → 필터링
   - LLM 큐레이션 (모드별, 20개 pick + 한글 reason)
   - 나머지 30개 template fallback → 총 50개 반환

### 회고

- **"폴리싱 완료" 조기 선언 반복**: 1차에서도 그랬고 사용자 지적으로 2차 진행. 체계적 diff 없이 눈에 띈 것만 고치는 버릇 — 이후엔 웹/네이티브 나란히 비교를 전제로.
- **공유 레이어의 실체**: 데이터·로직·토큰·타입은 공유. UI는 이중. 이를 문서화해서 피드백 처리 흐름을 정리한 게 오늘 가장 큰 소득.
- **PostHog 복구**: API key 누락 2시간 전 해결. 앞으로 실제 피드백 관찰 모드.
- **추천 모드 시그널 공백**: "saved 많이 했는데 취향 반영 안 됨" 잠재 피드백 예측 → 즉시 수정. 세션 끝에 원인 진단 + 수정 한 번에 들어간 좋은 예.

---

## 2026-04-16 (Day 12) — 메인 세션 작업

### 세션 맥락

- 주 작업자: 메인 세션
- 병렬 세션: 다른 quick fix 진행 (온보딩 화면 복원 `4e29181` 포함)
- 두 세션 모두 main 브랜치에 직접 커밋, 영역 겹치지 않음

### 완료된 작업

**1. Vercel 배포 + PostHog 복구**

문제:
- 공유한 5명 중 PostHog 대시보드에 프로덕션 이벤트 0건
- 로컬 개발 이벤트 871건만 축적

진단:
- 프로덕션 JS 번들 13개 chunk 전수 스캔 → PostHog 키(phc_*) 미포함
- `PostHogProvider.tsx`에 `if (!key) return` 가드 있어서 init 자체가 스킵됨
- 원인 확정: Vercel 프로덕션 env에 `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` 누락

수정:
- james님이 Vercel Dashboard에 env var 추가 + 재배포
- 배포 후 아이폰 Safari 테스트 이벤트 정상 수신 확인
- `neko-ecru.vercel.app` 호스트로 `card_swiped` / `card_saved` 찍히기 시작

**2. Supabase 동기화 복구 (가장 긴 세션)**

문제:
- PostHog엔 `card_saved` 이벤트 12건 있는데 Supabase `saved_items`는 0건
- 저장 데이터가 Supabase에 전혀 반영 안 됨
- 어제(Day 10) 있던 테스트 데이터도 사라져 있음

복합 원인 3가지 발견:

원인 A — RLS 정책 누락
- 어제 적용한 `supabase/policies.sql`이 사라져 있음 (병렬 세션의 스키마 변경 중 소실 추정)
- 직접 curl로 profile insert 시도 → "new row violates row-level security policy" 에러
- anon key 직접 접근 경로가 막힘

원인 B — Supabase Anonymous Sign-ins 비활성화
- 병렬 세션이 방향 B(Supabase anonymous auth, 커밋 `508f937`) 구현했지만
- Supabase 프로젝트 레벨에서 Anonymous Sign-ins이 disabled 상태
- `signInAnonymously()` 호출 시 422 `anonymous_provider_disabled` 에러
- `getAuthUid()` → null → `getOrCreateProfile()` → null → insert 시도 자체 안 함
- 에러는 `console.error`에만 찍혀 관측 불가

원인 C — 역할 불일치
- 기존 `policies.sql`은 `FOR ALL TO anon` 만 커버
- `signInAnonymously` 성공 시 유저는 `authenticated` 역할로 전환
- authenticated 역할용 정책 부재로 모든 insert 차단

수정:
- `supabase/policies.sql` 업데이트: `FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)`
  5개 테이블 전부 (profiles, saved_items, watch_reports, seen_titles, archived_items)
- james님이 Supabase Dashboard → Authentication → Providers에서 Anonymous Sign-ins 활성화
- SQL Editor에서 업데이트된 `policies.sql` 재적용
- `apps/web/src/hooks/useSync.ts` 안정화:
  - pagehide 이벤트 리스너 추가 (iOS Safari tab close 대응)
  - visibilitychange + pagehide 둘 다 onHide 호출
  - 중복 push 방지 ref guard (`pushingOnHide`)
  - 에러 시 `Sentry.captureException` / `captureMessage` 연결
- `apps/web/src/lib/sync.ts` 개선:
  - Sentry import 추가
  - `getOrCreateProfile` 에러 → `Sentry.captureMessage`
  - `pushToServer` catch → `Sentry.captureException`
  - `pullFromServer` catch → `Sentry.captureException`
- `scripts/watch-events.sh` 패치:
  - 모노레포 전환으로 `.env.local` 위치 변경 (`apps/web/.env.local`) 대응
  - macOS에 `tac` 없어서 `tail -r`로 교체

E2E 검증:
- curl로 전체 플로우 확인: signup 201 → token 발급 → profile insert 201 → saved_items insert 201 → cleanup 204
- 주요 커밋: `1b50021`

**3. 온보딩 픽 Supabase 동기화 추가**

문제:
- 병렬 세션이 복원한 온보딩 기능(커밋 `4e29181`)의 결과가 localStorage에만 저장
- `neq_favorites`, `neq_favorites_meta` 키로 저장되지만 `sync.ts`는 이걸 업로드 안 함
- 재설치 / localStorage 클리어 시 온보딩 결과 소실
- 추천 엔진 핵심 시드인데 백업 없음

설계 선택 (방법 A~C 중):
- 방법 A: `profiles`에 `onboarding_picks` JSON 컬럼 (채택)
- 방법 B: 별도 `onboarding_picks` 테이블 (과함)
- 방법 C: `saved_items`에 source 컬럼 (개념 혼선)
- 방법 A가 1회성 데이터 성격에 맞고 스키마 변경 최소

수정:
- `supabase/migrations/20260416_onboarding_picks.sql` 생성
  - `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_picks JSONB`
- `sync.ts` `pushToServer`에 5단계 추가:
  - `getFavoritesMeta()` → `profiles.onboarding_picks` UPDATE
- `sync.ts` `pullFromServer`에 4단계 추가:
  - 로컬 비어있을 때만 서버에서 복원 (덮어쓰기 방지)
  - `setFavoritesMeta` + `setFavorites` 양쪽 복원
- james님이 Dashboard에서 마이그레이션 SQL 실행

E2E 검증:
- signup → profile insert → picks UPDATE 200 → 읽기 정상 → cleanup 204
- 주요 커밋: `a5ba438`

### 주요 커밋 (메인 세션)

| SHA | 내용 |
|-----|------|
| `a5ba438` | feat(sync): 온보딩 픽 Supabase 동기화 — profiles.onboarding_picks JSON 컬럼 |
| `1b50021` | fix(sync): Supabase 동기화 복구 — 익명 auth + RLS + pagehide + Sentry |

### 주요 커밋 (병렬 세션, 참고용)

| SHA | 내용 |
|-----|------|
| `4e29181` | feat(web): 온보딩 화면 복원 — 실사용자 피드백 반영 |
| `508f937` | feat(auth): Supabase anonymous auth 도입 + RLS auth.uid() 기반 전환 |
| `598cd5e` | refactor: 모노레포 정석 구조 전환 (A 경로) — apps/web + Turborepo + @neq/* |

### Supabase 서버 측 변경 (SQL Editor로 적용, 코드 아닌 설정)

1. Authentication → Providers → Allow anonymous sign-ins 활성화
2. `supabase/policies.sql` 재적용 (anon + authenticated 양쪽 커버)
3. `supabase/migrations/20260416_onboarding_picks.sql` 적용 (JSONB 컬럼 추가)

### 잠재적 후속 작업 (미착수)

- [ ] Sentry dashboard에서 `sync_failed` 이벤트 실제 수집 확인 (프로덕션 배포 후)
- [ ] PostHog `card_saved` vs Supabase `saved_items` 카운트 일치율 대시보드
- [ ] 프로덕션 재배포로 pagehide 개선 반영 (현재 코드는 commit됐지만 미배포)
- [ ] 실기기에서 전체 플로우 수동 검증 (james 아이폰)
- [ ] 방향 B 완성: `user_id = auth.uid()` 기반 타이트한 RLS로 점진 전환
- [ ] 크로스 디바이스 동기화를 위한 이메일 로그인 도입 (장기)

### 사용자와의 논의 (코드 아님, 맥락 보존용)

- PWA vs Native 의사결정 재조정 — Neko는 UX 민감 축 지배적이라 네이티브 전환 "불가피 아님"이지만 "검증 전제 조건에 가까움"
- Expo Go로 지인 10명 테스트 → 데이터 나오면 TestFlight로 업그레이드 트리거 기준 합의
- 모노레포 전환의 정당성 재확인 — 타입 drift 방지 + 포팅 효율
- 현재 로드맵: PWA 피드백 반영 → 네이티브 동기화 → Expo Go 10명 테스트 → (기준 충족 시) TestFlight
- 유저 식별 모델: device_id + user_id + profile_id 3개 UUID로 익명 유저 추적 (로그인 없이도 서버 저장 가능)

## 2026-04-15 (Day 11)

### 진행 요약
네이티브 앱 전환 + 모노레포 정석 구조 확립 + 프로덕션 배포까지 하루에 완료.
Expo RN PoC → Appium E2E → npm workspaces → @neq/* 리네임 → apps/web 이동 → Turborepo → Vercel 배포.

### 완료된 작업

**플러그인 정리**
- Neko 프로젝트 `.claude/settings.json` 생성 — `enabledPlugins`로 전역 15개 중 7개만 활성
- 유지: vercel, posthog, playwright, chrome-devtools-mcp, github, context7, code-review
- 비활성: superpowers, frontend-design, feature-dev, code-simplifier, vercel-plugin, claude-md-management, skill-creator, postman (기존 하네스/내장 스킬과 중복)

**Expo RN PoC — Phase 2 (apps/native)**
- 스캐폴드: Expo SDK 54 + RN 0.81 + TypeScript + Expo Router + Reanimated 4 + Gesture Handler
- Reanimated 4 세팅 함정 해결: `react-native-worklets` 분리 패키지 설치 + `babel.config.js` 플러그인 등록 + `babel-preset-expo@~54.0.10` 버전 정렬
- 최초 PoC: 좋아요/별로 오버레이 — **사용자 지적으로 폐기** (옛 UX)
- 재포팅: 좌=next, 우=prev 오버레이, 좋아요는 버튼 (캐러셀 브라우징)
- 스와이프 감도 웹 대비 부드러움 사용자 검증

**Expo RN 본 기능 — Phase 3 (apps/native)**
- 3.1 추천 API: `/api/recommend` 실제 호출 (Vercel 프로덕션) — 50건 로드 확인
- 3.2 Saved: AsyncStorage 기반 `neq_saved` 저장. 좋아요 버튼 → 저장 탭 전환 흐름 E2E 검증
- 3.3 Search: TMDB `/api/search` 연결 + 350ms debounce + AbortController 중복 요청 제어
- 3.4 BottomNav: Expo Router Tabs로 발견/검색/저장 3탭 구성

**Appium E2E 인프라**
- WebdriverIO 9.x + XCUITest 11 + TypeScript
- `capture-now.ts` — 시뮬레이터 스크린샷 + 페이지 덤프로 에러 메시지 자동 추출
- `flow-like-to-saved.mjs` — 좋아요 → 저장 탭 전환 검증
- `search-flow.mjs` — 검색 debounce 동작 검증
- `wdio.conf.ts` — 병렬 세션 Appium 서버(4723) 재사용

**모노레포 1차 — 기초 (`0b3093d`)**
- npm workspaces ["apps/*", "packages/*"] 선언
- `packages/core` (@neko/core) 신설 — 공유 타입, `createApiClient` 팩토리
- Metro 모노레포 설정 (`apps/native/metro.config.js` — watchFolders + nodeModulesPaths)

**모노레포 2차 — A 경로 정석 (`598cd5e`)**
- `src/` → `apps/web/src/` 이동 (94 파일 변경)
- 루트 설정 파일 전부 `apps/web/`로 이동: `*.config.{ts,mjs}`, `sentry.*.config.ts`, `.env*`
- 패키지 리네임: `@neko/*` → `@neq/*`
- `packages/design` (@neq/design) 분리 — tokens를 core에서 분리
- Turborepo + `turbo.json` pipeline (build/dev/lint/type-check/start)
- bun.lock 제거, npm 단일화 (`packageManager: npm@10.9.3`)
- 루트 package.json 축소 — workspaces + turbo scripts만

**Vercel 배포**
- 사용자가 Vercel 대시보드에서 Root Directory → `apps/web` 변경
- 커밋 `e6313ce` 프로덕션 배포 **state=success**
- 프로덕션 도메인 `neko-ecru.vercel.app` HTTP 200 + `/api/recommend` 정상 응답 ("토르: 라그나로크" 추천)

**UX 규칙 정리**
- `feedback_swipe_ux.md` 갱신 — 좌=next / 우=prev 오버레이 / 좋아요는 버튼 / 별로 없음
  - 기존 메모리가 **반대 방향으로 저장**돼 있던 것을 수정
- `DESIGN.md` Interaction Model 섹션 신설 (스와이프 불변식 + 터치 임계치)

**하네스/문서 업데이트**
- `frontend-builder` 에이전트 RN 섹션 추가 (웹/네이티브 플랫폼 판단 규칙, 매핑 가이드)
- `qa-tester` 에이전트 Appium WDIO 섹션 추가 (드라이버, 체크리스트, 블로커)
- `CLAUDE.md`에 "네이티브 앱 전환" 섹션 추가
- `README.md`에서 onboarding 참조 제거
- `_workspace/native-transition-plan.md`, `_workspace/monorepo-migration-plan.md`

### 결정 이력

| 항목 | 결정 | 근거 |
|------|------|------|
| 네이티브 스택 | Expo SDK 54 + RN | React 자산 재활용, iOS+Android 동시, OTA, EAS 생태계 |
| 모노레포 툴 | npm workspaces + Turborepo | 단순함 + 빌드 캐시 |
| 패키지 네이밍 | `@neq/*` | 프로젝트 식별자 일관성 |
| 프로젝트 구조 | next-forge 가이드 기반 A 경로 (apps/web + packages/{core,design}) | 정석 구조, drift 방지 |
| 스와이프 semantic | 순수 캐러셀 브라우징 | like/pass = 인지 부담 |
| "별로" / 거절 제스처 | 제거 | 결정 피로 감소 |
| "좋아요" | 버튼 제어 | 명시적 탭 타겟 |
| Android 1차 포함 | 예 | Expo 한계비용 낮음, 국내 Android 점유율 |
| CI 전략 | 로컬만 → EAS Test (전환 후) | MVP 단계 오버엔지니어링 방지 |

### 커밋 & 배포

| SHA | 내용 |
|-----|------|
| `9cf0c34` | feat(native): Expo RN 앱 PoC — Discover/Search/Saved + Appium E2E |
| `0b3093d` | refactor: npm workspaces 모노레포 전환 + packages/core 추출 |
| `598cd5e` | refactor: 모노레포 정석 구조 전환 (A 경로) — apps/web + Turborepo + @neq/* |
| `e6313ce` | docs: Day 11 개발일지 — 네이티브 전환 + 모노레포 정석 구조 |

### 남은 작업 (다음 세션)

- [ ] 웹 코드에서 `@neq/core`, `@neq/design` 점진적 import — `apps/web/src/lib/types.ts` 등 중복 타입 drift 제거
- [ ] 네이티브 본 포팅: FilterChips → DetailSheet → Profile → SearchSheet
- [ ] EAS Build 설정 → TestFlight 배포
- [ ] Supabase anonymous auth 도입 (RLS anon 전면 허용 상태 벗어나기)
- [ ] 웹에서 `meh`/"별로" WatchReaction 실제 제거 (영향 분석 필요)
- [ ] Quiet Ink 디자인 폴리싱 (film grain 톤)

### 회고

- **하루 분량 판단 성공**: Expo 시작부터 프로덕션 배포까지 한 세션. 스와이프 감도 검증만 사용자 개입, 나머지는 자동 검증으로 진행.
- **병렬 세션 활용**: Appium 인프라 세팅을 옆 세션에서 병행 → 메인 세션은 코드에 집중 가능.
- **메모리 반대 방향 저장 버그**: 스와이프 방향이 메모리에 반대로 기록돼 PoC를 옛 UX로 구현한 실수. 사용자 지적 후 즉시 수정. 메모리 → 코드 sync 중요성.
- **"별로" 기능 / "좋아요" 버튼화**: 아직 **웹 코드에는 반영 안 됨**. 이 UX 결정이 문서만 있고 구현 미반영 상태. 다음 세션에서 처리.
- **Vercel Root Directory 수동 작업 한계**: CLI 미설치 + 대시보드 접근 불가로 사용자 수동 단계 필수. 다음 번엔 `npm i -g vercel` 먼저 해두면 `vercel project ls` 등으로 더 많은 자동화 가능.


# CODEMAP

탐색 비용 절감용 — 어디를 먼저 읽어야 할지 1줄로 안내. 거대 파일은 분할 예정 표시.

## 모노레포

```
neko/
├── apps/web/          — Next.js PWA (15.x App Router). 프로덕션 트래픽 메인.
├── apps/native/       — Expo SDK 52 RN 앱. 진행 중 (Phase 2 PoC).
├── packages/core/     — 웹·네이티브 공유 타입/상수 (FilterType, Recommendation 등).
├── packages/design/   — 디자인 토큰 + 공용 컴포넌트 (Button, Toast, NeqSpinner).
├── supabase/          — DB 스키마 + 마이그레이션 (tmdb_metadata, personas...).
├── scripts/           — TMDB crawl/sync 일회성 스크립트 (GitHub Actions에서 실행).
├── _design-handoff/   — Claude Design 정본 prototype (HTML/JSX). 시각 정본만 참조.
└── _workspace/        — 에이전트 산출물 누적. 일반 개발 시 탐색 제외.
```

## apps/web/src/

```
app/
├── layout.tsx        — 루트 레이아웃 + ToastProvider/PostHog/Persona/Offline.
├── template.tsx      — 탭 라우트 슬라이드 애니메이션 + BottomNav 마운트.
├── globals.css       — 디자인 토큰 import + 글로벌 키프레임.
├── discover/         — 메인 스와이프 화면 (page 958L, 분할 예정).
├── saved/            — 저장 라이브러리 (page 1616L, 분할 예정).
├── onboarding/       — 6단계 온보딩 (Welcome / Hello / OTT / Genre / Taste / Notify).
├── profile/          — 프로필 + 페르소나 + 설정 (page 843L).
├── share/[id]/       — 공유 OG 페이지.
└── api/
    ├── recommend/route.ts          — LLM 추천 메인 엔드포인트.
    ├── search/route.ts             — TMDB 검색 프록시.
    ├── trending/route.ts           — TMDB trending.
    ├── tmdb/{by-genre,credits,hydrate,person-works,related}/  — TMDB 보조 호출.
    ├── notifications/subscribe/    — 푸시 구독 처리.
    └── cron/{notifications,tmdb-providers-snapshot}/  — Vercel cron.

components/
├── BottomNav.tsx     — 3탭 네비 (Discover/Saved/Profile).
├── Icons.tsx         — 모든 SVG 아이콘 (단일 모듈).
├── OfflineBanner.tsx — navigator.onLine 토스트.
├── InstallBanner.tsx — PWA install prompt.
├── PosterFallback.tsx— 포스터 없는 경우 fallback 일러스트.
├── PostHogProvider.tsx
├── Reminder.tsx      — 푸시 권한 요청 reminder.
├── cards/            — Discover Card variants (A/B/C, parts, types).
├── discover/
│   ├── SearchSheet.tsx       — 검색 sheet (1823L, 분할 예정 — F3 충돌 주의).
│   ├── DetailSheet.tsx       — 작품 상세 + morph 진입 (1095L, 분할 예정).
│   ├── SwipeCard.tsx         — 카드 스택 + drag.
│   ├── ActionBar.tsx         — Save/Share/Sort/Refresh 버튼바.
│   ├── FilterChips.tsx       — 유형/국가/년도/별점/OTT 헤더 chip + 드롭다운.
│   ├── PrevCardOverlay.tsx   — 우 스와이프 시 prev 카드 표시.
│   ├── RewindOverlay.tsx     — Rewind 버튼 VHS 애니메이션.
│   ├── StatusScreens.tsx     — Loading/Error/Empty 화면.
│   ├── FirstLoadingSkeleton.tsx — 첫 진입 skeleton.
│   ├── CoachMark.tsx         — 1/3/5 카드 진입 시점별 힌트.
│   ├── TutorialOverlay.tsx
│   └── AdCard.tsx            — feature flag 광고 카드 (현재 비활성).
├── onboarding/       — 6 step 컴포넌트 + 데이터 + 컨트롤러.
└── saved/
    └── SavedFilterSheet.tsx  — Saved 페이지 필터/정렬 sheet (Letterboxd 패턴).

hooks/
├── useRecommendations.ts  — Discover 데이터 레이어 (598L). LLM fetch + streaming + cache + filter state. 모든 쿼리 진입점.
├── useDetailSheet.ts      — DetailSheet 모션/터치 hook (Discover/Saved/SearchSheet 공유).
├── useSwipeGesture.ts     — 카드 drag 제스처.
└── useSync.ts             — 페르소나 다중 기기 동기화.

lib/
├── recommend.ts      — OpenAI 프롬프트 + TMDB enrich + 필터 (1396L, 분할 예정).
├── tmdb.ts           — TMDB API 클라이언트 (601L).
├── store.ts          — localStorage 영속 (saved/persona/seen/recCache, 512L).
├── sync.ts           — Supabase 동기화 (페르소나/리포트, 426L).
├── analytics.ts      — PostHog 이벤트 union 타입 + track().
├── env.ts            — feature flag (TMDB_MIRROR_ENABLED, taste-genres 등).
├── types.ts          — 웹 한정 타입 (대부분 @neq/core 재export).
├── discover-types.ts — @neq/core 의 Filter* 재export.
├── share.ts          — navigator.share / clipboard fallback.
├── haptics.ts        — vibrate API wrapper.
├── ott-links.ts      — OTT 로고 + deep link.
├── voice-search.ts   — Speech Recognition wrapper (web).
├── recent-searches.ts— SearchSheet 최근 검색 영속.
├── ad-config.ts      — 광고 카드 frequency/feature flag.
├── push.ts           — 웹 푸시 helpers.
├── account-prefs.ts  — onboarding 결과 영속 (taste genre / OTT).
├── device-id.ts      — anonymous device id (cookie).
├── country-names.ts  — ISO 코드 → 한글명 매핑.
├── rate-limit.ts     — /api/recommend in-memory rate limit.
├── supabase{,-admin}.ts — Supabase client (anon vs service).
└── notifications/    — 푸시 알림 helpers (providers/new-release).

contexts/
└── PersonaContext.tsx — 페르소나 전환 상태 (Discover/Saved 공유).
```

## 거대 파일 책임 요약

| 파일 | L | 책임 1줄 | 분할 우선순위 |
|---|---|---|---|
| `components/discover/SearchSheet.tsx` | 1823 | 검색 입력 + 트렌딩 + 결과 그리드 + DetailSheet 진입 | P2 (F3 충돌 주의) |
| `app/saved/page.tsx` | 1616 | Saved 페이지 전체 (PosterCard / ListCard / 필터 / 정렬 / preview hero / 히스토리) | P2 |
| `lib/recommend.ts` | 1396 | LLM picks + TMDB hydrate + applyFilters + supplement (cross-type) | P2 (rec 작업 시 자연스럽게) |
| `components/discover/DetailSheet.tsx` | 1095 | 작품 상세 + morph 진입 + 관련작 + 캐스트 lazy hydrate | (현재 P2 후보) |
| `app/discover/page.tsx` | 958 | Discover 메인 (스와이프 / coach / persona / detail 진입) | (현재 P2 후보) |
| `app/profile/page.tsx` | 843 | 프로필 + 페르소나 관리 + 설정 + 통계 | (현재 후순위) |

## 탐색 시 제외 경로

`grep`/`Read`/`Glob` 시 기본적으로 제외:
- `_design-handoff/` — HTML prototype + JSX 정본 (5.2M). 시각 정본만 참조 시 진입.
- `_workspace/`, `_workspace_*` — 에이전트 산출물 누적 (1.7M). 일반 개발 시 탐색 X.
- `apps/web/.next/`, `apps/web/dist/`, `apps/web/coverage/` — 빌드 산출물.
- `node_modules/`, `.git/` — 자명.
- 스크린샷 (`*.png` at repo root) — 임시 디버그 산출물.

## 빠른 진입점 가이드

| 의도 | 첫 파일 |
|---|---|
| 추천 로직 변경 | `lib/recommend.ts` (server) → `hooks/useRecommendations.ts` (client) |
| Discover UI 변경 | `app/discover/page.tsx` → `components/discover/SwipeCard.tsx` |
| Saved UI 변경 | `app/saved/page.tsx` → `components/saved/SavedFilterSheet.tsx` |
| 검색 UI 변경 | `components/discover/SearchSheet.tsx` |
| 상세 화면 변경 | `components/discover/DetailSheet.tsx` |
| 디자인 토큰 | `packages/design/src/tokens.{ts,css}` + `DESIGN.md` |
| 새 필터 추가 | `packages/core/src/discover.ts` (타입) → `FilterChips.tsx` (UI) → `useRecommendations.ts` (state) → `discover/page.tsx` (적용) |
| TMDB 통합 | `lib/tmdb.ts` (client API) → `app/api/tmdb/*/route.ts` (server proxy) |
| 알림 / 푸시 | `lib/push.ts` + `lib/notifications/` + `app/api/cron/notifications/` |
| 디자인 정본 | `_design-handoff/HANDOFF_README.md` (진입점) → Phase 4 prototype |
| TMDB Mirror | `CLAUDE.md` 의 "TMDB Mirror 인프라" 섹션 + `scripts/tmdb-*.ts` |

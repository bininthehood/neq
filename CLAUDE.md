
## 탐색 비용 절감

코드베이스가 크기 때문에 grep/Read/Glob 시 다음 경로는 기본 제외:

- `_design-handoff/` — Claude Design 정본 prototype (HTML/JSX, 5.2M). 시각 정본 확인 외 진입 금지.
- `_workspace/`, `_workspace_*` — 에이전트 산출물 누적 (1.7M). 일반 개발 시 탐색 제외.
- `apps/web/.next/`, `apps/web/dist/`, `apps/web/coverage/` — 빌드 산출물.
- `node_modules/`, `.git/` — 자명.
- repo root 의 `*.png` — 임시 디버그 스크린샷.

탐색 진입점 / 거대 파일 책임은 `CODEMAP.md` 참조 — 어디부터 읽을지 1줄로 안내.

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health
- Writing, reviewing, or refactoring code (surface assumptions, simplicity, surgical edits, verify) → invoke karpathy-guidelines

## Design System
Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.

**Design handoff source of truth:** `_design-handoff/` (Claude Design `neq-design-v2` bundle).
- 첫 reading: `_design-handoff/HANDOFF_README.md`.
- 정본 prototype: `_design-handoff/Phase 4 - Full Prototype.html` + `Round 3 - Copy Revisions.html`.
- 새 컴포넌트/아이콘 추가 시 반드시 이 디렉토리부터 확인. 외부 zip / 다른 prototype 디렉토리는 신뢰하지 말 것.

## 네이티브 앱 전환 (진행 중)

**상태:** Phase 2 PoC 단계 (2026-04-15 시작)

**스택:**
- **Expo SDK 52+ (React Native)** — 기존 React 자산 재활용 + iOS/Android 동시
- Expo Router (파일 기반 라우팅)
- NativeWind (Tailwind for RN)
- react-native-reanimated 3 + gesture-handler (스와이프 애니메이션)
- EAS Build / Submit / Update (OTA)
- Appium + WebdriverIO + XCUITest/UIAutomator2 (E2E)

**프로젝트 구조:**
```
neko/
├── src/           # 기존 Next.js PWA (병행 유지)
├── apps/native/   # Expo 앱 (신규)
└── supabase/      # 공유
```

**실행 규칙:**
- 네이티브 관련 작업 시 `apps/native/` 내부에서 작업. 기존 `src/`에 영향 주지 말 것
- 웹과 네이티브 간 공통 타입 변경 시 양쪽 동기화 필수
- 구체 로드맵: `_workspace/native-transition-plan.md` 참조

## TMDB Mirror 인프라

**목표:** `/api/recommend` 의 enrich 단계 (LLM 응답 → TMDB API hydrate, 4.8~12.3s 소요) 를
DB 미러로 치환해 ~100ms 로 단축. **상태: 2026-05-08 prod 활성화** (`TMDB_MIRROR_ENABLED=true`).

**스토리지 (`supabase/migrations/20260424_tmdb_mirror.sql`):**
- `tmdb_catalog`     — TMDB Daily ID Export (전체 universe, ~1.4M)
- `tmdb_metadata`    — 작품 detail + credits + providers 병합 (180일 TTL, providers는 30일 TTL 분리)
- `tmdb_crawl_queue` — bulk crawl 대기열 (priority/failed_count 기반 pull)

**파이프라인 — GitHub Actions 6종 (Vercel cron 아님):**

| Workflow (`.github/workflows/`) | 스케줄 (UTC) | 스크립트 (`scripts/`) | 역할 |
|---|---|---|---|
| `tmdb-catalog-sync.yml` | 매일 08:00 | `tmdb-catalog-sync.ts` | TMDB Daily ID Export → `tmdb_catalog` upsert |
| `tmdb-initial-crawl.yml` | manual (1회성) | `tmdb-initial-crawl.ts` | catalog 전체 → 큐 적재 |
| `tmdb-bulk-crawl.yml` | 6시간 간격 (`15 */6 * * *`) | `tmdb-bulk-crawl.ts` | 큐 pull → metadata upsert (providers 포함) |
| `tmdb-refresh-stale.yml` | 매일 08:30 | `tmdb-refresh-stale.ts` | 180일+ stale row → 큐에 추가 |
| `tmdb-refresh-providers.yml` | 매일 09:00 | `tmdb-refresh-providers.ts` | providers 30일 TTL 트리거 → 큐에 추가 (2026-05-08 신규) |
| `tmdb-providers-snapshot.yml` | 매일 18:00 | (workflow 내장) | providers 변동 snapshot 보관 |
| ~~`api-warmup.yml`~~ | **비활성화 (2026-05-19)** | — | cron-job.org 외부 ping 으로 이전. GH Actions 무료 cron 실제 간격 26~86분 → 5분 보장 실패. 파일은 `disabled_manually` 로 보존 (`gh workflow enable` 복구 가능) |

**활성화 분기 (`apps/web/src/app/api/recommend/route.ts`):**
```ts
const useMirror =
  process.env.TMDB_MIRROR_ENABLED === "true" ||
  req.headers.get("x-neko-mirror") === "1";
```

**측정 결과 (2026-05-08 SQL audit):**
- `tmdb_metadata.providers IS NULL` 87,963 행 (≈77%) — 모두 `providers_fetched_at` SET 상태 (=fetch 완료, TMDB 가 "KR 가용 0" 회신)
- 미수집 (`providers_fetched_at IS NULL`) 행: **0** — 백필 대상 없음
- NULL 행 country 분포: KR 2.8%, US 28.9%, JP 17.1%, other 50.2% — 비-KR 콘텐츠 97% (한국 OTT 미공급 정상 NULL)
- KR 스트리밍 가능 universe: **17,131 / 113,666 = 15.1%** — 이게 실제 추천 모집단
- 인기도 상위 10% NULL 비율 50.8% → 하위 10% 89.3% (단조 증가) — 비주류 작품일수록 KR 미공급

**Parity 검증 (2026-05-08, 200건 샘플):**
- `scripts/recommend-parity-check.ts` — mirror snapshot vs live TMDB 데이터 레이어 직접 비교
- exact match: **97.0%** (rating-top mode + stale-first mode 동일 결과). 임계 90% 초과 ✅
- either_empty 0% — 필터 결과 갯수 차이 없음
- divergence 3% 는 모두 staleness 패턴 (Netflix add / wavve drop, 11일 내 발생). 30일 TTL 트리거로 8% 이내 유지 가능.
- watch_link / runtime / seasons / country: 100% 일치
- 산출물: `_workspace/tmdb-mirror-parity-2026-05-08.md`

**활성화 단계 (완료):**
1. ~~parity 검증~~ ✅ (2026-05-08, 97% exact match, 200건 샘플)
2. ~~providers TTL 30일 스크립트~~ ✅ (`tmdb-refresh-providers.ts`, 매일 09:00 UTC)
3. ~~prod 활성화~~ ✅ (2026-05-08, Vercel env `TMDB_MIRROR_ENABLED=true`)

**활성화 후 운영:**
- providers 30일 TTL 자동 리프레시 (`tmdb-refresh-providers` cron, 매일 09:00 UTC)
- metadata 180일 TTL (`tmdb-refresh-stale` cron, 매일 08:30 UTC)
- staging 헤더 분기 (`x-neko-mirror: 1`) 는 그대로 유지 — 활성화 후에도 admin/디버깅 용도

**활성화 직후 실측 (2026-05-08, 4건 production 호출):**
- enrich latency: 4.8~12.3s baseline → **329~475ms (warm), 평균 ~400ms** (10~25× 속도 개선)
- 첫 호출 cold start 1회 3372ms 후 warm pool 수렴
- 추천 갯수 안정 (10건/call), providers 데이터 정상 (wavve, Google Play Movies 등 mirror snapshot)
- LLM 단계 (4000~6000ms) 가 새 병목 — 향후 streaming 패턴 활성화로 추가 개선 가능

**모니터링 항목 (첫 24h):**
- `/api/recommend` p50 enrich: 300~500ms 유지 시 정상. 1s 초과 시 mirror cache miss / fallback 의심
- 추천 갯수 (rec / call): baseline 90%+ 유지 기대
- TMDB API quota 소비: ~0 기대 (mirror 만 사용)
- Sentry/PostHog error rate: baseline 유지

**롤백 (이상 시):** Vercel env `TMDB_MIRROR_ENABLED` 제거 또는 `false` → 즉시 LLM-direct 경로 복귀.

**Cold start 완화 (2026-05-10 도입 → 2026-05-19 cron-job.org 이전):**
- `/api/warmup` endpoint — Vercel function + Supabase admin connection 살림. `CRON_SECRET` Bearer 인증
- **ping 운영:** cron-job.org 5분 간격 외부 GET (2026-05-19~). 기존 `api-warmup.yml` GH Actions cron 은 무료 tier 실제 간격 26~86분으로 5분 보장 실패 → 이전. 워크플로는 `disabled_manually` 로 보존
- `CRON_SECRET` 은 hex 64자 (특수문자 없음 — 폼/헤더 필드 mangling 방지). warmup·notif 5종·tmdb-snapshot 7 워크플로 공유. 교체 지점: GitHub repo secret + Vercel env 2곳
- 측정: cold enrich 3164ms → warm 607ms (80% 단축, 도입 직후 1회성)
- 모니터링 SQL (PostHog HogQL) — cold 빈도 추적:
  ```sql
  SELECT
    toDate(timestamp) AS day,
    countIf(properties.srv_enrich_ms > 1000) AS cold_likely,
    count(*) AS total,
    round(countIf(properties.srv_enrich_ms > 1000) * 100.0 / count(*), 1) AS cold_pct
  FROM events
  WHERE event = 'recommendation_loaded'
    AND timestamp >= now() - INTERVAL 7 DAY
    AND properties.streamed = true
  GROUP BY day ORDER BY day
  ```
  cron-job.org 이전(5/19) 후 cold_pct 감소하면 warmup 효과. 정상 mirror enrich = 400~800ms.

**측정 산출물:**
- `_workspace/tmdb-providers-backfill-plan-2026-05-08.md` (audit + backfill STOP 결정)
- `_workspace/tmdb-mirror-parity-2026-05-08.md` (parity 검증)

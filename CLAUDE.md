
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

## Design System
Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.

**Design handoff source of truth:** `_design-handoff/` (Claude Design `neq-design-v2` bundle).
- 첫 reading: `_design-handoff/HANDOFF_README.md`.
- 정본 prototype: `_design-handoff/Phase 4 - Full Prototype.html` + `Round 3 - Copy Revisions.html`.
- 새 컴포넌트/아이콘 추가 시 반드시 이 디렉토리부터 확인. 외부 zip / 다른 prototype 디렉토리는 신뢰하지 말 것.

## 하네스: neq OTT 추천 PWA

**목표:** OTT 콘텐츠 발굴 PWA의 추천 엔진, UI/UX, 데이터 레이어를 에이전트 팀으로 개발·개선·검증

**에이전트 팀:**
| 에이전트 | 역할 |
|---------|------|
| rec-engineer | OpenAI 프롬프트 튜닝 + TMDB 필터링 로직 |
| ux-reviewer | DESIGN.md 준수 + 스와이프 터치 UX 리뷰 |
| content-manager | TMDB API 통합 + OTT 가용성 + 메타데이터 |
| frontend-builder | React 컴포넌트 + 애니메이션 + 상태 관리 |
| qa-tester | 통합 정합성 + 엣지 케이스 + 리그레션 |

**스킬:**
| 스킬 | 용도 | 사용 에이전트 |
|------|------|-------------|
| prompt-tuning | 추천 프롬프트 최적화 | rec-engineer |
| ux-review | Warm Cinema 디자인 시스템 검증 | ux-reviewer |
| tmdb-integration | TMDB API 통합 가이드 | content-manager |
| component-build | 프론트엔드 구현 가이드 | frontend-builder |
| mobile-qa | 모바일 QA 검증 가이드 | qa-tester |
| neq-orchestrator | 팀 오케스트레이션 | 리더 (메인) |

**실행 규칙:**
- neq 기능 구현/개선/QA 작업 요청 시 `neq-orchestrator` 스킬을 통해 에이전트 팀으로 처리
- 단순 질문/확인/코드 리뷰는 에이전트 팀 없이 직접 응답 가능
- 모든 에이전트는 `model: "opus"` 사용
- 중간 산출물: `_workspace/` 디렉토리
- 아키텍처: Producer-Reviewer (build → review → feedback 사이클)

**디렉토리 구조:**
```
.claude/
├── agents/
│   ├── rec-engineer.md
│   ├── ux-reviewer.md
│   ├── content-manager.md
│   ├── frontend-builder.md
│   └── qa-tester.md
└── skills/
    ├── prompt-tuning/SKILL.md
    ├── ux-review/SKILL.md
    ├── tmdb-integration/SKILL.md
    ├── component-build/SKILL.md
    ├── mobile-qa/SKILL.md
    └── neq-orchestrator/SKILL.md
```

## 하네스: 디자인 팀

**목표:** neq, 디자인 시스템 리빌드. Warm Cinema 탈피 → 고유 디자인 언어 구축. 외부 디자인 에이전시 수준.

**에이전트 팀:**
| 에이전트 | 역할 | Phase |
|---------|------|-------|
| brand-designer | 브랜드 철학, 컬러, 타이포, 톤앤매너 | 1 |
| ui-designer | 컴포넌트 시스템, 레이아웃, 스페이싱 | 2 |
| motion-designer | 애니메이션, 제스처, 트랜지션 | 3 |
| design-critic | anti-slop 감사, 경쟁 분석, 비평 | 4 |

**스킬:**
| 스킬 | 용도 |
|------|------|
| design-orchestrator | 디자인 팀 오케스트레이션 (Phase 1→2→3→4→DESIGN.md) |

**실행 규칙:**
- 디자인 시스템 리빌드/업그레이드 요청 시 `design-orchestrator` 스킬 사용
- Phase 순차 실행 (1→2→3→4). 이전 Phase 산출물을 다음 Phase 입력으로 사용
- design-critic은 모든 산출물을 cross-review
- 최종 산출물: 새 DESIGN.md + 구현 가이드

**디렉토리 구조:**
```
.claude/
├── agents/
│   ├── brand-designer.md
│   ├── ui-designer.md
│   ├── motion-designer.md
│   └── design-critic.md
└── skills/
    └── design-orchestrator/SKILL.md
```

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
- 스와이프/애니메이션 → `frontend-builder` 에이전트 (RN 섹션 참조)
- E2E 테스트 → `qa-tester` 에이전트 (Appium 섹션 참조)
- 웹과 네이티브 간 공통 타입 변경 시 양쪽 동기화 필수
- 구체 로드맵: `_workspace/native-transition-plan.md` 참조

**변경 이력:**
| 날짜 | 변경 내용 | 대상 | 사유 |
|------|----------|------|------|
| 2026-04-07 | 초기 구성 | 전체 | neq 하네스 신규 구축 — 5 에이전트 Producer-Reviewer 팀 |
| 2026-04-15 | 디자인 팀 추가 | 디자인 | Warm Cinema 탈피 + 고유 디자인 언어 구축 |
| 2026-04-15 | 네이티브 전환 시작 | 전체 | PWA → Expo RN. frontend-builder, qa-tester 확장 |

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
| `api-warmup.yml` | 5분 간격 (`*/5 * * * *`) | (workflow 내장 — `/api/warmup` GET 호출) | Vercel function + Supabase admin connection warm 유지 (2026-05-10 신규, cold start 완화) |

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

**Cold start 완화 (2026-05-10):**
- `/api/warmup` endpoint + `api-warmup.yml` 5분 cron — Vercel function + Supabase admin 살림
- 측정: cold enrich 3164ms → warm 607ms (80% 단축)
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
  cold_pct 가 5월 10일 이후 감소하면 warmup 효과. 정상 mirror enrich = 400~800ms.

**측정 산출물:**
- `_workspace/tmdb-providers-backfill-plan-2026-05-08.md` (audit + backfill STOP 결정)
- `_workspace/tmdb-mirror-parity-2026-05-08.md` (parity 검증)

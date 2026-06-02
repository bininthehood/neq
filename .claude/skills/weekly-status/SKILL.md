---
name: weekly-status
description: neq 하네스의 주간 진행 점검 전용 read-only 스킬. W1~W12 로드맵 + 메모리 + 최신 devlog + git log + QA 리포트 + EAS 빌드 상태를 종합해 현재 주차 / 트랙별 상태 / 잔여 작업 / 다음 주차 진입 게이트 / 출시 카운트다운을 status table 로 산출. 다음 요청 시 반드시 사용 — '주간 계획 팔로업', '이번 주차 어디까지', 'W6/W7 진입 가능한지', '잔여 트랙 일정', '출시 게이트 점검', '스프린트 현황', '로드맵 점검', '진행률', '오늘 어디까지 왔는지', 'iOS/Android 출시 카운트다운', '디버리 상태', '현재 작업 상황 정리'. 코드 변경 / QA 실행 / PR 생성은 본 스킬 범위 밖 — neko-orchestrator 로 위임 권고만 수행. 후속 요청 ('업데이트', '재점검', '갱신된 상태로 다시', '오늘 기준으로 다시') 시에도 본 스킬 재호출.
---

# Weekly Status — 주간 진행 점검

neq 하네스의 read-only 진행 점검 스킬. **코드 변경·실행 금지**, status 산출만 수행. 출력은 항상 한글 + 존댓말 (해요체) + 표 우선.

## 책임 경계

| 스킬 | 책임 |
|------|------|
| 본 스킬 (`weekly-status`) | read-only status 산출. 메모리/devlog/git log/빌드/CLAUDE.md 종합 → 보고서 |
| `neko-orchestrator` | 실제 구현/QA/리뷰 실행. 본 스킬이 "위임 권고" 만 산출하면 사용자가 별도 invoke |
| `testflight-qa` / `mobile-qa` | 빌드 회귀 검증. 본 스킬은 회귀 결과를 *읽기만* 함 |

본 스킬에서 코드 변경, PR 생성, QA 실행, 메모리 갱신 등을 *제안* 할 수 있지만 *직접 수행 금지*. 사용자에게 "다음 액션은 `neko-orchestrator` 트리거" 형식으로 권고만 출력.

## 워크플로우

### Phase 0: 컨텍스트 수집

다음 5 데이터 소스를 **병렬** 로 읽는다 (Bash + Read 동시 호출):

**1. 메모리 인덱스 + 핵심 project_* 메모리**
- 인덱스: `~/.claude/projects/-Users-james-Projects-neko/memory/MEMORY.md`
- 핵심 project (병렬 Read 7건):
  - `project_native_transition.md` — W1~W12 로드맵 / 현재 주차 추정
  - `project_universal_link_checklist.md` — UL 잔여 작업 (자격증명 의존 4 / 무관 3)
  - `project_native_e2e_status.md` — E2E 베이스라인 (시뮬 dev / 실기기 prod)
  - `project_posthog_release_readiness.md` — W7 출시 게이트
  - `project_phase5_brand_assets.md` — 외부 디자인 의뢰 잔여
  - `project_native_parity_gaps.md` — PWA ↔ native 격차
  - `project_tmdb_mirror_status.md` — 인프라 회귀 상태
- 메모리 frontmatter 의 stale 경고 (3일 이상) 확인 → 보고서에 "메모리 N일 전 기록" 명시

**2. 최신 _workspace 산출물**
```bash
ls -lt /Users/james/Projects/neko/_workspace/*.md | head -10
```
- mtime 역순 상위 3건은 Read 로 직접 읽기 (헤더 + 요약 섹션만)
- 4~10건은 파일명만 — 트랙 분류 단서로 사용

**3. Git 활동 (최근 2주)**
```bash
git -C /Users/james/Projects/neko log --since="2.weeks" --oneline | head -50
```
- 커밋 prefix 분포 집계: feat / fix / chore / refactor / hotfix / test
- 영역 키워드 카운트: native / e2e / onboarding / search / saved / detail / ul

**4. 빌드 / 환경 상태**
- `apps/native/app.json` — `expo.version` + `ios.buildNumber` + `android.versionCode`
- 메모리 기록 build N 과 비교 → 신규 build 진행 여부

**5. CLAUDE.md 변경 이력 + 하네스 컨텍스트**
- 변경 이력 테이블 최근 5건
- 하네스 섹션의 "상태" 라인 (예: "Phase 2 PoC 단계")

### Phase 1: 현재 주차 식별

기준 매트릭스 (2026 Q2 로드맵, 기준일 = 2026-04-24):

| 주차 | 기간 | 마일스톤 |
|-----|-----|-----|
| W1~2 | 04-24 ~ 05-07 | TMDB 미러 활성화 |
| W3 | 05-08 ~ 05-14 | 디자인 통합 (PWA 먼저) |
| W4 | 05-15 ~ 05-21 | 이관 준비 (UL, Supabase) |
| W5 | 05-22 ~ 05-28 | 네이티브 이관 스프린트 |
| W6 | 05-29 ~ 06-04 | iOS TestFlight 베타 |
| W7 | 06-05 ~ 06-11 | iOS 앱스토어 제출 |
| W8 | 06-12 ~ 06-18 | iOS 출시 (6/18) |
| W9~10 | 06-19 ~ 07-02 | Android 마감 |
| W11 | 07-03 ~ 07-09 | Play Store 제출 |
| W12 | 07-10+ | Android 출시 (7/10) |

**산출 절차:**
1. 오늘 날짜 ↔ 매트릭스 → 달력상 주차 산출
2. 메모리 (`project_native_transition`) 의 "W{N} 진입 가능" / "W{N} 진입 확정" / "W{N} 완료" 신호 추출 → 실제 진입 주차
3. 두 값이 다르면 "달력 W6 / 실제 W6 진입 (5/29 testflight-qa 스킬 추가로 확정)" 형식으로 둘 다 표기
4. 출시 D-Day 계산: 오늘 → 2026-06-18 (iOS) / 2026-07-10 (Android)

### Phase 2: 트랙별 상태 집계

다음 6 트랙으로 분류 (한 트랙당 표 1행 또는 미니 표):

| 트랙 | 핵심 신호 소스 |
|------|---------------|
| 1. **Native iOS (build & E2E)** | app.json buildNumber, `testflight-qa-*.md` 최신, `project_native_e2e_status` |
| 2. **Universal Link** | `project_universal_link_checklist` (4 자격증명 / 3 무관) |
| 3. **PostHog 출시 게이트** | `project_posthog_release_readiness` (6쿼리 실행 여부) |
| 4. **PWA ↔ Native 정합** | `project_native_parity_gaps` (extraContentTypes, multi-select 등) |
| 5. **외부 디자인 의뢰** | `project_phase5_brand_assets` (로고 / 앱 아이콘 / 일러스트) |
| 6. **인프라 (TMDB Mirror + warmup)** | `project_tmdb_mirror_status` (회귀 여부) |

각 트랙 표 컬럼: **상태 / 진행률 / 직전 변경 / 블로커 / 다음 액션**

상태 아이콘:
- ✅ 완료
- ⏳ 진행 중 (블로커 없음)
- 🚧 블로커 / 외부 의존
- ❌ 회귀 또는 보류
- ⚪ 미착수 / 다음 주차 영역

### Phase 3: 잔여 트랙 + 다음 주차 진입 게이트

**3-1. 잔여 작업 표** — 6 트랙에서 ✅ 가 아닌 항목만 추출

| 트랙 | 항목 | 블로커 유형 | 책임 | ETA |
|------|------|------------|------|-----|
| ... | ... | 자격증명 / 외부의뢰 / 사용자결정 / QA판정 / 인프라 | qa-tester / 외부 / 사용자 | W? |

**3-2. 다음 주차 진입 게이트** — `project_native_transition` 메모리에 명시된 게이트 조건 우선

W5 진입 게이트 (참고용, 이미 통과):
- `srv_enrich_ms` p50 ≤ 5,000ms
- `/saved` 재방문율 (14일) ≥ 25%
- Bridge → Discover 전환율 ≥ 80%

W7 출시 직전 게이트 (현재 주요 관심사):
- DAU 7일 평균 ≥ 10명
- PostHog readiness 6쿼리 모두 PASS
- Universal Link 4건 실기기 검증
- 자동 회귀 ≥ 24/32 prod baseline 유지

**3-3. 출시 카운트다운**
- iOS 출시 (2026-06-18) D-?
- Android 출시 (2026-07-10) D-?

D-7 이내 진입 시 보고서 상단에 ⚠️ 경고 헤더.

### Phase 4: 산출물 형식

마크다운 보고서 1건을 **화면 출력 + Obsidian vault 저장 동시 수행**.

**저장 경로 (정본):**
```
/Users/james/Library/Mobile Documents/iCloud~md~obsidian/Documents/James/1. Project/Jobs/AGENT/{YYYY-MM-DD}/주간 status -- {주차 라벨}.md
```

규칙:
- 폴더명 = 보고서 작성일 (`YYYY-MM-DD`). 같은 날 2회 이상 실행 시 동일 폴더 안에 파일명만 변경
- 파일명 = `주간 status -- {주차 라벨}.md` (예: `주간 status -- W6 진입 Day 4.md`, `주간 status -- W7 진입 전 점검.md`)
- 구분자는 **두 하이픈 (`--`)**. em dash (`—`) 금지 — iCloud/Obsidian 인덱싱 일관성
- 후속 점검 시 이전 폴더 (`YYYY-MM-DD`) 의 동명 파일과 비교 가능 — diff 시 변경된 ✅/⏳/❌ 강조

**보고서 본문 구조:**

```markdown
# Status — {YYYY-MM-DD} ({현재 주차})

## 현재 위치
- 주차: {달력 W?} / {실제 진입 W?} (출처: {메모리/devlog})
- iOS 출시 D-{N} (2026-06-18)
- Android 출시 D-{N} (2026-07-10)
- 최신 native build: v{X.Y.Z} build {N}
- 최근 2주 활동: {commit 수}건 ({feat}/{fix}/{chore}/{기타} 분포)

## 최근 N일 진행
- {YYYY-MM-DD} — {요약 1줄} ({커밋 hash 또는 devlog 파일명})
- ...
(최대 5건)

## 트랙별 상태

### 1. Native iOS (build & E2E)
| 상태 | 항목 | 진행률 | 직전 변경 | 다음 액션 |
|------|------|--------|----------|----------|
| ... | ... | ... | ... | ... |

### 2. Universal Link
...

### 3. PostHog 출시 게이트
...

### 4. PWA ↔ Native 정합
...

### 5. 외부 디자인 의뢰
...

### 6. 인프라 (TMDB Mirror)
...

## 잔여 트랙
| 트랙 | 항목 | 블로커 유형 | 책임 | ETA |
|------|------|------------|------|-----|
| ... | ... | ... | ... | ... |

## 다음 주차 진입 게이트
- {게이트 1}: 타겟 {X} / 현재 {Y} — {PASS/FAIL/PENDING}
- ...

## 권고 (다음 액션 1~3건)
1. **{우선순위}** — {액션}. 위임: `{스킬 또는 에이전트}` ({이유})
2. ...

---

## 데이터 소스
- 메모리: {파일명 N건} ({가장 오래된 기록 N일 전})
- _workspace: {최신 파일 3건}
- git: 최근 2주 {N}건
- build: app.json buildNumber {N}
```

산출물 처리:
1. 화면 출력 (사용자 즉시 확인)
2. Obsidian vault 저장 (Write tool, 위 정본 경로). 저장 후 파일 경로를 사용자에게 알림
3. 후속 점검 시 직전 저장본과 변경된 항목을 헤더에 명시 ("직전 {YYYY-MM-DD} 대비: 트랙 1 ⏳→✅, 트랙 6 ❌→⚠️" 등)

## 보고서 작성 규칙

- **한글 + 해요체** (사용자 메모리 `feedback_formal_tone` / `feedback_korean`)
- **표 우선** — 산문은 헤더 직후 1줄 요약만, 나머지는 표
- **이모지 사용** — 상태 표 아이콘 (✅⏳🚧❌⚪) 만. 일반 본문 이모지 금지 (`feedback_llm_slop`)
- **메모리 stale 경고** — 3일+ 오래된 메모리 인용 시 "(메모리 N일 전, git 기준 보정)" 표기
- **외부 의존 명시** — 사용자 결정 / 외부 디자인 팀 / 자격증명 발급 등은 별도 컬럼으로 분리
- **권고는 최대 3건** — 우선순위 명시 (P0/P1/P2)
- **위임 권고 형식** — "위임: `neko-orchestrator` (페르소나 V2 회귀 fix 필요)" 처럼 스킬명 + 이유

## 호출 비용 가드

본 스킬은 **read-only 이지만 컨텍스트 비용은 큰 편** (메모리 7건 + workspace 3건 + git log + app.json + CLAUDE.md):

- 사용자가 "W6 진입 가능한지만" 처럼 *좁은 범위* 요청 시 → Phase 1 + Phase 3-2 만 수행, Phase 2 트랙 표 전체 생략
- "오늘 어디까지 왔는지" 처럼 *전체 상황* 요청 시 → 전체 Phase 수행
- 모호하면 한 질문으로 좁은/전체 여부 확인 후 진행

## 테스트 시나리오

### 시나리오 1 — 정상 흐름 (full report)
**입력:** "주간 계획 기반 현재 작업 팔로업 및 잔여 트랙 일정 파악해주세요"
**기대 산출:** Phase 0~4 전체 수행. 현재 주차 / 5~6 트랙 표 / 잔여 표 / 다음 주차 게이트 / 권고 3건 / 데이터 소스 footer.

### 시나리오 2 — 좁은 범위 (특정 주차 진입 가능 여부)
**입력:** "W7 진입 가능한지만 알려주세요"
**기대 산출:** Phase 1 (현재 주차 + 출시 D-Day) + Phase 3-2 (W7 진입 게이트만) + 권고 1~2건. 트랙 표 전체 생략 가능.

### 시나리오 3 — 메모리 stale 보정
**입력:** "지금 어디까지 왔어요?" (메모리 9일 전 기록 + 최근 git 활동 30건)
**기대 산출:** "메모리는 5/23 기록, 이후 git 30 commits — 보정 결과: ..." 헤더 + 본문 보고서. 메모리/git 차이를 명시적으로 표시.

### 시나리오 4 — 후속 ("다시 점검")
**입력:** "오늘 기준으로 다시 갱신해주세요"
**기대 산출:** Phase 0 재실행, 변경된 항목만 강조 ("✅ → ⏳ 변경: ..." 또는 "신규 추가: ..."). 이전 보고서와 비교 가능한 형식.

## 관련 스킬

- `neko-orchestrator` — 실행 위임 대상 (코드 변경, QA, PR)
- `testflight-qa` — TestFlight 실기기 회귀 결과 산출 (본 스킬은 결과만 *읽음*)
- `mobile-qa` — 시뮬레이터 회귀 결과 산출 (동일)
- `retro` (gstack) — 주간 retrospective (회고 중심). 본 스킬은 *forward looking* status 중심

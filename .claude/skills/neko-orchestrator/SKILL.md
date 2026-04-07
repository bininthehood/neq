---
name: neko-orchestrator
description: "Neko OTT 추천 PWA 에이전트 팀 오케스트레이터. 추천 개선, UX 리뷰, 컴포넌트 구현, QA 테스트, TMDB 통합 작업을 팀으로 수행. '추천 개선해줘', '새 기능 추가', 'UI 개선', 'QA 해줘', '버그 수정', '리팩토링', 'Neko 작업' 요청 시 사용. 후속: 다시 실행, 업데이트, 수정, 보완, 결과 개선, 부분 재실행, 이전 결과 기반으로."
---

# Neko Orchestrator

Neko OTT 콘텐츠 발굴 PWA의 에이전트 팀을 조율하여 기능 구현, 개선, QA를 수행하는 통합 스킬.

## 실행 모드: 에이전트 팀 (Producer-Reviewer)

## 아키텍처: Producer-Reviewer 사이클

```
[Producers]                    [Reviewers]
  rec-engineer    ──build──→     qa-tester     ──feedback──→  rec-engineer
  content-manager ──data───→     ux-reviewer   ──feedback──→  frontend-builder
  frontend-builder──build──→     qa-tester     ──feedback──→  frontend-builder
                                 ux-reviewer
```

빌드 → 리뷰 → 피드백 → 수정 → 재리뷰 사이클. 최대 2회 재시도 후 현재 상태로 진행.

## 에이전트 구성

| 팀원 | 에이전트 타입 | 역할 | 스킬 | 모델 |
|------|-------------|------|------|------|
| rec-engineer | rec-engineer | OpenAI 프롬프트 + TMDB 필터링 | prompt-tuning | opus |
| ux-reviewer | ux-reviewer | DESIGN.md 준수 + 스와이프 UX | ux-review | opus |
| content-manager | content-manager | TMDB API + OTT 가용성 | tmdb-integration | opus |
| frontend-builder | frontend-builder | React 컴포넌트 + 애니메이션 | component-build | opus |
| qa-tester | qa-tester | 통합 정합성 + 엣지 케이스 | mobile-qa | opus |

## 워크플로우

### Phase 0: 컨텍스트 확인

1. `_workspace/` 디렉토리 존재 여부 확인
2. 실행 모드 결정:
   - **`_workspace/` 미존재** → 초기 실행. Phase 1로 진행
   - **`_workspace/` 존재 + 부분 수정 요청** → 부분 재실행. 해당 에이전트만 재호출
   - **`_workspace/` 존재 + 새 입력** → 새 실행. 기존을 `_workspace_{timestamp}/`로 이동
3. 부분 재실행 시 이전 산출물 경로를 에이전트 프롬프트에 포함

### Phase 1: 준비

1. 사용자 요청 분석 — 어떤 에이전트가 필요한지 판단
2. `_workspace/` 생성 (초기 실행 시)
3. 요청을 `_workspace/00_input.md`에 기록
4. 에이전트 할당 결정:

| 요청 유형 | 필수 에이전트 | 리뷰어 |
|----------|-------------|--------|
| 추천 로직 변경 | rec-engineer, content-manager | qa-tester |
| UI/컴포넌트 구현 | frontend-builder | ux-reviewer, qa-tester |
| TMDB 데이터 확장 | content-manager | qa-tester |
| 전체 기능 추가 | 전원 | ux-reviewer, qa-tester |
| QA/버그 수정 | qa-tester + 해당 영역 에이전트 | ux-reviewer |
| 디자인 개선 | frontend-builder | ux-reviewer |

### Phase 2: 팀 구성

1. 팀 생성:
   ```
   TeamCreate(
     team_name: "neko-team",
     members: [
       {
         name: "rec-engineer",
         agent_type: "rec-engineer",
         model: "opus",
         prompt: "당신은 Neko 추천 엔진 전문가입니다. .claude/agents/rec-engineer.md를 읽고 역할을 숙지하세요. DESIGN.md도 참조. 스킬: .claude/skills/prompt-tuning/SKILL.md. 작업 완료 시 _workspace/에 산출물을 저장하세요."
       },
       {
         name: "content-manager",
         agent_type: "content-manager",
         model: "opus",
         prompt: "당신은 Neko 콘텐츠 데이터 전문가입니다. .claude/agents/content-manager.md를 읽고 역할을 숙지하세요. 스킬: .claude/skills/tmdb-integration/SKILL.md. 작업 완료 시 _workspace/에 산출물을 저장하세요."
       },
       {
         name: "frontend-builder",
         agent_type: "frontend-builder",
         model: "opus",
         prompt: "당신은 Neko 프론트엔드 전문가입니다. .claude/agents/frontend-builder.md를 읽고 역할을 숙지하세요. DESIGN.md를 반드시 읽으세요. 스킬: .claude/skills/component-build/SKILL.md. 작업 완료 시 _workspace/에 산출물을 저장하세요."
       },
       {
         name: "ux-reviewer",
         agent_type: "ux-reviewer",
         model: "opus",
         prompt: "당신은 Neko UX 리뷰어입니다. .claude/agents/ux-reviewer.md를 읽고 역할을 숙지하세요. DESIGN.md를 반드시 읽으세요. 스킬: .claude/skills/ux-review/SKILL.md. 리뷰 결과를 _workspace/에 저장하세요."
       },
       {
         name: "qa-tester",
         agent_type: "qa-tester",
         model: "opus",
         prompt: "당신은 Neko QA 전문가입니다. .claude/agents/qa-tester.md를 읽고 역할을 숙지하세요. 스킬: .claude/skills/mobile-qa/SKILL.md. QA 리포트를 _workspace/에 저장하세요."
       }
     ]
   )
   ```

2. 작업 등록 (요청에 따라 동적):
   ```
   TaskCreate(tasks: [
     { title: "구현/변경", description: "...", assignee: "해당 producer" },
     { title: "UX 리뷰", description: "...", assignee: "ux-reviewer", depends_on: ["구현/변경"] },
     { title: "QA 검증", description: "...", assignee: "qa-tester", depends_on: ["구현/변경"] },
     { title: "피드백 반영", description: "...", assignee: "해당 producer", depends_on: ["UX 리뷰", "QA 검증"] }
   ])
   ```

### Phase 3: Build (Producer 작업)

**실행 방식:** Producer 에이전트들이 병렬 작업

- rec-engineer: 추천 로직 변경 → `_workspace/03_rec_changes.md`
- content-manager: TMDB 데이터 레이어 변경 → `_workspace/03_content_changes.md`
- frontend-builder: 컴포넌트 구현/수정 → `_workspace/03_build_changes.md`

**통신 규칙:**
- content-manager가 타입 변경 시 → SendMessage to rec-engineer, frontend-builder
- rec-engineer가 Recommendation 타입 변경 시 → SendMessage to frontend-builder
- frontend-builder가 구현 완료 시 → SendMessage to ux-reviewer, qa-tester

### Phase 4: Review (Reviewer 검증)

**실행 방식:** Producer 완료 후 Reviewer 병렬 검증

- ux-reviewer: DESIGN.md 준수 + 스와이프 UX → `_workspace/04_ux_review.md`
- qa-tester: 통합 정합성 + 엣지 케이스 → `_workspace/04_qa_report.md`

**리뷰 결과 처리:**
- 모든 항목 PASS → Phase 5로 진행
- FAIL 항목 존재 → 해당 Producer에게 SendMessage로 구체적 수정 요청
- Producer 수정 후 → Reviewer 재검증 (최대 2회)

### Phase 5: 정리

1. 모든 에이전트의 산출물 수집
2. `npm run build` 실행하여 빌드 성공 확인
3. 변경 요약 생성
4. 팀 정리
5. `_workspace/` 보존 (감사 추적용)
6. 사용자에게 결과 보고:
   - 변경된 파일 목록
   - 주요 변경 내용
   - QA 결과 요약
   - 남은 이슈 (있다면)

## 데이터 흐름

```
[리더]
  │
  ├── TeamCreate → neko-team (5명)
  │
  ├── Phase 3: Build
  │   ├── [content-manager] → tmdb.ts, types.ts
  │   │         ↓ SendMessage (타입 변경)
  │   ├── [rec-engineer] → recommend.ts, route.ts
  │   │         ↓ SendMessage (Recommendation 변경)
  │   └── [frontend-builder] → pages, components
  │             ↓ SendMessage (구현 완료)
  │
  ├── Phase 4: Review
  │   ├── [ux-reviewer] → _workspace/04_ux_review.md
  │   │         ↓ SendMessage (수정 요청)
  │   ├── [qa-tester] → _workspace/04_qa_report.md
  │   │         ↓ SendMessage (버그 리포트)
  │   └── [producers] → 피드백 반영 → 재리뷰
  │
  └── Phase 5: 정리 + 결과 보고
```

## 에러 핸들링

| 상황 | 전략 |
|------|------|
| 에이전트 1명 실패 | SendMessage로 상태 확인 → 재시작 시도 → 실패 시 해당 작업 스킵 |
| 에이전트 과반 실패 | 사용자에게 알리고 진행 여부 확인 |
| 빌드 실패 | qa-tester가 에러 분석 → 해당 에이전트에게 수정 요청 |
| 리뷰-수정 무한 루프 | 최대 2회 재시도 후 현재 상태로 진행, 남은 이슈 보고 |
| 타입 변경 충돌 | 변경 순서: types.ts → tmdb.ts → recommend.ts → 컴포넌트 |

## 테스트 시나리오

### 정상 흐름: 새 필터 추가
1. 사용자: "장르 필터를 추가해줘"
2. Phase 1: 전원 필요 판단
3. Phase 2: 5명 팀 구성 + 작업 등록
4. Phase 3: content-manager(TMDB 장르 API) + rec-engineer(프롬프트에 장르 조건) + frontend-builder(필터 칩 UI)
5. Phase 4: ux-reviewer(필터 칩 DESIGN.md 준수) + qa-tester(필터 동작 검증)
6. Phase 5: 빌드 확인 + 결과 보고

### 에러 흐름: QA 실패
1. Phase 4에서 qa-tester가 API 응답 shape 불일치 발견
2. qa-tester → SendMessage to rec-engineer: "Recommendation 타입에 genre 필드 있지만 API가 반환 안 함"
3. rec-engineer 수정 → qa-tester 재검증
4. 재검증 통과 → Phase 5 진행

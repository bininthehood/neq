
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

**변경 이력:**
| 날짜 | 변경 내용 | 대상 | 사유 |
|------|----------|------|------|
| 2026-04-07 | 초기 구성 | 전체 | neq 하네스 신규 구축 — 5 에이전트 Producer-Reviewer 팀 |

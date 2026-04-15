# Design Orchestrator

neq, 디자인 시스템 리빌드를 위한 에이전트 팀 오케스트레이터.
"외부 디자인 에이전시에 의뢰"하는 것처럼, 4인 전문가 팀이 순차적으로 작업.

## 에이전트 팀

| 에이전트 | 역할 | Phase |
|---------|------|-------|
| brand-designer | 브랜드 철학, 컬러, 타이포, 톤 | Phase 1 |
| ui-designer | 컴포넌트, 레이아웃, 스페이싱 | Phase 2 |
| motion-designer | 애니메이션, 제스처, 트랜지션 | Phase 3 |
| design-critic | anti-slop 감사, 비평, 벤치마킹 | Phase 4 |

## 목표
- Warm Cinema 완전 탈피
- "문화인이 소유하는 앱" 느낌의 고유 디자인 언어
- 엔터프라이즈 B2C (Spotify, Airbnb, Notion) 수준 완성도
- 영화/시리즈/음악/도서/공연 확장 가능한 시스템
- LLM slop 제로

## 워크플로우

### Phase 0: 컨텍스트 준비
1. `_workspace/` 디렉토리 생성
2. 현재 DESIGN.md 읽기 (교체 대상 파악)
3. 현재 앱 구조 파악 (src/components, src/app)
4. 경쟁 앱 리서치 (WebSearch)

### Phase 1: 브랜드 정의 (brand-designer)
1. 에이전트 호출: `.claude/agents/brand-designer.md` 읽고 역할 숙지
2. 경쟁 앱 디자인 리서치 (Letterboxd, Spotify, Notion, 왓챠피디아)
3. 브랜드 포지셔닝 정의
4. 컬러 시스템 설계
5. 타이포그래피 스택 선정
6. 톤앤매너 가이드
7. 산출물: `_workspace/brand-identity.md`, `color-system.md`, `typography.md`, `tone-guide.md`

### Phase 2: 컴포넌트 시스템 (ui-designer)
- Phase 1 산출물을 입력으로 받음
1. 에이전트 호출: `.claude/agents/ui-designer.md` 읽고 역할 숙지
2. Phase 1 산출물 읽기
3. 전체 컴포넌트 목록 + 규격 정의
4. 스페이싱 + 그리드 시스템
5. 상태별 디자인 (로딩, 빈 상태, 에러)
6. 산출물: `_workspace/component-spec.md`, `spacing-layout.md`, `states-spec.md`

### Phase 3: 모션 언어 (motion-designer)
- Phase 1, 2 산출물을 입력으로 받음
1. 에이전트 호출: `.claude/agents/motion-designer.md` 읽고 역할 숙지
2. Phase 1, 2 산출물 읽기
3. 이징 + 듀레이션 체계
4. 제스처별 피드백 규격
5. 산출물: `_workspace/motion-language.md`, `gesture-spec.md`

### Phase 4: 비평 + 정제 (design-critic)
- 모든 Phase 산출물을 입력으로 받음
1. 에이전트 호출: `.claude/agents/design-critic.md` 읽고 역할 숙지
2. 전체 산출물 읽기
3. Anti-slop 감사
4. 경쟁 앱 벤치마킹
5. 3초/소유욕/구별/확장 테스트
6. 수정 권고 → 해당 디자이너에게 피드백
7. 산출물: `_workspace/design-critique.md`, `anti-slop-audit.md`, `benchmark.md`

### Phase 5: DESIGN.md 재정립
1. 모든 산출물 통합
2. 새 DESIGN.md 작성
3. 사용자 승인 요청

### Phase 6: 구현 가이드
1. 현재 코드 대비 변경 필요한 파일 목록
2. CSS 변수 매핑 (현재 → 새 토큰)
3. 컴포넌트별 수정 가이드
4. 구현 우선순위 제안

## 에러 핸들링

| 상황 | 전략 |
|------|------|
| Phase 간 불일치 | design-critic이 감지 → 해당 Phase 에이전트에 수정 요청 |
| 사용자 방향 변경 | 해당 Phase부터 재실행 |
| slop 감지 | design-critic이 구체적 수정안 제시 → 재작업 |

## 실행 방법
"디자인 시스템 리빌드해줘" 또는 `/design-orchestrator` 로 실행

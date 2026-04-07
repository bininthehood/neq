# Neko 개발 일지

## 2026-04-06 (Day 1)

### 진행 요약
프로젝트 기획부터 MVP 배포까지 하루 만에 완료.

### 완료된 작업

**기획 검증 (/office-hours)**
- YC 스타일 6가지 질문으로 핵심 가치 재정의
- 타겟 사용자: 임현빈, 33세 회사원. OTT 3개 구독, 넷플릭스만 씀. 아무거나 틀고 10분 보고 끔.
- 핵심 인사이트: "사용자의 문제는 찾지 못하는 게 아니라 잘못 고르는 것"
- 스와이프는 데이터 수집 메커니즘이지, 제품 자체가 아님. 제품은 "추천 품질"
- 디자인 문서 생성 → ~/.gstack/projects/neko/

**추천 품질 검증 (Week 0)**
- test-recommend.ts로 OpenAI + TMDB 추천 테스트
- 15개 LLM 추천 → 한국 OTT 필터링 → 10개 노출 파이프라인 구축
- 5개 중 3개 이상 "볼 만하다" 기준 통과

**MVP 구현 (Week 1)**
- Next.js App Router + Tailwind CSS + PWA
- Onboarding: TMDB 검색 + 장르별 인기작 추천 그리드 (↻ 새로고침)
- Discover: 스와이프 카드 (터치 제스처 + 키보드), 포스터/평점(TMDB 출처)/OTT 표시
- Saved: 포스터 그리드 + "오늘 뭐 볼까" 랜덤 선택
- API: /api/recommend (OpenAI + TMDB 필터링), /api/search (TMDB 멀티서치), /api/trending (장르별 믹스)
- 취향 재설정 기능

**QA (/qa)**
- Hydration mismatch 수정 (서버/클라이언트 className 불일치)
- 모바일 삭제 버튼 접근성 수정 (hover-only → 모바일에서 항상 표시)

**배포**
- GitHub: bininthehood/Neko
- Vercel: https://neko-ecru.vercel.app
- git author 설정 (bininthehood)

**디자인 시스템 (/design-consultation)**
- Cinematic Dark 방향 확정
- Pretendard(한글 UI) + Outfit(숫자/평점) 타이포그래피
- #0A0A0A 배경, #22C55E 초록 액센트
- HTML 프리뷰 페이지 생성 완료

### 사용자 피드백 (초기)
- ✅ "몰랐던 작품을 발견했다고 느낀다"
- ✅ "자발적 재방문 있음"
- ⚠️ "카드 스크롤 UI/UX가 엉망" → 스와이프 전면 개선 완료
- ⚠️ "Pass했던 작품으로 돌아가지 못하는 게 아쉽다" → 미구현
- 💡 "별점의 출처가 궁금" → TMDB 출처 표시 완료
- 💡 "랜딩 페이지 추천이 있으면 좋겠다" → 장르별 추천 그리드 완료
- 💡 "추천 목록 재설정" → 다른 작품 보기 버튼 완료

### 미해결 / 다음 할 일
- [ ] "어제 추천받은 거 봤어?" 셀프 리포트 기능
- [ ] Vercel GitHub 자동 배포 연동 해결 (현재 CLI 수동 배포)
- [ ] 더 많은 사용자 피드백 수집

---

## 2026-04-07 (Day 2)

### 진행 요약
디자인 시스템 확정 + 코드 적용 + 사용자 피드백 기능 3개 구현 + 코드 리뷰 + 보안 감사.

### 사용자 피드백 (Day 2)
- 💡 "시리즈/영화, 국내/해외 구분이 있으면 좋겠다" → ✅ 필터 칩 구현
- 💡 "OTT로 바로 링크하는 기능" → ✅ OTT 딥링크 구현
- 💡 "UI가 LLM이 만든 느낌이 많이 난다" → ✅ Warm Cinema 디자인 시스템으로 전면 개편
- 전반적 재사용 의사 높음

### 완료된 작업

**디자인 시스템 (/design-consultation) — Warm Cinema**
- "LLM 느낌" 피드백을 받고 디자인 방향 전면 재설정
- Aesthetic: Warm Cinema (영화관의 따뜻한 간접 조명)
- 배경: #0C0A09 (워며 블랙), 액센트: #E87B35 (번트 오렌지)
- Typography: Fraunces(세리프 디스플레이) + Pretendard(한글) + Outfit(숫자)
- AI 목업 3개 생성 → Variant A 선택 (클래식 시네마틱)
- 필름 그레인 텍스쳐 오버레이
- DESIGN.md 작성 + 전체 코드에 디자인 토큰 적용

**기능 구현 (사용자 피드백)**
- OTT 딥링크: Discover "지금 보기" 버튼 + Saved 포스터 탭 → OTT 페이지
- 필터: 전체/영화/시리즈 + 전체/국내/해외 칩 필터
- Pass 되돌리기(Undo): 히스토리 스택 기반 ↩ 버튼

**코드 리뷰 (/review)**
- LLM JSON 파싱 에러 핸들링 추가 (try-catch)
- API 500 에러 처리 추가
- localStorage.clear() → neko_ 키만 선택적 삭제
- PR Quality Score: 9/10

**보안 감사 (/cso)**
- Finding 1: /api/recommend 레이트 리밋 없음 → ✅ IP당 분당 5회 제한 추가
- Finding 2: 대화 중 API 키 노출 → ✅ 키 로테이션 완료
- XSS/인젝션/시크릿 노출 없음 확인

### 커밋 히스토리 (Day 2)
```
fb93e08 security: /api/recommend에 IP 기반 레이트 리밋 추가
44e5d7f fix: LLM JSON 파싱 에러 핸들링 + API 500 에러 처리 + localStorage 선택적 삭제
794a54b feat: OTT 딥링크 + 필터(영화/시리즈, 국내/해외) + Undo
dddaa25 style: Warm Cinema 디자인 시스템 코드 적용
7c26e19 docs: Warm Cinema 디자인 시스템 확정
1bc12e8 docs: Day 1 개발 일지 추가
```

### 미해결 / 다음 할 일 (Day 2 기준)
- [ ] "어제 추천받은 거 봤어?" 셀프 리포트 기능
- [ ] Vercel GitHub 자동 배포 연동 해결

---

## 2026-04-07 (Day 2 연장)

### 진행 요약
UX 고도화 3건. 사용자 경험의 근본적 문제 해결.

### 사용자 피드백 → 수정

**1. 아이콘이 밋밋하다**
- 기존: 이모지(👋💚ℹ️↩) 버튼
- 변경: 커스텀 SVG 아이콘 컴포넌트 (`src/components/Icons.tsx`)
- Pass(X), Save(하트), Info(i), Undo(되돌리기), Close, Refresh 6종
- 스와이프 오버레이도 SVG 아이콘으로 교체

**2. Detail 접근이 부자연스럽다**
- 기존: 위로 스와이프 → Detail (발견이 어려움)
- 변경: **카드 탭** → Detail 열기. 훨씬 직관적.
- "탭하여 상세보기" 힌트 카드 중앙에 표시 (첫 3장만)
- 키보드: Enter로도 Detail 열기

**3. 국내/해외 필터가 작동하지 않는 느낌**
- **근본 원인:** 10개 랜덤 추천에서 클라이언트 필터링 → 국내 0개 빈번
- **해결:** 필터 변경 시 LLM에 직접 조건 전달
  - "국내 시리즈" 탭 → 프롬프트에 "한국 시리즈만 추천하세요" 포함
  - 서버 측 origin 이중 검증 (LLM이 잘못 추천한 경우 방어)
  - 필터 조합별 localStorage 캐시 (재탐색 불필요)
  - `clearAllRecommendations()`로 재설정 시 전체 캐시 삭제
- **빈 상태 UX:** "국내 작품을 찾지 못했어요" + "필터 초기화" / "다시 시도" 버튼

### 기술 변경 사항
- `src/components/Icons.tsx` — 6종 SVG 아이콘 컴포넌트 신규
- `src/lib/recommend.ts` — `RecommendFilter` 인터페이스, `buildFilterPrompt()` 함수 추가
- `src/app/api/recommend/route.ts` — `filter` 파라미터 수신
- `src/lib/store.ts` — 필터별 캐시 (`neko_recs_{type}_{origin}`), `clearAllRecommendations()`
- `src/app/discover/page.tsx` — 전면 리팩토링 (클라이언트 필터링 제거, 필터별 API 호출)

### 커밋 히스토리 (Day 2 연장)
```
c0e84da feat: 필터별 맞춤 추천 (LLM에 직접 조건 전달)
88beaaa feat: SVG 아이콘 + 카드 탭 Detail + 필터 빈 상태 처리
24f3c10 docs: Day 2 개발 일지 추가
```

### 아키텍처 메모 (추후 참고)
- **필터 → LLM 프롬프트 주입 패턴:** `buildFilterPrompt()`가 필터 조건을 한국어 프롬프트로 변환. 서버 측에서 TMDB `origin_country`로 이중 검증. LLM이 조건을 무시해도 서버에서 걸러냄.
- **캐시 전략:** `neko_recs_movie_kr` 같은 키로 필터 조합별 캐시. 재설정 시 `RECS_FILTERED_PREFIX`로 시작하는 키 전부 삭제.
- **레이트 리밋:** 인메모리 Map 기반. Vercel serverless라 인스턴스 간 공유 안 됨. 심각한 남용 방지 수준. 프로덕션에서는 Upstash Redis 권장.

### 미해결 / 다음 할 일
- [x] "어제 추천받은 거 봤어?" 셀프 리포트 기능 → Day 3에서 완료
- [x] Vercel GitHub 자동 배포 연동 해결 → Day 3에서 완료
- [ ] Saved 화면 고도화 (OTT별 그룹핑? 시청 완료 표시?)
- [ ] 추천 품질 개선 (사용자 스와이프 데이터 반영)
- [ ] Obsidian 체크리스트 업데이트

---

## 2026-04-07 (Day 3)

### 진행 요약
에이전트 하네스 구축 + 셀프 리포트 기능 + Vercel CI/CD + 디자인 리뷰/anti-slop 수정 + OTT 통합 + UX 대규모 개선 + PWA 앱 설치.

### 완료된 작업

**에이전트 하네스 구축**
- 5인 에이전트 팀 (Producer-Reviewer 패턴):
  - rec-engineer: OpenAI 프롬프트 + TMDB 필터링
  - content-manager: TMDB API + OTT 가용성 + 메타데이터
  - frontend-builder: React 컴포넌트 + 애니메이션
  - ux-reviewer: DESIGN.md 준수 + 터치 UX 리뷰
  - qa-tester: 통합 정합성 + 엣지 케이스
- 6개 스킬 + 오케스트레이터 (neko-orchestrator)
- CLAUDE.md에 하네스 컨텍스트 등록
- Obsidian에 스킬 매핑 예시 문서 작성

**셀프 리포트 기능**
- Saved에서 "봤어요?" → 인생작/재밌었어/그저그래/포기 반응
- 시청 리포트 통계 카드 (Saved 상단)
- 시청 피드백 → OpenAI 프롬프트에 반영 (추천 개인화)
- "오늘 뭐 볼까" → 안 본 작품 우선 추천

**Vercel GitHub 자동 배포**
- GitHub App (Vercel) 설치로 자동 배포 연동
- "unverified commit" 문제 해결 (설정 변경)
- main push → 프로덕션 자동 배포 확인

**디자인 리뷰 + Anti-Slop 수정**
- UX 리뷰: PASS 20 / FAIL 5 / WARN 5 항목 도출
- 필터 칩/Undo 버튼 44px 터치 타겟 확보
- BottomNav active:scale 터치 피드백 추가
- 온보딩 그리드 3열 → 4열 (DESIGN.md 준수)
- 유니코드 문자 (✕✓⭐♡◆) → SVG 아이콘 전면 교체
- 빈 상태 좌측 정렬 탈템플릿화
- "지금 보기 →" 문구 컨텍스트별 변주

**OTT 통합 고도화**
- TMDB provider → OTT 검색 URL 매핑 (11개 OTT)
- Google Favicon API로 OTT 앱 아이콘 표시 (wavve는 직접 참조)
- 모바일: Universal Link/커스텀 스킴으로 OTT 앱 직접 실행
- TMDB /credits API → 감독 + 주연 4명 정보 추가
- Provider 타입: `string[]` → `{ name, logoUrl }[]` 확장

**UX 대규모 개선**
- Discover: like/pass 스와이프 → 좌우 캐러셀 브라우징으로 전환
- 카드 전환: 주크박스 회전 애니메이션 (cubic-bezier 스프링)
- Detail: 카드 위로 스와이프 → 손가락 추적 바텀시트 (제스처 기반)
- 바텀시트: 아래로 드래그하여 닫기 (포인터 추적 + 30% 임계값)
- 저장 버튼: filled/outline 하트 토글 (저장 취소 가능)
- 온보딩: 헤더(타이틀/선택/검색) 상단 고정, 그리드만 스크롤
- 시작하기 버튼 하단 고정 (그라디언트 페이드)
- 로딩: 스피너 애니메이션 추가
- Pass/Undo/3버튼 제거 → 저장 1버튼 + 진행 인디케이터로 단순화
- Saved Detail도 동일한 제스처 바텀시트 적용

**PWA 앱 경험**
- 앱 아이콘 생성 (512/192/180/32px, Warm Cinema 오렌지 N)
- manifest 색상 수정 (#0C0A09)
- apple-touch-icon, favicon 추가
- 모바일 방문 시 설치 유도 배너 (iOS 안내 + Android 네이티브)

### 커밋 히스토리 (Day 3)
```
c6fbb8b feat: PWA 설치 유도 배너 (iOS 안내 + Android 네이티브 설치)
ddb0681 feat: UX 대규모 개선 — 캐러셀 스와이프 + 제스처 바텀시트 + 하트 토글
ba5dedb fix: 온보딩 버튼 하단 고정 + 로딩 스피너 + OTT 앱 딥링크
479e506 feat: PWA 앱 아이콘 + manifest 수정
09db84b chore: Vercel 배포 테스트
61b7184 feat: OTT 직접 링크 + favicon 아이콘 + 감독/출연진 정보
f9dcee7 fix: anti-slop 수정 + 터치 타겟 개선
9ef5b9d chore: 에이전트 하네스 구축 (5 에이전트 Producer-Reviewer 팀)
17d3e37 feat: 셀프 리포트 — 시청 피드백으로 추천 개인화
```

### 아키텍처 메모
- **제스처 바텀시트 패턴:** CSS 애니메이션이 아닌 `translateY(%)` 직접 제어. `detailY` state (0=완전 열림, 100=닫힘)을 터치 이벤트에서 실시간 업데이트. `detailAnimating` flag로 스냅 시에만 transition 적용.
- **OTT 아이콘 전략:** Google Favicon API (`/s2/favicons?domain=...&sz=64`) 우선, SPA로 favicon 감지 안 되는 경우 (wavve) `iconOverride`로 직접 지정.
- **시청 피드백 → 추천:** `WatchFeedback { loved[], dropped[] }` → `buildFeedbackPrompt()` → LLM 프롬프트에 주입. "인생작과 비슷한 결 더 추천 + 포기한 류 제외".

### 미해결 / 다음 할 일
- [ ] 한글 폰트 개선 (Helvetica 방향 vs 현행 유지 — 보류)
- [ ] 앱 캐릭터/로고 디자인 → 로딩 스피너 리디자인
- [ ] Saved 화면 고도화 (OTT별 그룹핑?)
- [ ] 추천 품질 개선 (사용자 피드백 데이터 더 활용)
- [ ] Detail 바텀시트 내부 스크롤 vs 드래그 닫기 충돌 개선

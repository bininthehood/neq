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
- 스플래시 스크린: 앱 진입 시 로고 + "오늘 뭐 볼까?" 1.4초 표시 → 페이드 전환
- 앱 아이콘 생성 (512/192/180/32px, Warm Cinema 오렌지 N)
- manifest 색상 수정 (#0C0A09)
- apple-touch-icon, favicon 추가
- 모바일 방문 시 설치 유도 배너 (iOS 안내 + Android 네이티브)

### 커밋 히스토리 (Day 3)
```
9ee04e8 feat: 스플래시 스크린 — 앱 진입 시 로고/브랜드 1.4초 표시 후 페이드 전환
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
- [x] Detail 바텀시트 내부 스크롤 vs 드래그 닫기 충돌 개선 → Day 4에서 CSS scroll-snap으로 해결

---

## 2026-04-08 (Day 4)

### 진행 요약
피드백 9건 대량 구현 + 카드 UX 대규모 리팩토링 (5차 진화) + 디자인 리뷰(Codex+서브에이전트 병렬) + 버그 수정 다수.

### 완료된 작업

**피드백 9건 구현**
- Pull-to-refresh: 아래로 끌어당겨 추천 새로고침
- Detail 버튼: 하단 액션 바에 상세보기 버튼
- OTT 필터: Discover 필터 칩에 OTT별 필터
- 온보딩 레이아웃: 5슬롯 플레이스홀더 + 3로우 그리드 고정
- 메타데이터: TMDB /details API → 러닝타임, 시즌, 국가, 스틸컷
- 셀프 리포트 강화: 4단계(loved/good/meh/dropped) 모두 프롬프트 반영
- OTT 필터: 클라이언트 측 provider별 필터링
- 제목 오표기: 영문 검색 시 TMDB 공식 한글 제목으로 교정
- 재설정: /reset 페이지 (경고 → 작품 재선택, Saved 유지)

**추천 속도 3배 개선**
- TMDB API 순차 처리 → 2단계 병렬 배치 (검색 15건 동시 → 메타데이터 동시)

**카드 UX 5차 진화**
1. 기존 틴더 → 좌우 캐러셀 (Day 3)
2. rotation 기반 → 3D 원통형 캐러셀 → 모바일 왜곡/성능 문제
3. 평면 peek 캐러셀 → 중앙정렬/50% 멈춤 버그
4. CSS scroll-snap 기반 재작성 → 좌우는 JS, 상하는 네이티브
5. **부채꼴 카드 덱** (최종) → 10장 미리 렌더, 맨 앞 카드 치우면 뒤 카드 승격

**디테일 UX 진화**
- 바텀시트 → JS 제스처 → CSS scroll-snap (최종)
- 위로 스와이프 → scroll-snap으로 디테일에 착지
- 아래로 스와이프 → snap으로 카드 복귀

**디자인 리뷰 (/design-review)**
- Codex + Claude 서브에이전트 병렬 코드 감사
- 8건 수정: Geist 폰트 유출, 순수 블랙 제거, 터치 타겟 44px (6곳), prefers-reduced-motion, borderRadius 토큰 통일, InstallBanner 워며블랙 그림자

### 핵심 버그 수정
- 카드 전환 깜빡임 (React key 리마운트)
- BottomNav 줌 (active:scale 영역)
- 50% 드래그 멈춤 (stale closure)
- 드래그 중 카드 미추적 (정수 vs 소수점 인덱스)
- 스와이프 방향 반전
- 이전 카드 복귀 불가 → prevCard 추가
- 마지막 카드 이후 화면 없음 → 첫 카드 순환
- Pull-to-refresh 누락 복원
- 좌우 스와이프 중 detail 이동 (scrollLocked)
- 스피너 미회전 (인라인 transform override)

### 커밋 히스토리 (Day 4)
```
776c1f1 fix: 좌우 스와이프 중 detail 이동 방지 + 스피너 회전 수정
5b6515a fix: 아래로 스와이프 pull-to-refresh 복원
4c4483c fix: 이전 카드 복귀 + 마지막 카드 순환
1bc2943 style(design): FINDING-F10 — OTT 아이콘 borderRadius 토큰
ee5ae74 style(design): FINDING-F4/F5/F6 — Saved 터치 타겟 44px
cc3eda4 style(design): FINDING-F2 — InstallBanner 워며블랙 그림자
4683300 style(design): FINDING-006 — prefers-reduced-motion
1601b4e style(design): FINDING-003 — 터치 타겟 44px
e125004 style(design): FINDING-002 — 배경 var(--bg) 통일
3dfe2dd style(design): FINDING-001 — Geist 폰트 유출 방지
03de515 feat: 부채꼴 카드 덱 + CSS 진입 애니메이션
63795f3 refactor: CSS scroll-snap 기반 카드/디테일 전면 재작성
da76c57 feat: Day 4 피드백 9건
7954d7e feat: TMDB 메타데이터 확장 + 제목 교정 + 셀프 리포트 강화
(+ 다수 버그 수정 커밋)
```

### 아키텍처 메모
- **부채꼴 카드 덱**: topIdx부터 3장을 역순 렌더 (뒤→앞). 맨 앞 카드만 dragX/dragY 적용. 치우면 topIdx+1. DOM 생성/삭제 없이 인덱스만 변경 → 전환 매끄러움.
- **CSS scroll-snap 디테일**: 카드(snap 1, 100%) + 디테일(snap 2, auto). 상하는 브라우저 네이티브 스크롤, 좌우만 JS 터치. 수평 드래그 중 scrollLocked로 수직 스크롤 차단.
- **TMDB 병렬**: 15건 검색 동시 → 성공한 것들 provider+credits+details 동시 조회. 순차 대비 약 3배 빠름.

### 미해결 / 다음 할 일
- [x] 앱 캐릭터/로고 → 스피너 리디자인 → Day 5에서 완료
- [x] Saved 화면 고도화 → Day 5에서 완료
- [x] 카드 덱에서 이전 카드로 돌아갈 때 진입 애니메이션 개선 → Day 5에서 완료
- [ ] 한글 폰트 개선 (보류)
- [ ] /review (코드 리뷰) — 새 세션에서 실행 권장

---

## 2026-04-09 (Day 5)

### 진행 요약
Saved 화면 대규모 고도화 + 추천 품질 개선 + 스와이프 UX 전면 리팩토링 + 브랜드 스피너/로고 리디자인.

### 완료된 작업

**Saved 화면 고도화**
- 필터 탭: "전체 / 안 본 작품 / 시청 완료" 전환. 각 탭에 편수 표시.
- OTT별 그룹핑: 토글 버튼으로 Netflix, Disney+ 등 OTT별 섹션 분리. 작품 수 많은 순 정렬.
- 진행률 바: 시청 완료/미시청 비율을 오렌지 프로그레스 바로 시각화. "N편 남음" 카운터.
- 스마트 정렬: "전체" 탭에서 안 본 작품 상단, 시청 완료 하단 자동 정렬.
- 빈 상태 분기: 필터별 맞춤 빈 상태 메시지.
- PosterCard 컴포넌트 추출: 그리드/OTT그룹 양쪽에서 재사용.

**추천 품질 개선**
- seen 제목 추적: `neko_seen_titles` localStorage로 스와이프한 작품 제목 기록 (최대 200개).
- 제외 목록: API 호출 시 seen + saved 제목을 최대 50개까지 LLM에 전달. 이미 본 작품 재추천 방지.
- 프롬프트 개선: 장르 다양성 (최소 3개 장르), 시대 다양성 (최근작+클래식), 발굴 비율 70% 명시.
- Temperature: 0.9 → 0.85. 랜덤성 유지하면서 품질 안정화.
- 재설정 시 seen 초기화.

**스와이프 UX 전면 리팩토링**
- 이전 카드 끌어오기: 오른쪽 드래그 20px 넘기면 즉시 topIdx 감소 → 이전 카드가 화면 왼쪽 바깥에서 시작, 손가락을 따라 실시간 끌려옴. 단일 동작 애니메이션.
- 임계값 판정: 충분히 끌어오면 스프링 착지, 덜 끌어오면 왼쪽으로 밀려나고 topIdx 원복.
- prevEntering: 전환 순간 모든 카드 transition 끔 → 현재 카드 즉시 뒤로 깔림, 이전 카드만 움직임.
- 키보드: ArrowLeft = 다음(왼쪽으로 넘기기), ArrowRight = 이전(끌어오기). 스와이프 방향과 일치.

**브랜드 스피너/로고 리디자인**
- NekoSpinner: 필름 릴 모티프 SVG. 외부 오렌지 아크 회전 + 내부 릴 구멍 6개 점진적 투명. `animate-spin-slow` (2.4초 주기). Discover 로딩 + pull-to-refresh에 적용.
- NekoLogo: N 레터마크 SVG. 둥근 surface 배경 위 오렌지 스트로크. 스플래시 화면의 PNG 이미지 대체.
- 스플래시 애니메이션: 로고 scale(0.8→1) + translateY 진입, 텍스트 150ms 딜레이 순차 등장.

### 사용자 피드백 → 반영
- "오른쪽으로 넘겨 보는 게 편하다" → 스와이프 방향 조정 (키보드 일치)
- "이전 카드를 끌어오는 애니메이션" → prevDragging 구현 (손가락 추적 + 단일 동작)
- "현재 카드가 날아가고 이전 카드가 들어오는 2번 액션 문제" → prevEntering으로 현재 카드 즉시 뒤로 깔림

### 커밋 히스토리 (Day 5)
```
3481166 feat: Day 5 — Saved 고도화 + 추천 품질 개선 + 스와이프 UX + 브랜드 스피너
```

### 아키텍처 메모
- **prevDragging 패턴**: 오른쪽 드래그 감지(20px) → 즉시 topIdx 감소 + prevEntering=true (transition 전체 끔) → 이전 카드를 화면 왼쪽 바깥(-screenW)에 배치 + startX 보정 → prevEntering=false + prevDragging=true (top만 transition 끔) → 손가락 따라 dragX 업데이트 → touchEnd에서 임계값(-120px) 판정. 오버슈트 시 topIdx 원복.
- **seen 추적**: `neko_seen_titles` (string[], 최대 200). nextCard 시 title+titleEn 기록. API에서 최대 50개 전달. 재설정 시 클리어.
- **OTT 그룹핑**: 첫 번째 provider 기준 그룹. 작품 수 내림차순 정렬. provider 없으면 "기타".

### Day 5 후반 — 스와이프 리팩토링 + 구조 변경 + 신규 기능

**이전 카드 오버레이 모델**
- 기존: 드래그 중 topIdx 전환 → 끊김. 변경: 이전 카드를 별도 오버레이 레이어로 렌더.
- prevOverlayX로 손가락 위치 1:1 추적. topIdx는 놓을 때만 변경.
- 30% 임계값: 충분히 끌면 착지, 아니면 원복. boxShadow로 깊이감.

**Detail 바텀시트 오버레이**
- 기존: card-detail이 같은 scroll-snap 컨테이너 → 본문 스와이프 시 카드 복귀 문제.
- 변경: detail을 fixed 바텀시트(z-50)로 분리. 카드와 완전히 독립된 레이어.
- 핸들바 드래그(25% 임계값) / X버튼 / Escape로만 닫기 가능.
- 본문 자체 overflow-y-auto. touch-action/overscrollBehavior로 뒤쪽 전파 차단.

**화면 바운스 방지**
- html/body에 position: fixed + overflow: hidden. iOS 고무밴드/Android overscroll 완전 차단.

**카드 탭 → "봤어요?" 피드백**
- 카드 탭(드래그 5px 미만) → 인라인 리액션 피커(인생작/재밌었어/그저그래/포기).
- 리액션 선택 → Saved 저장 + watchReport 기록 + seen 추가 → 다음 카드.
- "안 봤어요" → seen만 기록. 추천 알고리즘에 반영.

**공유 기능**
- Web Share API 지원 시 네이티브 공유 시트, 미지원 시 클립보드 복사.
- Discover 하단 + 디테일 바텀시트 + Saved 디테일에 공유 버튼.
- 공유 텍스트: 제목 + 추천 이유 + OTT 목록.

**Saved 아카이브**
- 시청 완료 작품에 아카이브 토글 버튼(✓). 기본 뷰에서 숨김.
- "아카이브" 탭: 아카이브 작품이 있을 때만 표시. 복원(↩) 가능.

**코드 리뷰 (/review)**
- exclude 프롬프트 인젝션 방어 (타입 체크 + 50자 제한 + 특수문자 제거)
- dead variable 제거, seen 추적 누락 복원, 빈 상태 아이콘 추가

### 커밋 히스토리 (Day 5 후반)
```
05faffc feat: Saved 아카이브 — 시청 완료 작품 숨기기/복원
e3d0011 feat: 공유 기능 — Web Share API + 클립보드 폴백
5dbc684 feat: 카드 탭 → '봤어요?' 시청 피드백
a31fe9c fix: 위아래 스와이프 시 화면 전체 바운스 방지
ed38690 fix: Detail 바텀시트 뒤쪽 스크롤 전파 차단
feeae26 refactor: Detail을 scroll-snap에서 분리, fixed 바텀시트 오버레이로 전환
c2d3c69 refactor: 이전 카드 스와이프를 오버레이 모델로 전면 리팩토링
ca696a6 fix: 코드 리뷰 4건 수정 — exclude 인젝션 방어
```

### 아키텍처 메모
- **prevOverlay 패턴**: 오른쪽 드래그 dx>0 즉시 prevOverlayX 활성화. filtered[topIdx-1]을 z-20 오버레이로 렌더. 놓을 때만 topIdx 변경 또는 원복.
- **바텀시트 패턴**: fixed inset-0 z-50 + translateY(detailY%). touchAction:none으로 뒤쪽 전파 차단. 본문은 touch-action:pan-y + overscroll-behavior:contain.
- **"봤어요?" 패턴**: addSaved → addWatchReport → addSeenTitles → nextCard. 저장+피드백+제외가 하나의 동작.

### Day 5 최종 — 피드백 반영 + 필터 UX + 인터랙션

**필터 드롭다운**
- 3개 칩(유형/국가/OTT) 한 줄 고정, 탭 시 아래로 드롭다운 패널.
- 초기 라벨: "유형 ▾" / "국가 ▾" / "OTT ▾"로 카테고리 가이드.
- OTT 다중 선택 지원. 칩 라벨: 0개="OTT", 1개=이름, 2+="OTT N개".

**스켈레톤 UI**
- 로딩 시 스피너 → 포스터 형태 스켈레톤 카드 (pulse 애니메이션).
- 체감 로딩 시간 단축.

**전역 드래그 방지**
- html/body: user-select:none, -webkit-user-drag:none.
- img: 드래그 차단.

**"봤어요?" UI 리디자인**
- 하단 그라디언트 배경 (포스터 위 자연스럽게).
- 균일한 색상 칩 (danger 색상 제거). "중간에 포기" → "안 맞았어".
- 수평 flex-wrap 레이아웃. 강요 느낌 제거.

**양방향 무한 순환**
- 첫 카드에서 오른쪽 스와이프 → 마지막 카드로 순환.
- 마지막 카드에서 왼쪽 스와이프 → 첫 카드로 순환. 양방향 무한.

**카드 탭 영역 분리**
- 포스터 영역 탭 → "봤어요?" 피커.
- 하단 정보 영역(타이틀/요약/OTT) 탭 → Detail 바텀시트 열기.

**Saved 스크롤 수정**
- 작품 누적 시 하단 네비를 뚫고 넘어가는 문제 수정.
- 그리드를 overflow-y-auto 컨테이너로 감쌈.

**Detail 스와이프 다운 닫기**
- 본문 scrollTop===0일 때 아래로 드래그 → 시트 닫기.
- 스크롤 중에는 닫기 드래그 비활성.

### 커밋 히스토리 (Day 5 최종)
```
c492fd0 feat: 카드 하단 타이틀/요약 영역 탭 → Detail 열기
3f347f7 fix: 4건 피드백 — 스켈레톤 UI, 드래그 방지, 봤어요? 개선, 양방향 순환
cd4e3d0 style: 필터 칩 초기 라벨 — 유형 | 국가 | OTT
1b91a3a refactor: 필터 칩을 드롭다운 패널로 전환 + OTT 다중 선택
ee78299 style: 필터 칩 접기/펼치기
fad2045 fix: Detail 스와이프 다운 닫기 복원
687108e fix: Saved 그리드 스크롤
```

### 미해결 / 다음 할 일
- [x] 한글 폰트 개선 (보류) → 해요체 톤 통일로 대체
- [x] 추천 품질 A/B 비교 → 프롬프트 구조화로 대체

---

## 2026-04-09~10 (Day 5 연장 ~ Day 6)

### 진행 요약
대규모 리팩토링 (M0~M5 마일스톤) + 리브랜딩 (Neko → neq,) + UX 피드백 대량 반영 + 프리페치. 커밋 40+개.

### 마일스톤 완료

**M0: 디자인 시스템 코드 적용**
- Tailwind v4 인라인 스타일 → 유틸리티 클래스 마이그레이션
- 필터 칩, 버튼 계층, 카드 레이아웃, 온보딩 개선
- 터치 타겟 44px 최소 보장 (접근성)

**M1: 성능 최적화**
- next/image 적용, 로딩 스켈레톤, 에러 바운더리
- env 검증 (서버 시작 시 API 키 확인)

**M2: Discover 리팩토링**
- 892줄 모놀리스 → 컴포넌트 + 훅 분리
- SwipeCard, DetailSheet, FilterChips, ActionBar, StatusScreens
- useSwipeGesture, useDetailSheet, useRecommendations 훅

**M3: 추천 품질**
- 히스토리 UI, 프롬프트 다양성 강화, 레이트 리미터 개선

**M4: PWA 강화**
- Service Worker, 오프라인 폴백, 보안 헤더, 폰트 프리로드

**M5: 폴리시**
- 햅틱 피드백, 스와이프 애니메이션, 시간대별 추천, 스태거 진입, 공유 개선

### 리브랜딩: Neko → neq,

- 프로젝트명 전면 변경: UI, localStorage 키, 컴포넌트명, 아이콘
- 앱 아이콘: "neq," 텍스트 로고 (워며블랙 + 오렌지 세리프)
- GitHub 레포: bininthehood/Neko → bininthehood/neq
- manifest, 메타데이터, 공유 텍스트 전체 교체

### UX 피드백 반영

**온보딩**
- 소개 페이지 카피: "당신의 취향을 발견하세요" → "3개만 골라주세요, 나머지는 제가 찾을게요"
- SVG 아이콘 (클래퍼보드, 다이아몬드, 스와이프)
- "다른 작품 보기" 클릭 시 스크롤 즉시 맨 위로

**Discover**
- 스와이프 다운 → "봤어요?" 오버레이 (커튼처럼 상단에서 내려옴)
- 하단 정보 영역 탭 → Detail 열기
- "관심 없어요" 옵션 추가
- 첫 카드 우측 스와이프 시 힌트 토스트

**봤어요? UI 통일**
- Discover와 Saved 동일한 디자인: "본 적 있나요?" + 균일한 칩 스타일

**추천 프롬프트**
- 구조화: [역할] → [선정 기준] → [제외] → [추천 이유 작성법] → [출력 형식]
- reason: 글자 수 제한(20~30자) → 2~3문장 구조 (핵심 매력 + 취향 연결)
- 해요체 톤 통일

**프리페치**
- 남은 카드 8장 이하일 때 다음 배치 백그라운드 자동 로드
- 빠르게 넘겨도 끊김 없는 무한 스크롤 경험

### 주요 커밋
```
b878368 fix: 추천 이유 길이 개선 — 2-3문장 구조
13e303e feat: 프리페치 — 남은 카드 8장 이하일 때 자동 로드
7e83b1c rebrand: Neko → neq, — 프로젝트명 전면 변경
7d5d6cc refactor: 추천 프롬프트 전면 정리
3c53453 style: Saved 봤어요? UI를 Discover와 통일
85a322a style: 앱 아이콘 교체
e352971 fix(ux): discover interaction overhaul — 7 UX issues
2cd5902 feat(polish): M5 complete
7b1e4be feat(pwa): M4 complete
d24c5f5 refactor(discover): M2 complete — 892줄 모놀리스 분리
b807219 feat(design): M0 complete
```

### 미해결 / 다음 할 일
- [ ] 로고/브랜드 아이덴티티 확정 (고양이 실루엣 vs 텍스트)
- [ ] OG 이미지 + 공유 카드
- [ ] 랜딩 페이지 (미설치 사용자용)
- [ ] DB 연동 (사용자 리텐션 확인 후)
- [ ] 카카오 로그인 (DB 연동 시)

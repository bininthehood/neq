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

---

## 2026-04-10 (Day 7)

### 진행 요약
프로필 탭 신설 (백엔드 전환 대비 설계), 측정 인프라 구축 (PostHog 통합), UX 디테일 보완.
"만드는 것"에서 "측정해서 배우는 것"으로 포커스 이동.

### 완료된 작업

**프로필 탭 신설 (backend-ready 아키텍처)**
- 계정 시스템은 시기상조라는 판단 — 대신 계정 없이도 의미 있는 프로필 탭 구축
- 목표: 지금 localStorage로 시작하되, 나중에 백엔드 붙을 때 재작성 없이 마이그레이션 가능하게
- `src/lib/device-id.ts`: 익명 UUID 생성 → 나중에 계정 linking key로 재사용
- `src/lib/types.ts`: `UserDataExport` 스키마 정의 (미래 `/api/user/sync` 응답 스펙과 동일)
- `src/lib/store.ts`: `exportUserData`, `importUserData`, `clearAllUserData` 함수
- `src/app/profile/page.tsx`: 내 취향 / 시청 통계 / 설정 / 앱 정보
- `BottomNav`: 2탭 → 3탭 (Discover / Saved / Profile)
- 초반에 백업 내보내기/불러오기 UI도 넣었다가 제거 — "AI가 만든 기능" 느낌. 함수는 store.ts에 보존해서 향후 백엔드 sync에서 재사용.

**UX 디테일 보완**
- `handleCardTap`이 `showWatched`를 토글하던 것 → 상세 시트 열기로 변경
- "본 적 있나요?" 오버레이는 아래로 스와이프(드롭다운 패턴)로 호출
- 첫 카드에서 오른쪽 스와이프 차단 + "첫 번째 작품이에요" 토스트 표시
- Discover 헤더에서 `1/N` 카운터 + 재설정 버튼 제거 (프로필 탭으로 이관)
- Profile 페이지 `overflow-hidden` 구조 수정 — BottomNav가 스크롤에 말려 올라가던 버그

**Anti-slop UI 개선 (2차)**
- 사용자 피드백: "전반적으로 LLM이 만든 느낌"
- 필터 칩: pill fill → 밑줄 탭 스타일 (텍스트 + border-bottom accent)
- ActionBar: 동일 원형 3개 → 비대칭 (저장 버튼만 크게 xl, 나머지 icon-only)
- 토스트: pill + border → rounded-lg + box-shadow + accent dot
- 봤나요 리액션: 균일 pill 4개 → 감정별 tint (인생작=accent, 안 맞았어=danger)
- Saved 필터 탭: pill → 밑줄 스타일로 통일
- "OTT별 보기": pill 버튼 → 텍스트 링크
- 전반적으로 border 최소화, shadow/배경색 차이로 구분

**필터/무한스크롤 버그 수정**
- OTT 필터로 남은 카드가 적어질 때 자동으로 loadMore 호출되지 않던 문제 → 프리페치 useEffect 추가
- 중복 작품 많이 나오던 문제 → exclude 목록 50개 → 150개 확장 (프롬프트 + loadMoreRecs 모두)
- Saved 다녀오면 첫 카드로 초기화되던 문제 → `topIdx`를 sessionStorage에 저장/복원
- 필터 축소로 topIdx가 범위 밖이 되는 경우 clamp 처리

**측정 인프라 구축 (PostHog)**
- 배경: 성공 지표 (온보딩 완료율, 시청 리포트 전환율, 발견감 등)가 코드로는 정해졌지만 실제 측정 안 됨
- 초기엔 Vercel Analytics custom events로 시도 → Hobby 플랜 미지원 확인 후 PostHog으로 전환
- `src/lib/analytics.ts`: `track(event, props)` 헬퍼 + `NekoEvent` 타입 (22종 이벤트)
- `src/components/PostHogProvider.tsx`: 클라이언트 초기화 + `deviceId`를 `distinct_id`로 identify
- 22개 이벤트 인스트루먼테이션:
  - 온보딩: `onboarding_started`, `favorite_added`, `completed`
  - 추천: `recommendation_loaded`, `load_more`, `failed`
  - 카드: `card_swiped`, `tapped`, `saved`, `unsaved`, `not_interested`
  - 상세: `detail_opened` (source: card_tap | saved_tap)
  - 리포트: `watch_report_submitted`
  - OTT: `ott_link_clicked`
  - 공유: `card_shared`
  - 필터: `filter_changed`
  - 프로필: `profile_viewed`, `data_reset`
- React Strict Mode 이중 실행 버그 발견 → `trackedRef` 가드 패턴으로 수정
  (profile_viewed가 6회 찍혔는데 실제 방문은 3회였음)

**PostHog CLI 조회**
- Personal API Key + Project ID 환경변수로 저장
- curl + jq로 터미널에서 실시간 이벤트 조회 가능
- 첫 실사용 데이터 확인: card_swiped 16, card_saved 5 → 저장율 31%

**카피 피드백 반영**
- 반말 톤 → 해요체로 복구 (~해요, ~세요, ~할게요)
- AI slop 제거는 유지하되 격식 있는 존댓말 유지
- 추천 이유 프롬프트도 해요체 톤으로 수정

### 배운 점

**"완벽한 기능"보다 "측정 가능한 배포"가 우선**
- 기능 개선만 하다 보면 "이게 좋아졌을까?"를 감으로만 판단하게 됨
- PostHog 붙이고 나니 처음으로 실제 저장율(31%)이 숫자로 보였음
- 앞으로 모든 UX 이터레이션은 "이 숫자가 올라갔나"로 검증할 수 있게 됨

**"AI가 만든 느낌"이 제품 차별화의 최대 적**
- 균일한 rounded-full pill, 동일 크기 버튼, 균일 그리드 — AI가 디폴트로 내놓는 패턴
- Anti-slop의 핵심은 "감정별 tint, 크기 불균일, border 최소화, 비대칭 배치"
- 기능보다 디테일에서 수제 느낌이 나옴

**백엔드 전환을 지금 설계해두면 마이그레이션이 공짜**
- `device_id` + 스키마 버전 + export/import 포맷 = 나중 API 계약의 미리보기
- store.ts 함수 인터페이스 유지 → 나중엔 sync→async 전환만으로 백엔드 연결
- "지금은 localStorage, 나중엔 API"를 한 곳에서 분기 가능

### 주요 커밋
```
44618f3 fix(analytics): React Strict Mode 이중 실행 방지 (ref guard 추가)
4a1f42a feat(analytics): Vercel Analytics custom events → PostHog으로 교체
373253d feat(analytics): 사용자 행동 이벤트 트래킹 인프라 추가
ed50ab9 fix(profile): BottomNav를 맨 아래 고정
cb2ccd0 refactor(profile): 데이터 백업 UI 제거, discover 헤더 재설정 버튼 제거
e0548a7 feat(profile): add profile tab with backend-ready data layer
a6593f0 fix(discover): exclude buffer 150, ott filter auto-reload, restore scroll position
13e303e feat: 프리페치 — 남은 카드 8장 이하일 때 다음 배치 자동 로드
b878368 fix: 추천 이유 길이 개선 — 글자 수 제한
```

### 현재 상태
- PostHog에 첫 실사용 데이터 쌓이기 시작 (29개 커스텀 이벤트)
- 저장율 31% (card_saved / card_swiped) — 기준선 확보
- 추천 품질 추가 개선 방향을 이제 데이터로 정할 수 있음

### 미해결 / 다음 할 일
- [ ] 로고/브랜드 아이덴티티 확정
- [ ] 커스텀 도메인 (DAU 30+ 전에)
- [ ] PostHog Funnel 대시보드 구성 (온보딩 이탈, 저장→시청 리포트 전환)
- [ ] Retention 측정 (1주일 데이터 모인 후)
- [ ] 에러 모니터링 (Sentry 또는 자체 endpoint)
- [ ] OpenAI 비용 알림 설정
- [ ] 첫 외부 사용자 초대 (본인 네트워크 10명)

---

## 2026-04-13 (Day 8)

### 진행 요약
Hybrid 추천 아키텍처 실동작 검증 + 버그 수정, Sentry 에러 모니터링 추가, 25개 시나리오 QA.
배포 전 안정성 확보에 집중.

### 완료된 작업

**Hybrid 추천 아키텍처 검증 (A1)**
- 실제 API 호출로 기본/필터/에러 케이스 테스트
- 기본 추천: 20개 정상, 응답 warm 2.6초 ✅
- 발견한 버그 3개 수정:
  - 시리즈 필터 결과 0개 → movie+series 양쪽 /recommendations 호출
  - reason 10-15자 → 프롬프트 강화로 26-33자
  - 같은 제목 중복 → ID + title 이중 제거
- enrichCandidates 50개 동시 → 10개 배치 + 25개 조기 종료

**Sentry 에러 모니터링 (A2)**
- @sentry/nextjs 설치 + client/server/edge 3개 설정
- error.tsx에서 Sentry.captureException 자동 리포트
- production에서만 활성화, 성능 10% 샘플링
- DSN 미설정 시 무시됨 (안전)

**엣지 케이스 QA (B1)**
- qa-tester 에이전트로 25개 시나리오 검증
- 24 PASS, 0 FAIL, 1 WARN
- 수정된 FAIL 3개:
  1. clearAllUserData()가 favorites_meta/튜토리얼 플래그 미정리
  2. 온보딩 검색 fetch 실패 시 무한 "검색 중..." 로딩
  3. DetailSheet에서 OTT providers 0개 시 빈 영역

### 주요 커밋
```
7dcf6ea fix(qa): 엣지 케이스 QA — 3개 FAIL 수정, 25 시나리오 검증
fc84220 feat(monitoring): Sentry 에러 모니터링 추가
4ed1078 fix(rec): Hybrid 추천 검증 — 시리즈 필터 + reason 길이 + 중복 제거
```

### 현재 상태
- 추천 아키텍처 검증 완료: warm 2.6초, 20개 정상 반환
- 에러 모니터링 준비 완료 (Sentry DSN 연결만 남음)
- 25개 엣지 케이스 중 24개 PASS
- OpenAI 비용 알림 설정 미진행 (대시보드 직접 설정 필요)

### 미해결 / 다음 할 일
- [x] ~~시리즈 필터 결과 부족~~ → 크로스타입 보충으로 20개 달성
- [x] ~~cold start 16초~~ → 4초로 단축 (TMDB trending 직접 반환)
- [x] ~~v0.3 로드맵 작성~~ → /office-hours로 디자인 문서 승인 완료
- [ ] Sentry DSN 발급 + 환경 변수 설정
- [ ] OpenAI 비용 알림 $10/$30 설정
- [ ] 첫 외부 사용자 초대 (10명 목표)
- [ ] PostHog Funnel 대시보드 구성

---

## 2026-04-13 (Day 8 continued)

### 진행 요약
v0.3 로드맵 수립(office-hours) + M6~M8 기술 작업 완료. 외부 사용자 확보만 남음.

### 완료된 작업

**v0.3 디자인 문서 (/office-hours)**
- 스타트업 모드로 진행. 6가지 질문 중 Q1(수요 현실), Q5(관찰) 집중
- 핵심 인사이트: "추천받은 걸 실제로 봤는지"를 아직 한 번도 측정 못 함
- Approach B 선택: 리텐션 기능 + 사용자 확보 병행
- 리뷰어 서브에이전트 검증 (6/10 → 수정 후 승인)
- 디자인 문서: ~/.gstack/projects/bininthehood-Neko/james-main-design-20260413-150809.md

**M6: Cold Start 16초 → 4초 (75% 단축)**
- favorites 없는 신규 사용자를 위한 전용 빠른 경로 구현
- TMDB trending/week API로 직접 반환, LLM 큐레이션 완전 스킵
- reason은 평점/타입 기반 템플릿 (coldStartReason 함수)
- OpenAI 비용: cold start에서 $0

**M6.5: 신규 사용자 첫 진입 플로우**
- cold start 전용 로딩 메시지: "요즘 인기 작품을 가져오고 있어요..."
- 기존 "취향을 분석하고 있어요"는 favorites 있는 사용자에게만

**M7: 년도별 필터 + 예능 카테고리**
- 년도: 최근(2020~) / 2010년대 / 클래식(~2009) — 클라이언트 사이드 필터
- 예능: TMDB Reality(10764) + Talk(10767) 장르 기반 — 서버 사이드 필터
- 별점순 정렬은 의도적으로 제외 (추천 다양성 파괴 위험)

**M8: 시청 리포트 넛지 UX**
- Saved 페이지: 저장 24시간+ 미시청 작품 상위 2개 개별 넛지 카드
  - "봤어요" (reaction=good 빠른 기록) / "나중에" (48시간 숨김)
- Discover 재진입 토스트: "[작품명] 봤어요?" 탭→Saved 이동, 5초 자동 사라짐
- 4개 analytics 이벤트: nudge_shown/reported/dismissed, reentry_nudge_shown
- "추천→저장→시청→리포트" 루프의 마지막 퍼즐

**D1: 시리즈 필터 5개 → 20개**
- TMDB /discover API로 크로스타입 보충 (장르 기반)
- with_genres OR 조건(|) 사용 발견 (AND는 결과 0개)

### 배운 점

**"별점순 정렬을 넣지 말자"는 제품 판단**
- 사용자가 원하는 기능이 항상 좋은 기능은 아님
- 별점 필터는 다양성을 파괴하고 neq의 존재 이유(숨겨진 명작 발굴)와 충돌
- 넷플릭스가 별점을 없앤 이유와 같음: 별점이 행동을 예측하지 못함

**사용자 데이터 없이 기능을 더 만드는 건 비효율**
- 8일간 기술 작업만 집중했는데, 정작 "추천이 좋은지"를 모름
- 10명의 1주일 데이터가 다음 3개월 방향을 정해줄 것

### 주요 커밋
```
d51f6be feat(retention): 시청 리포트 넛지 UX — 개별 카드 + 재진입 토스트
0d5e16b feat(filter): 년도별 필터 + 예능 카테고리 추가
0a4fe20 ux(discover): cold start 시 로딩 메시지 개선
cafe1cf perf(rec): Cold start 16초 → 4초 — TMDB trending 직접 반환
ba356f3 feat(rec): 크로스타입 추천 보충 — 시리즈 필터 5개 → 20개
4ed1078 fix(rec): Hybrid 추천 검증 — 시리즈 필터 + reason 길이 + 중복 제거
7dcf6ea fix(qa): 엣지 케이스 QA — 3개 FAIL 수정
fc84220 feat(monitoring): Sentry 에러 모니터링 추가
```

### 현재 상태 (v0.3)
- 기술 작업 M6~M8 전체 완료
- M9(사용자 10명 확보)만 남음 — 이건 코드가 아니라 행동
- PostHog에 넛지 전환율 측정 준비 완료
- 성공 기준: 7일 재방문 3명+, Save→시청 리포트 4명+

### 다음 할 일 (The Assignment)
- [ ] 10명 연락처 리스트 작성
- [ ] 카톡 공유 메시지 작성
- [ ] 평일 저녁 8시 발송
- [ ] 1주일 후 PostHog 데이터 리뷰
- [ ] 1:1 피드백 수집 ("뭐가 별로였어?")

---

## 2026-04-13 (Day 8 continued — 오후)

### 진행 요약
v0.3 기술 작업(M6-M8) + 추천 아키텍처 근본 리팩토링 + 전체 점검.
하루에 36개 커밋. 가장 큰 변경은 "loadMore 제거 + 대량 배치 캐시" 리팩토링.

### 완료된 작업

**v0.3 디자인 문서 (/office-hours)**
- 스타트업 모드, Approach B(리텐션 + 사용자 확보) 승인
- M6-M9 마일스톤 정의

**M6: Cold Start 16초 → 4초**
- TMDB trending API 직접 반환 (LLM 스킵, $0)
- cold start 전용 로딩 메시지

**M7: 년도별 필터 + 예능 카테고리**
- 년도: 2020~ / 2010년대 / ~2009 (클라이언트+서버 하이브리드)
- 예능: TMDB Reality(10764) + Talk(10767) 장르 기반
- 별점순 정렬은 의도적 제외 (다양성 파괴 위험)
- 크로스타입/년도 보충 로직 추가 (TMDB discover API)

**M8: 시청 리포트 넛지 UX**
- Saved 페이지: 24시간+ 미시청 작품 개별 넛지 카드 (최대 2개)
- Discover 재진입: "[작품명] 봤어요?" 토스트 (세션당 1회)
- 4개 analytics 이벤트 추가

**추천 아키텍처 근본 리팩토링 (가장 큰 변경)**
- 업계 표준 비교 분석 (인스타/넷플릭스/틴더 vs neq)
- loadMore 함수 완전 제거 (모든 버그의 근원이었음)
- 서버: 50개 대량 배치 반환 (LLM 20개 + 템플릿 30개)
- 클라이언트: prefetchNextBatch로 교체 (남은 10개에서 트리거)
- TMDB 랜덤 페이지 + 결과 셔플 (매번 다른 추천)
- 코드 32줄 순감 (-96, +64)

**UX 개선**
- immersive 모드: 탭 → 포스터만 풀스크린, UI 전부 숨김
- 스켈레톤 카드: 덱 뒤에 로딩 중 표시
- ActionBar에 새로고침 버튼 추가
- 데이터 초기화 → /discover로 이동 (onboarding 대신)
- touch-action: none으로 passive event listener 해결

**버그 수정 (12건)**
1. 시리즈 필터 0개 → 크로스타입 보충으로 20개
2. reason 너무 짧음 → 프롬프트 강화 (26-33자)
3. 같은 제목 중복 → ID + title 이중 제거
4. 무한 loadMore 루프 → exhausted 상태 + 자동 refresh
5. 중복 카드 (duplicate key) → 3중 tmdbId 방어
6. 캐시 1개 상태 멈춤 → 최소 5개 이상 체크
7. 초기화 시 같은 작품 → 랜덤 페이지 + 셔플
8. passive event listener → touch-action: none
9. 프리페치 429 → topIdx===0 가드
10. prefetch 연쇄 호출 → ref 기반 가드
11. stale closure 3건 → swipingRef + recsRef + prefetchAbortRef
12. rate limit → 60/분으로 완화

**전체 점검 (4단계)**
1. Health: TS 0 에러, 빌드 성공
2. Code Review: 3 FAIL 수정 (stale closure, race condition)
3. QA 엣지 케이스: 20 PASS, 0 FAIL
4. Playwright E2E: 5개 흐름 정상, 콘솔 에러 0개

### 배운 점

**loadMore는 아키텍처 실수였다**
- dedup, 무한 루프, stale closure, race condition — 모든 버그가 loadMore에서 시작
- "조금씩 가져오는" 패턴은 stateless 서버 + 클라이언트 캐시 조합에서 본질적으로 취약
- 대량 배치(50개) + 클라이언트 페이지네이션이 훨씬 단순하고 안정적
- 업계(인스타, 넷플릭스)는 사전 계산 + 서버 상태로 이 문제를 근본 해결

**실사용 테스트가 최고의 QA**
- 코드 리뷰로 못 잡는 버그: "1시간 스와이프하면 같은 카드만 나옴"
- 이런 건 "시간 + 반복"에서만 나타남
- 10명 사용자 테스트가 왜 중요한지 다시 확인

### 주요 커밋 (36개 중 핵심)
```
09d8c56 fix: 코드 리뷰 FAIL 3건 — stale closure + race condition 수정
6b1b2db fix: prefetch 연쇄 호출 방지 — ref 기반 가드 추가
abd9951 refactor(rec): 대량 캐시 + 클라이언트 페이지네이션 — loadMore 제거
70ab69e fix(critical): 무한 loadMore 루프 — 추천 풀 소진 감지
d51f6be feat(retention): 시청 리포트 넛지 UX
0d5e16b feat(filter): 년도별 필터 + 예능 카테고리 추가
cafe1cf perf(rec): Cold start 16초 → 4초
ba356f3 feat(rec): 크로스타입 추천 보충 — 시리즈 필터 5개 → 20개
fc84220 feat(monitoring): Sentry 에러 모니터링 추가
```

### 현재 상태
- v0.3 기술 작업 M6-M8 완료
- 추천 아키텍처: 대량 배치 50개 + prefetch (loadMore 제거)
- 전체 점검 통과: TS 0, QA 20/20, E2E 5/5, 콘솔 에러 0
- M9(사용자 10명 확보)만 남음

### 다음 할 일
- [ ] Sentry DSN 발급 + 환경 변수 설정
- [ ] OpenAI 비용 알림 $10/$30 설정
- [ ] 10명 연락처 리스트 + 카톡 메시지 발송
- [ ] 1주일 데이터 후 PostHog Funnel 리뷰
- [ ] WARN 항목 중 year "all" 복귀 시 데이터 편향 이슈 해결

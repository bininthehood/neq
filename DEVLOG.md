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

### 미해결 / 다음 할 일
- [ ] "어제 추천받은 거 봤어?" 셀프 리포트 기능
- [ ] Vercel 배포 (`bunx vercel --prod`)
- [ ] 더 많은 사용자 피드백 수집
- [ ] Vercel GitHub 자동 배포 연동 해결

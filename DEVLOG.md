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
- [ ] Pass 되돌리기(Undo) 기능
- [ ] DESIGN.md 작성 및 코드에 디자인 시스템 적용
- [ ] OpenAI 조직 인증 → /design-shotgun AI 목업 생성
- [ ] "어제 추천받은 거 봤어?" 셀프 리포트 기능
- [ ] /cso 보안 감사 (API 키 노출 점검)
- [ ] Vercel GitHub 자동 배포 연동 해결 (현재 CLI 수동 배포)
- [ ] 더 많은 사용자 피드백 수집 (5-10명 목표)

### 기술 스택
- Next.js 16 (App Router) + Tailwind CSS 4
- OpenAI GPT-4o (추천) + TMDB API (콘텐츠 데이터)
- Vercel 배포, localStorage 저장

### 커밋 히스토리
```
13e7d60 feat: 온보딩 추천을 장르별 인기작 믹스로 변경
dc506f2 feat: 온보딩 추천 목록 새로고침 기능
d5803fb feat: Discover 헤더에 '취향 재설정' 버튼 추가
c15b68d feat: 별점 TMDB 출처 표시 + 온보딩 추천 작품 그리드
222622b fix: 카드 스와이프 UX 전면 개선
ccc252f fix(qa): ISSUE-002 — saved item delete button always visible on mobile
30438ad fix(qa): ISSUE-001 — hydration mismatch on discover page
c545da4 feat: Neko MVP — onboarding, discover swipe, saved screen
1ab573e Initial commit from Create Next App
```

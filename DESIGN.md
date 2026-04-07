# Design System — Neko

## Product Context
- **What this is:** OTT 콘텐츠 발굴/큐레이션 모바일 PWA
- **Who it's for:** 2030 직장인. 퇴근 후 소파에서 한 손으로 "오늘 뭐 볼까" 해결.
- **Space/industry:** OTT 콘텐츠 디스커버리 (틴더식 스와이프)
- **Project type:** Mobile-first PWA (390x844 기준)

## Aesthetic Direction
- **Direction:** Warm Cinema
- **Decoration level:** Intentional (미세한 그레인 텍스쳐, 포스터 중심)
- **Mood:** 영화관의 따뜻한 간접 조명. 포스터가 주인공이고 UI는 어둠 속에 녹아듦. 사람 손이 만든 느낌, AI slop 철저히 배제.
- **Anti-slop:** 보라 그라디언트 금지, 균일한 둥근 모서리 금지, 3열 아이콘 그리드 금지, 센터 정렬 일변도 금지, 그라디언트 버튼 금지.

## Typography
- **Display/Hero:** Fraunces (optical size, weight 700-900) — 율동적인 세리프. 영화 타이틀, "오늘 뭐 볼까?" 같은 헤드라인에 사용. AI가 절대 기본값으로 선택하지 않는 폰트.
- **Body:** Pretendard Variable — 한글 UI 최적. 본문, 라벨, 추천 이유, 설명 텍스트.
- **UI/Labels:** Pretendard Variable (weight 500)
- **Data/Tables:** Outfit (tabular-nums) — 평점, 숫자, 카운터. 깔끔한 숫자 전용.
- **Code:** JetBrains Mono
- **Loading:** Pretendard CDN (cdn.jsdelivr.net/gh/orioncactus/pretendard), Google Fonts (Fraunces, Outfit)
- **Scale:**
  - xs: 11px / 0.6875rem
  - sm: 13px / 0.8125rem
  - base: 15px / 0.9375rem
  - lg: 18px / 1.125rem
  - xl: 22px / 1.375rem
  - 2xl: 28px / 1.75rem
  - 3xl: 36px / 2.25rem
  - display: 48px / 3rem

## Color
- **Approach:** Restrained + Warm
- **Background:** #0C0A09 — 워며 블랙. 순수 블랙보다 사람 손이 닿은 느낌.
- **Surface:** #171412 — 카드, 모달 배경
- **Surface Raised:** #211C18 — 호버, 활성 상태
- **Border:** #2E2722 — 미세한 구분선
- **Text Primary:** #F5F0EB — 워며 화이트. 차가운 #FFF 대신.
- **Text Secondary:** #9C8E82 — 따뜻한 회색
- **Text Muted:** #5C5048 — 비활성 텍스트
- **Accent:** #E87B35 — 번트 오렌지. Save, CTA, 긍정적 행동. 영화관 간판의 따뜻함.
- **Accent Dim:** rgba(232, 123, 53, 0.15) — 액센트 배경
- **Danger:** #DC4A3A — 따뜻한 빨강. Pass, 삭제.
- **Warning:** #D4942A — 따뜻한 노랑
- **Info:** #5B8CD4 — 차분한 파랑
- **Success:** #4A9E5C — 자연스러운 초록 (확인/완료에만 사용, 주액센트 아님)
- **Dark mode:** 이것이 기본. 라이트 모드 없음.

## Spacing
- **Base unit:** 8px
- **Density:** Comfortable — 피곤한 상태에서도 정확히 누를 수 있는 터치 타겟
- **Scale:** 2xs(2) xs(4) sm(8) md(16) lg(24) xl(32) 2xl(48) 3xl(64)
- **Minimum touch target:** 44x44px

## Layout
- **Approach:** Full-bleed + asymmetric
- **Discover:** 카드가 화면의 85%. 시스템 UI는 카드 위 반투명 오버레이.
- **Saved:** 2열 비대칭 그리드 (Pinterest식). 단조로운 균일 그리드 금지.
- **Onboarding:** 4열 포스터 그리드
- **Max content width:** 480px (모바일 최적화)
- **Border radius:**
  - sm: 4px (뱃지, 태그)
  - md: 8px (입력, 작은 카드)
  - lg: 12px (카드, 모달)
  - xl: 16px (메인 카드)
  - full: 9999px (버튼, 아바타)

## Motion
- **Approach:** Intentional + physics-based
- **Card swipe:** 스프링 물리학 — cubic-bezier(0.34, 1.56, 0.64, 1). Tension → release.
- **Enter:** ease-out (요소가 화면에 등장)
- **Exit:** ease-in (요소가 화면에서 퇴장)
- **Move:** ease-in-out (위치 변경)
- **Duration:**
  - micro: 50-100ms (호버, 토글)
  - short: 150-250ms (페이드, 슬라이드)
  - medium: 250-400ms (카드 전환, 오버레이)
  - long: 400-700ms (전체 화면 전환)

## Texture
- **Film grain:** 미세한 노이즈 오버레이 (opacity 3-5%). Surface와 빈 카드 배경에 적용.
- **Gradient overlay:** 카드 하단 정보 영역에 from-transparent via-background/80 to-background.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-06 | 초기 디자인 시스템 제안 (Cinematic Dark) | /design-consultation 첫 실행 |
| 2026-04-07 | Warm Cinema로 변경, 오렌지 액센트 | "LLM이 만든 느낌" 피드백. 초록→오렌지, 순수블랙→워며블랙, Fraunces 세리프 추가 |
| 2026-04-07 | Variant A 선택 | 클래식 시네마틱 방향. AI 목업 비교 후 확정 |

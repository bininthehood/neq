# Design System — neq

## Product Context
- **What this is:** OTT 콘텐츠 발굴/큐레이션 모바일 PWA
- **Who it's for:** 2030 직장인. 퇴근 후 소파에서 한 손으로 "오늘 뭐 볼까" 해결.
- **Space/industry:** OTT 콘텐츠 디스커버리 (틴더식 스와이프)
- **Project type:** Mobile-first PWA (390x844 기준)

## Aesthetic Direction
- **Direction:** Warm Cinema
- **Decoration level:** Intentional (미세한 그레인 텍스쳐, 포스터 중심)
- **Mood:** 영화관의 따뜻한 간접 조명. 포스터가 주인공이고 UI는 어둠 속에 녹아듦. 사람 손이 만든 느낌, AI slop 철저히 배제.
- **Anti-slop:** 아래 금지 목록 참조. AI가 만든 느낌을 철저히 배제.

### Anti-slop 금지 목록
1. 보라/바이올렛 그라디언트 배경
2. 균일한 둥근 모서리 (모든 요소에 같은 큰 radius)
3. 3열/4열 균일 아이콘 그리드 (같은 크기, 같은 간격)
4. 센터 정렬 일변도 (모든 헤딩, 설명, 카드가 text-align: center)
5. 그라디언트 버튼
6. `border-left: Npx solid accent` 스타일 인용 블록 (AI가 좋아하는 패턴)
7. 에모지를 디자인 요소로 사용 (🚀 헤딩, ✨ 불릿 등). 텍스트/아이콘으로 대체.
8. `text-[10px]` 이하 폰트 사이즈. 최소 xs=11px.
9. 장식용 blob, 물결 SVG 디바이더
10. "Welcome to X", "Unlock the power of..." 류 제네릭 카피

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
- **Accent Hover:** #F08942 — 호버 시 밝아지는 오렌지
- **Accent Dim:** rgba(232, 123, 53, 0.15) — 액센트 배경
- **Danger:** #DC4A3A — 따뜻한 빨강. Pass, 삭제.
- **Warning:** #D4942A — 따뜻한 노랑
- **Info:** #5B8CD4 — 차분한 파랑
- **Success:** #4A9E5C — 자연스러운 초록 (확인/완료에만 사용, 주액센트 아님)
- **Dark mode:** 이것이 기본. 라이트 모드 없음.

## Overlay 토큰
포스터 위 텍스트, 모달 배경, 스와이프 피드백 등에 사용하는 반투명 레이어 체계.
모든 오버레이는 워며 블랙(12, 10, 9) 기반. 차가운 순수 블랙 금지.

| 토큰 | opacity | 용도 |
|------|---------|------|
| `--bg-overlay-light` | 0.4 | 시청 완료 포스터 딤 |
| `--bg-overlay` | 0.7 | 뱃지, 태그, 힌트 배경 |
| `--bg-overlay-heavy` | 0.85 | 포스터 하단 그라디언트 종점 |
| `--bg-overlay-dense` | 0.92 | 인라인 리액션 피커 |
| `--bg-overlay-solid` | 0.97 | 상세 모달 (거의 불투명) |

**Border/Dim 토큰:**
- `--accent-border`: rgba(232, 123, 53, 0.3) — 액센트 보더
- `--accent-border-light`: rgba(232, 123, 53, 0.2) — 약한 액센트 보더
- `--danger-overlay`: rgba(220, 74, 58, 0.25) — Pass 스와이프 피드백
- `--text-primary-dim`: rgba(245, 240, 235, 0.08) — 텍스트 컬러 기반 미세 배경

## Spacing
- **Base unit:** 8px
- **Density:** Comfortable — 피곤한 상태에서도 정확히 누를 수 있는 터치 타겟
- **Scale:** 2xs(2) xs(4) sm(8) md(16) lg(24) xl(32) 2xl(48) 3xl(64)
- **Minimum touch target:** 44x44px

## Layout
- **Approach:** Full-bleed + asymmetric
- **Discover:** 카드가 화면의 85%. 시스템 UI는 카드 위 반투명 오버레이.
- **Saved:** 2열 비대칭 그리드 (Pinterest식). 단조로운 균일 그리드 금지.
- **Onboarding:** 3열 비대칭 포스터 그리드 (aspect-ratio 변화)
- **Max content width:** 480px (모바일 최적화)
- **Border radius:**
  - sm: 4px (뱃지, 태그)
  - md: 8px (입력, 작은 카드)
  - lg: 12px (카드, 모달)
  - xl: 16px (메인 카드)
  - full: 9999px (버튼, 아바타)

## Responsive
- **기본:** Mobile-first (390x844 기준). 480px max-width 컨테이너.
- **태블릿 (768px+):** 콘텐츠 중앙 정렬. 배경에 radial gradient (surface → 더 어두운 블랙).
- **데스크톱 (1024px+):** max-width 420px로 더 좁게. 미세한 accent glow shadow.
- **전략:** 모바일 레이아웃이 주인공. 태블릿/데스크톱은 "영화관 스크린" 느낌으로 감싸기.
- **금지:** `user-scalable=no`, `maximum-scale=1` (접근성 위반)

## Grid
- **원칙:** 비대칭 그리드 우선. 균일한 n열 반복 금지.
- **Discover:** 카드 1장이 화면의 85%. 스와이프 인터랙션.
- **Saved:** 2열 비대칭 (높이 변화: `i % 3 === 0 ? 240px : 200px`). Pinterest식.
- **Onboarding:** 3열 비대칭 (aspect-ratio 변화: `2/3` ↔ `2/3.5`).
- **금지:** 균일한 4열 이상 그리드. 모든 카드가 같은 크기인 레이아웃.

## Accessibility
- **터치 타겟:** 모든 인터랙티브 요소 최소 44x44px. 작은 아이콘 버튼이라도 패딩으로 터치 영역 확보.
- **Focus:** `focus:outline-none` 사용 시 반드시 `focus-visible:ring-2` 대체 제공.
- **확대:** viewport에서 `user-scalable=no` 금지. 사용자가 원하면 확대 가능해야 함.
- **컬러:** 색상만으로 정보 전달 금지. 아이콘, 라벨, 패턴 병행.
- **모바일:** `autoFocus` 금지 (모바일에서 키보드 자동 팝업 방지).

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
| 2026-04-07 | 디자인 시스템 고도화 | /design-review 결과 반영: overlay 토큰 체계, 반응형 전략, 접근성 규칙, anti-slop 보강, 비대칭 그리드 규칙 추가 |

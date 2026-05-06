# Design System — neq

## Product Context
- **What this is:** OTT 콘텐츠 발굴/큐레이션 모바일 PWA
- **Who it's for:** 2030 직장인. 퇴근 후 소파에서 한 손으로 "오늘 뭐 볼까" 해결.
- **Space/industry:** OTT 콘텐츠 디스커버리 (스와이프 기반)
- **Project type:** Mobile-first PWA (390x844 기준)

## Aesthetic Direction
- **Direction:** Quiet Ink
- **Decoration level:** Minimal — 포스터가 유일한 색채. UI는 잉크처럼 배경에 스며든다.
- **Mood:** 독립서점의 큐레이션 선반. 갤러리 전시실의 여백. 포스터가 주인공이고 UI는 절제된 타이포와 여백으로 존재감을 드러낸다.
- **Brand essence:** "당신의 문화적 감각을 신뢰하는 공간"
- **Brand personality:** Discerning(안목), Unhurried(여유), Ownable(소유감)
- **Anti-slop:** 아래 금지 목록 참조. AI가 만든 느낌을 철저히 배제.

### Anti-slop 금지 목록
1. 보라/바이올렛 그라디언트 배경
2. 균일한 둥근 모서리 (모든 요소에 같은 큰 radius)
3. 3열/4열 균일 아이콘 그리드 (같은 크기, 같은 간격)
4. 센터 정렬 일변도 (모든 헤딩, 설명, 카드가 text-align: center)
5. 그라디언트 버튼
6. `border-left: Npx solid accent` 스타일 인용 블록 (AI가 좋아하는 패턴)
   - 예외 1: CardVariantB pull-quote 한정 (2026-05-02 Decisions Log).
   - 예외 2: DetailSheet/Saved reason 인용구 한정 (2026-05-02 amber 누적 분배 정책 — 면 → 선 전환). 다른 컴포넌트 복제 금지.
7. 에모지를 디자인 요소로 사용 (텍스트/아이콘으로 대체)
8. `text-[10px]` 이하 폰트 사이즈. 최소 xs=11px.
   - 예외: Geist Mono uppercase + letter-spacing 0.12em 이상 컨텍스트는 10px 허용 (잡지 eyebrow / 챕터 마크 / tech tag 톤).
9. 장식용 blob, 물결 SVG 디바이더
10. "Welcome to X", "Unlock the power of..." 류 제네릭 카피
11. 스카이 블루 액센트 (Discord/Linear 기본 링크 느낌)
12. 쿨 톤 다크 + 블루 조합 (개발자 도구 클리셰)
13. amber accent 누적 과부하 (한 화면에 amber 토큰 5개 이상 동시 노출 금지)
    - 카운트 규칙: 항상 동시에 보이는 amber 사용처를 1건으로 셈. focus-visible / transient overlay(toast, CoachMark) / CTA Save(브랜드 닻)는 카운트 제외.
    - ChapterMark 위계: 시트/페이지의 첫 ChapterMark 1개만 amber, 나머지는 `text-secondary` (uppercase + 0.12em tracking 유지).
    - reason 박스: 면(`bg-accent-dim`) 금지 → 선(`borderLeft 2px solid var(--accent-border)`) 강조 (anti-slop #6 예외 2 패턴).
    - 통계 숫자: 한 그룹당 1개만 amber, 나머지는 primary.
    - 보조 액션(공유, OTT "열기" 텍스트, Tonight 화살표 등) amber 금지 — 가중치/형태로 위계 표현.
    - selected 칩 그룹: 한 그룹의 selected 칩들은 시각적 연속이므로 1건으로 카운트(개수 무관). 그룹이 늘면 그룹 수만큼 카운트.

## Typography
- **Display/Hero:** Fraunces (optical size, weight 700-900) — 율동적인 세리프. 영화 타이틀, "오늘 뭐 볼까?" 같은 헤드라인에 사용.
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
- **Approach:** Restrained + Warm Neutral
- **Background:** #12110E — 미세한 웜 뉴트럴 다크. 차가운 쿨 블랙도, 브라운 블랙도 아닌 중도.
- **Surface:** #1A1916 — 카드, 모달 배경
- **Surface Raised:** #24231E — 호버, 활성 상태
- **Surface Sunken:** #0E0D0B — 인셋 영역, 입력 필드 배경
- **Border:** #2E2D27 — 기본 구분선
- **Border Subtle:** #22211C — 미세한 구분 (리스트 아이템 사이)
- **Border Strong:** #3A392F — 강조 구분선, 섹션 분리
- **Text Primary:** #EDEDEF — 뉴트럴 화이트. bg 위 대비비 14.8:1 (AAA)
- **Text Secondary:** #8E8F9A — 부제목, 메타 정보. 대비비 5.8:1 (AA)
- **Text Muted:** #6B6C75 — 비활성 텍스트, 힌트. 대비비 ~3.5:1 (대형 텍스트 AA)
- **Accent:** #C4A35A — 앰버 골드. Save, CTA, 긍정적 행동. 독립서점 조명의 따뜻한 금빛.
- **Accent Hover:** #D4B36A — 호버 시 밝아지는 골드
- **Accent Dim:** rgba(196, 163, 90, 0.12) — 액센트 배경
- **Accent Strong:** #B08940 — 액티브, 포커스 링
- **Danger:** #E05A4F — 따뜻한 빨강. Pass, 삭제. 버튼 텍스트는 --text-inverse 사용.
- **Danger Dim:** rgba(224, 90, 79, 0.14) — 위험 영역 배경
- **Warning:** #D4A245 — 경고
- **Info:** #7BA3D4 — 차분한 파랑 (accent와 구별되는 톤)
- **Success:** #4DB06A — 완료/확인
- **Dark mode:** 이것이 기본. 라이트 모드 없음.

## Overlay 토큰
포스터 위 텍스트, 모달 배경, 스와이프 피드백 등에 사용하는 반투명 레이어 체계.
모든 오버레이는 웜 뉴트럴(18, 17, 14) 기반.

| 토큰 | opacity | 용도 |
|------|---------|------|
| `--bg-overlay-light` | 0.4 | 시청 완료 포스터 딤 |
| `--bg-overlay` | 0.7 | 뱃지, 태그, 힌트 배경 |
| `--bg-overlay-heavy` | 0.85 | 포스터 하단 그라디언트 종점 |
| `--bg-overlay-dense` | 0.92 | 인라인 리액션 피커 |
| `--bg-overlay-solid` | 0.97 | 상세 모달 (거의 불투명) |

**Border/Dim 토큰:**
- `--accent-border`: rgba(196, 163, 90, 0.25) — 액센트 보더
- `--accent-border-light`: rgba(196, 163, 90, 0.15) — 약한 액센트 보더
- `--danger-overlay`: rgba(224, 90, 79, 0.22) — Pass 스와이프 피드백
- `--text-primary-dim`: rgba(237, 237, 239, 0.07) — 텍스트 컬러 기반 미세 배경

## Spacing
- **Base unit:** 4px
- **Density:** Comfortable — 피곤한 상태에서도 정확히 누를 수 있는 터치 타겟
- **Scale:** 2xs(2) xs(4) sm(8) md(16) lg(24) xl(32) 2xl(48) 3xl(64)
- **Minimum touch target:** 44x44px
- **좌우 여백:** 콘텐츠 20px (px-5), 그리드/필터 16px (px-4)

## Layout
- **Approach:** Full-bleed + asymmetric
- **Discover:** 카드가 화면의 85%. 시스템 UI는 카드 위 반투명 오버레이.
- **Saved:** 2열 비대칭 그리드 (Pinterest식). 단조로운 균일 그리드 금지.
- **Max content width:** 480px (모바일 최적화)
- **Border radius:**
  - sm: 4px (뱃지, 태그)
  - md: 8px (입력, 작은 카드)
  - lg: 12px (카드, 모달)
  - xl: 16px (메인 카드, 바텀시트)
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
- **금지:** 균일한 4열 이상 그리드. 모든 카드가 같은 크기인 레이아웃.

## Accessibility
- **터치 타겟:** 모든 인터랙티브 요소 최소 44x44px. 작은 아이콘 버튼이라도 패딩으로 터치 영역 확보.
- **Focus:** `focus:outline-none` 사용 시 반드시 `focus-visible:ring-2` 대체 제공.
- **확대:** viewport에서 `user-scalable=no` 금지. 사용자가 원하면 확대 가능해야 함.
- **컬러:** 색상만으로 정보 전달 금지. 아이콘, 라벨, 패턴 병행.
- **모바일:** `autoFocus` 금지 (모바일에서 키보드 자동 팝업 방지).
- **대비비:** text-primary on bg ≥ 14:1 (AAA), text-secondary ≥ 4.5:1 (AA), text-muted ≥ 3.0:1 (대형 텍스트 AA)

## Motion
- **Approach:** Intentional + physics-based + restrained
- **원칙:** 잉크가 종이 위에 스며들 듯, 차분하고 의도적. 동시 움직임 최대 3개.
- **Easing:**
  - `--ease-enter`: cubic-bezier(0.25, 1, 0.5, 1) — 요소 등장
  - `--ease-exit`: cubic-bezier(0.5, 0, 0.75, 0) — 요소 퇴장
  - `--ease-move`: cubic-bezier(0.45, 0, 0.55, 1) — 위치 이동
  - `--ease-spring`: cubic-bezier(0.34, 1.3, 0.64, 1) — 절제된 스프링 (30% 오버슈트)
  - `--ease-soft`: cubic-bezier(0.4, 0, 0.2, 1) — opacity/색상 전환
- **Duration:**
  - instant: 80ms (탭 피드백, 토글)
  - quick: 150ms (필터 전환, 드롭다운)
  - moderate: 250ms (페이드, 토스트)
  - steady: 350ms (바텀시트, 카드 스냅백)
  - slow: 500ms (풀스크린 전환)
- **규칙:** 닫힘은 열림보다 50ms 짧게. 사용자 입력 첫 반응 100ms 이내.
- **prefers-reduced-motion:** 장식 모션 비활성화. 드래그 추적 등 필수 상태 변화만 유지.

### Loading Interaction
- **방향:** Quiet Ink 보존 + pop art 향(워홀 실크스크린의 "면" 느낌)
- **패턴:** 타이포 중심. Fraunces 글자가 amber로 채워졌다가 비워지는 morph
- **금지:** 회전 dots(클래식 스피너), 보라/그라디언트, blob, 이모지
- **Duration:** 1400ms loop, --ease-soft
- **Reduced motion:** 정적 amber fill (애니메이션 정지)

## Interaction Model

### Discover 스와이프 (불변식)
| 제스처 | 동작 |
|-------|------|
| **좌 스와이프** (dragX < -80px) | 다음 카드 (`nextCard`) |
| **우 스와이프** | 이전 카드 오버레이 (`prevOverlayX`, 드래그 중 topIdx 유지) |
| **카드 탭** | Detail 바텀시트 열기 |
| **아래로 스와이프 (30%+)** | 바텀시트 닫기 / Discover 복귀 |

- **좌우 스와이프는 캐러셀 브라우징** 전용. like/pass/reject 의미 절대 부여 금지.
- 이전 카드 전환은 **오버레이 레이어**로만. 드래그 중 `topIdx` 변경 금지 — 놓을 때만 30%+ 조건에서 전환.
- 좋아요는 스와이프 아님. **명시적 버튼** (ActionBar 또는 카드 하단)로만 토글.
- "별로" / 거절 / Pass 제스처는 없음. 사용자가 싫으면 그냥 다음 카드로 넘어가면 됨.

### 터치 임계치
- 수평 스와이프 트리거: 80px
- 수직 바텀시트 닫기: 30% 화면 높이
- 방향 잠금: 첫 10px 이동 방향으로 잠금 (수평 vs 수직 혼동 방지)

## Tone & Voice
- **기본 톤:** 해요체 (부드러운 존댓말). "~습니다" 격식체 금지.
- **키워드:** 담백, 확신, 위트 (적절한 순간에만)
- **금지 표현:** 느낌표 연속, 이모지 UI, AI/알고리즘 언급, 과장 ("최고의", "완벽한")

## Content Categories (확장용)
영화/시리즈 외 확장 시 카테고리 구분 색상. 메인 UI에는 미사용, 뱃지/필터 칩에만 적용.

| 카테고리 | Hex | 비고 |
|---------|-----|------|
| 영화 | #C4A35A | 기본 액센트와 동일 |
| 시리즈 | #9B8AE0 | 라벤더 |
| 음악 | #E08A6C | 코랄 |
| 도서 | #7EC4A0 | 세이지 그린 |
| 공연 | #D4A245 | 앰버 |

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-06 | 초기 디자인 시스템 제안 (Cinematic Dark) | /design-consultation 첫 실행 |
| 2026-04-07 | Warm Cinema로 변경, 오렌지 액센트 | "LLM이 만든 느낌" 피드백. 초록→오렌지, Fraunces 세리프 추가 |
| 2026-04-07 | 디자인 시스템 고도화 | overlay 토큰 체계, 반응형 전략, 접근성 규칙, anti-slop 보강 |
| 2026-04-15 | Quiet Ink로 전환 | Warm Cinema 완전 탈피. 4인 디자인 팀(brand/ui/motion/critic) 순차 작업 |
| 2026-04-15 | C안 확정: 앰버 골드 + A안 폰트 | 크리틱 권고 반영. 블루→앰버(경쟁사 차별화), Fraunces 유지(개성) |
| 2026-05-02 | anti-slop #6 예외 1건 (CardVariantB pull-quote) | borderLeft 2px solid accent를 reason 인용구에 한정 사용. variant B의 Typography-led 디자인 언어 정체성. 다른 컴포넌트 복제 금지. |
| 2026-05-02 | DetailSheet morph ease 별도 컨텍스트 추가 | iOS sheet present 톤 위해 cubic-bezier(0.32, 0.72, 0.24, 1) 추가. 450/350ms enter/exit. 기존 motion 5종과 분리. |
| 2026-05-02 | anti-slop #8 예외: Geist Mono uppercase 0.12em+ 10px 허용 | 잡지 eyebrow / 챕터 마크 / tech tag 톤. Profile chaptermark 4건, error.tsx eyebrow/tech tag, OfflineBanner retry CTA에 적용. uppercase + tracking으로 가독성 보전. |
| 2026-05-02 | amber accent 누적 분배 정책 | DetailSheet/Profile에서 amber 동시 출현 9-10건 발견 → 한 화면 ≤ 4 정책. ChapterMark 첫 1개만 amber, 나머지 text-secondary uppercase 0.12em. reason 박스는 bg-accent-dim 면 → borderLeft accent 선(anti-slop #6 예외 2 추가). focus-visible / transient overlay / CTA Save는 카운트 제외. anti-slop #13 신규. |
| 2026-05-06 | 칩 selected = solid amber fill + inverse text | 좌측 borderLeft strip 패턴이 anti-slop #6 예외 2(reason 인용구 한정) 정책 위반 중. fill 전환으로 정합성 회복. accent #C4A35A 위 #12110E 텍스트 대비 ~12:1 (AAA). FilterChips, Saved 필터 칩 일괄. |
| 2026-05-06 | 로딩 인터랙션 = Fraunces 타이포 morph (C안 옵션 A) | 기존 3-dot 회전은 클래식 라인/기하학. Quiet Ink 정체성 보존하면서 활력 가미 = pop art 향. NeqSpinner 1곳 수정 → StatusScreens / FirstLoadingSkeleton / SearchSheet / Button(loading state) 자동 반영. |

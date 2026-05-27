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

## Brand Identity

### 워드마크 (Wordmark)
**정본:** `apps/web/public/neq-logo.png` (346×153, 투명 배경). 화면에 워드마크를 노출하는 모든 곳은 **이 이미지 자산을 그대로 사용**한다. 텍스트 + `font-display` + `text-accent` 조합으로 흉내내지 않는다.

| 항목 | 규칙 |
|------|------|
| 자산 | `/neq-logo.png` (라이트/다크 모드 공통, 색상 변형 미보유) |
| 호출 | `<img src="/neq-logo.png" alt="neq," className="h-5 object-contain" />` — height 만 변경, width 는 `object-contain` 으로 자동 |
| Alt | `alt="neq,"` 정본 (쉼표 포함, 브랜드 표기) |
| 기본 사이즈 | `h-5` (20px) — Discover 헤더, StatusScreens, ShareClient 등 |
| 작은 사이즈 | `h-4` (16px) 까지 허용. 그 이하는 식별성 저하로 금지 |
| 큰 사이즈 | 온보딩 hero 컨텍스트에서 `h-6` ~ `h-10` (24~40px) 허용 |
| Clear space | 워드마크 주위에 최소 자체 height 의 50% 여백 (`h-5` 사용 시 10px 여백) |
| Container | 부모 컨테이너 정렬은 `flex items-center` — baseline 정렬 금지 (쉼표가 baseline 보다 아래로 떨어짐) |
| Lazy loading | `next/image` 또는 plain `<img>` 모두 허용. PWA shell 이미지라 lazy 불필요. eslint 규칙 disable 주석 부여 (`// eslint-disable-next-line @next/next/no-img-element`) |

**금지:**
- ❌ `<span className="font-display text-accent">neq,</span>` — 텍스트 모방. 폰트가 다름(Fraunces 계열 ↔ Instrument Serif). 색상은 2026-05-13 amber 정합되었으나 폰트 모방 금지는 유지.
- ❌ 워드마크 위에 그라디언트/필터 오버레이.
- ❌ 워드마크 회전·기울임·왜곡.
- ❌ 워드마크를 글자 단위로 분리(`n` / `e` / `q` / `,`) 하여 재배치.
- ❌ Drop shadow / glow 등 장식 효과 (Quiet Ink anti-slop).

**문장 안 워드마크:** "neq, 앱으로 열기" 처럼 워드마크가 한 문장의 일부로 포함되는 경우(InstallBanner) 는 텍스트 처리 허용 (이미지로 분리 시 baseline·줄바꿈 문제). 이 때는 `font-display font-bold` 로 처리하되, 동일 시야에 워드마크 이미지(앱 아이콘 등)가 이미 노출되어 브랜드 인지가 확보된 컨텍스트에 한정.

**색상 정합 (2026-05-13 Phase 5 리컬러링):** 워드마크 자산은 amber `#C4A35A` 단색으로 정합됨. Warm Cinema 잔재(#E87B35) 해소. 폰트(Instrument Serif italic 계열 추정) + 형태는 유지. 변환 방식: 알파 채널 마스크 + 단색 fill (`_workspace/recolor-wordmark.js`, sharp). 백업 원본은 `_workspace/neq-logo.warm-cinema.png`.

### Metadata 텍스트 (검색·OG·시스템)
HTML `<title>`, OG `siteName`, manifest `short_name` 등 **렌더되지 않는 텍스트 컨텍스트**는 `"neq,"` 문자열 사용 (이미지 불가). 위치:
- `apps/web/src/app/layout.tsx` — `title`, OG, Twitter card
- `apps/web/public/manifest.json` — `name`, `short_name`
- `apps/web/src/app/share/[id]/page.tsx` — metadata title

### 앱 아이콘
| 자산 | 사이즈 | 용도 |
|------|--------|------|
| `apps/web/public/icon-512.png` | 512×512 | PWA manifest large icon |
| `apps/web/public/icon-192.png` | 192×192 | PWA manifest standard icon |
| `apps/web/public/apple-touch-icon.png` | 180×180 | iOS 홈스크린 |
| `apps/web/public/favicon.png` | 32×32 | 브라우저 탭 |
| `apps/web/public/og-image.png`, `og-image-square.png` | OG card | 공유 미리보기 |

**미정 (Phase 5 별도 작업):**
- 1024×1024 마스터 아이콘 (iOS 앱스토어 제출용, W7 블로커)
- 로고 마크(심볼) — 글자 없는 브랜드 식별자. design-critique 가 ""N" 폴백 이미지를 브랜드 시그니처로 발전"제안. 현재 PosterFallback 의 "N" 글자가 후보.
- 워드마크 amber 리컬러링 — Quiet Ink 정합. `design-orchestrator` 사이클로 분리.

## Typography
- **Display/Hero:** **Instrument Serif** (Google Fonts, weight 400 + italic) — 절제된 현대 세리프. 영문 헤드라인, 카드 메타("2024"), reason 인용구 italic. CSS var: `--font-display`. 한글 헤딩은 Pretendard 700 폴백 (Noto Serif KR 차순위).
- **Body:** Pretendard Variable — 한글 UI 최적. 본문, 라벨, 추천 이유, 설명 텍스트, **한글 제목** (700). CSS var: `--font-body`.
- **UI/Labels:** Pretendard Variable (weight 500)
- **Data/Tabular:** **Geist Mono** (Google Fonts, tabular-nums) — 평점, 연도, 러닝타임, 카운터 + eyebrow/챕터 마크/tech tag (uppercase + tracking 0.12em 컨텍스트, anti-slop #8 예외). CSS var: `--font-data`.
- **Loading:** Pretendard CDN (cdn.jsdelivr.net/gh/orioncactus/pretendard), `next/font/google` (Instrument Serif, Geist Mono — `layout.tsx` 에서 inject).
- **Weight 위계:** 400 본문 / 500 UI 라벨·버튼·네비 / 600 강조·활성 탭 / 700 한글 제목 (Instrument Serif 는 400 만 로드).
- **Scale:** size / line-height / letter-spacing — 큰 사이즈일수록 자간 음수로 옵티컬 보정.

| 토큰 | size | line-height | letter-spacing | 용도 |
|------|------|-------------|----------------|------|
| xs | 11px | 1.45 | 0.02em | 뱃지, 태그, 캡션 |
| sm | 13px | 1.45 | 0.01em | 메타, 부가 텍스트 |
| base | 15px | 1.5 | 0 | 본문, 추천 이유 |
| lg | 18px | 1.4 | -0.01em | 카드 제목, 섹션 헤딩 |
| xl | 22px | 1.3 | -0.015em | 페이지 제목, DetailSheet 제목 |
| 2xl | 28px | 1.25 | -0.02em | 대형 제목, Profile 통계 숫자 |
| 3xl | 36px | 1.2 | -0.025em | 히어로, SwipeCard 제목 |
| display | 48px | 1.1 | -0.03em | Fraunces 디스플레이 |

- **금지:** 10px 이하 폰트 (anti-slop #8) / text-transform uppercase 를 한글에 적용 / letter-spacing 0.12em 이상을 한글에 적용.

## Color
- **Approach:** Restrained + Warm Neutral
- **Background:** #12110E — 미세한 웜 뉴트럴 다크. 차가운 쿨 블랙도, 브라운 블랙도 아닌 중도.
- **Surface:** #1A1916 — 카드, 모달 배경
- **Surface Raised:** #24231E — 호버, 활성 상태
- **Surface Sunken:** #0B0A07 — 인셋 영역, 입력 필드 배경
- **Border:** #2E2D27 — 기본 구분선
- **Border Subtle:** #22211C — 미세한 구분 (리스트 아이템 사이)
- **Border Strong:** #3A392F — 강조 구분선, 섹션 분리
- **Text Primary:** #EDEDEF — 뉴트럴 화이트. bg 위 대비비 14.8:1 (AAA)
- **Text Secondary:** #8E8F9A — 부제목, 메타 정보. 대비비 5.8:1 (AA)
- **Text Muted:** #6B6C75 — 비활성 텍스트, 힌트. 대비비 ~3.5:1 (대형 텍스트 AA)
- **Accent:** #C4A35A — 앰버 골드. Save, CTA, 긍정적 행동. 독립서점 조명의 따뜻한 금빛.
- **Accent Hover:** #D4B36A — 호버 시 밝아지는 골드
- **Accent Dim:** rgba(196, 163, 90, 0.12) — 액센트 배경

포커스 링은 별도 strong 토큰 없이 `--accent` 직접 사용 (현재 사용처 0건 의 `--accent-strong` 토큰은 5/12 제거).
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
- **Base unit:** 4px. 모든 spacing 은 4px 의 배수. 예외 없음.
- **Density:** Comfortable — 피곤한 상태에서도 정확히 누를 수 있는 터치 타겟
- **Minimum touch target:** 44×44px
- **좌우 여백:** 콘텐츠 20px (px-5), 그리드/필터 16px (px-4)
- **Scale:**

| 토큰 | px | 배수 | 용도 |
|------|---|------|------|
| `--space-2xs` | 2 | 0.5× | 아이콘-텍스트 인라인 미세 간격 |
| `--space-xs` | 4 | 1× | 뱃지 내부, 아이콘 gap |
| `--space-sm` | 8 | 2× | 칩 간격, 그리드 gap, 리스트 아이템 사이 |
| `--space-md` | 16 | 4× | 섹션 내부 padding, 카드 내부 여백 |
| `--space-lg` | 24 | 6× | 섹션 간 간격, 페이지 좌우 여백 |
| `--space-xl` | 32 | 8× | 큰 섹션 간 간격, 페이지 하단 |
| `--space-2xl` | 48 | 12× | 페이지 상단 여백, 히어로 영역 |
| `--space-3xl` | 64 | 16× | 그라디언트 padding-top, 대형 간격 |

- **간격 원칙:** 같은 그룹 ≤ sm / 그룹 내 섹션 분리 = md / 섹션 간 = lg~xl / 페이지 수준 ≥ 2xl. 의심스러우면 넓혀라 — Quiet Ink 는 밀도보다 여백.

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
- **Focus:** `focus:outline-none` 사용 시 반드시 `focus-visible:ring-2 ring-[--accent]` 대체 제공. BottomNav 탭은 추가로 `border-radius: var(--radius-md)`.
- **확대:** viewport에서 `user-scalable=no` 금지. 사용자가 원하면 확대 가능해야 함.
- **컬러:** 색상만으로 정보 전달 금지 — 아이콘 / 라벨 / 패턴 / 방향 병행. Save vs Pass 스와이프는 색상 틴트뿐 아니라 방향성 자체가 1차 단서.
- **모바일:** `autoFocus` 금지 (모바일에서 키보드 자동 팝업 방지).
- **대비비:** text-primary on bg ≥ 14:1 (AAA), text-secondary ≥ 4.5:1 (AA), text-muted ≥ 3.0:1 (대형 텍스트 AA), text-inverse on accent ≥ 4.5:1 (AA). Danger·Accent 버튼 텍스트는 `--text-inverse` 사용 (`--text-primary` 사용 시 AA 미달).

### ARIA 라벨 매핑
| 컴포넌트 | aria-label / 역할 |
|---------|------------------|
| ActionBar 되감기 | "처음으로" |
| ActionBar 공유 | "공유" |
| ActionBar 상세 | "상세보기" |
| ActionBar 새로고침 | "새로고침" |
| ActionBar Save | "저장" (toggle: `aria-pressed`) |
| BottomNav | `<nav aria-label="메인 네비게이션">` |
| BottomNav 탭 | 탭별 설명 (예: "Discover — 추천 작품 탐색") |
| BottomNav 활성 탭 | `aria-current="page"` |
| Toast 컨테이너 | `role="status"` `aria-live="polite"` (성공) / `role="alert"` (에러) |
| Modal | `role="dialog" aria-modal="true" aria-labelledby={titleId}` |
| Skeleton | `aria-busy="true"` 부모에 적용, 자식에 `aria-hidden="true"` |

## States
공통 상태 규격. 컴포넌트 디테일은 `_workspace_20260417_172931/design-rebuild/02_states-spec.md` 참조.

### Skeleton (로딩)
- **배경:** `--surface`, 펄스 색상 `--surface-raised`.
- **애니메이션:** `skeleton-pulse 2s var(--ease-soft) infinite` (opacity 1 ↔ 0.4). Quiet Ink 호흡 = 1.5s → 2s 로 느리게.
- **Radius:** 각 요소의 기본 radius 따름. 모서리 날카로움 금지.
- **추천 생성 중:** 카드 스켈레톤 + 센터 텍스트 오버레이 ("취향에 맞는 작품을 고르고 있어요..."). 스피너 없이 텍스트 = Quiet Ink 침묵. 별도 NeqSpinner(Fraunces morph) 사용 시 회전 dots 금지.

### Empty State
| 속성 | 값 |
|------|---|
| 정렬 | 수직/수평 중앙 |
| 아이콘 | 48px, `--text-muted` |
| 아이콘 → 제목 gap | `--space-md` (16px) |
| 제목 | font-body, `--text-base`, 500, `--text-primary` |
| 설명 | font-body, `--text-sm`, 400, `--text-muted` |
| CTA | 설명 아래 `--space-lg` (24px), Ghost variant |
| max-width | 260px |

검색 결과 없음 / 인라인 빈 상태(Profile 좋아한 작품 없음 등)는 아이콘 생략 — 검색 입력·섹션 헤더가 이미 시각 앵커.

### Error State
- Empty 와 동일 구조, 아이콘 색상만 `--danger`.
- **포스터 로딩 실패 (카드 폴백):** 배경 `--surface`, font-display 5xl "N" 글자 + `--text-muted`. 에러 메시지 없음 — 조용한 폴백 = neq 브랜드 시그니처.
- **OTT 조회 실패:** 인라인 텍스트만 ("현재 한국 OTT에서 제공 정보를 찾지 못했어요"), 에러 톤 없이 담백.
- **검색 API 에러:** 조용한 실패(silent catch). 결과 리스트 비움. "결과가 없어요"로 표시 — 사용자에게 에러와 빈 결과 구분 안 함 (의도적).

### Toast (성공/에러 피드백)
| 속성 | 값 |
|------|---|
| 위치 | fixed top 64px, 수평 중앙 |
| padding | `px-4 py-2.5` |
| 배경 | `--surface-raised` |
| radius | `--radius-lg` |
| 인디케이터 dot | 6×6, 성공=`--accent`, 에러=`--danger` |
| 등장 | opacity 0→1 + translateY(-8→0), `--duration-moderate`, `--ease-enter` |
| 체류 | 2500ms |
| 퇴장 | opacity 1→0 + translateY(0→-4), `--duration-quick`, `--ease-exit` |
| 중복 | 새 토스트가 기존 토스트 즉시 교체. 동시 2개 금지 |

Pass 스와이프는 무언 — Toast 없이 카드만 사라짐.

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
- **카드 진입 회전:** 3deg (Warm Cinema 5deg 에서 축소). enterFromLeft/Right `rotate(±3deg)`.
- **Active scale 위계:** `scale(0.97)` 일반 버튼 / `scale(0.93)` 대형 버튼·Save / `scale(0.9)` 탭 아이콘·BottomNav. 단일 값으로 통일 금지 — 크기에 비례한 수축.

### prefers-reduced-motion 요소별 대체
| 요소 | 일반 | reduced |
|------|------|---------|
| 카드 스와이프 드래그 추적 | 1:1 실시간 | **유지** (사용자 직접 조작) |
| 카드 스냅백 | 스프링 350ms | 즉시 위치 변경 |
| 바텀시트 드래그 추적 | 1:1 실시간 | **유지** |
| 바텀시트 열림/닫힘 | 슬라이드 350/250ms | 즉시 표시/숨김 |
| Toast 등장·퇴장 | 페이드+슬라이드 | 즉시 표시 후 시간 경과로 즉시 숨김 |
| 필터 칩 전환 | 색상 150ms | 즉시 색상 변경 |
| 스켈레톤 펄스 | 2s 무한 반복 | 정적 단색 surface |
| Immersive 확장 | 350ms | 즉시 확장 |
| 모달 스케일 | 0.96→1, 250ms | 즉시 표시 |
| 버튼 active scale | 0.97, 80ms | scale 변경 생략 |
| NeqSpinner Fraunces morph | 1400ms loop | 정적 amber fill |

### Loading Interaction
- **방향:** Quiet Ink 보존 + pop art 향(워홀 실크스크린의 "면" 느낌)
- **패턴:** 타이포 중심. Fraunces 글자가 amber로 채워졌다가 비워지는 morph
- **금지:** 회전 dots(클래식 스피너), 보라/그라디언트, blob, 이모지
- **Duration:** 1400ms loop, --ease-soft
- **Reduced motion:** 정적 amber fill (애니메이션 정지)

## Iconography
- **Source of truth:** `_design-handoff/` (Claude Design `neq-design-v2` bundle, 2026-04-29).
  - 정본: `_design-handoff/Phase 4 - Full Prototype.html` (line 169-182, `TabIcon*` 함수).
  - 후속 카피 수정: `_design-handoff/Round 3 - Copy Revisions.html` (텍스트 중심, 아이콘 변경 없음).
  - 처음 읽을 곳: `_design-handoff/HANDOFF_README.md` (claude.ai/design 출처 안내 + 우선순위).
- **Color:** `currentColor` 위임. 호출부에서 `--text-*` 또는 `--accent` 결정. 아이콘 자체는 색 모름.
- **viewBox:** 핸드오프 정본은 **20×20** (BottomNav 4종). 그 외 기존 아이콘은 24×24 / 16×16 유지.
- **Active variant:** Discover / Bookmark 는 `active?: boolean` prop. 다른 탭 아이콘(Search/User)은 단일 형태.

### 5 디자인 원칙
1. **Uniform thin stroke** — `strokeWidth={1.5}` 기준. thick-thin contrast 금지(잡음).
2. **Round terminals** — `strokeLinecap="round"` 기본. square 는 X 표 같은 의도적 직각 컷에만.
3. **Single-form silhouette** — 한 형태로 즉시 인지(diamond / bookmark / lens). 장식 tick / serif terminal 금지.
4. **Color 위임** — `currentColor`. 컴포넌트는 색 모름. `--accent` 위치는 호출부 판단.
5. **Quiet weight** — 포스터 아트가 주인공. 아이콘은 잉크처럼 옅게 배경에 스며든다.

### 적용 매핑 (BottomNav + Search)
| 아이콘 | 핸드오프 위치 | 패턴 |
|--------|---------------|------|
| Discover (active) | Phase 4 L171 | circle r=7.5 stroke 1.5 + 중앙 small dot r=2 fill (focus 인지) |
| Discover (inactive) | Phase 4 L172 | circle r=7.5 stroke 1.4 + diamond `M13 7L11 11L7 13L9 9L13 7Z` stroke 1.2 (방향 모티프) |
| Bookmark (Saved) | Phase 4 L178 | bookmark `M5 3h10v15l-5-3.5L5 18V3z` stroke 1.5 round, active 시 fill opacity 0.18 |
| Search (헤더 버튼) | Phase 4 L175 | circle r=6 stroke 1.5 + path `M13.5 13.5L17 17` stroke 1.5 round (viewBox 20×20) |
| User (Profile) | Phase 4 L181 | head circle r=3.2 stroke 1.5 + body arc stroke 1.5 round |

**구조 차이 메모:** 핸드오프(Phase 4)는 4탭 (Discover/Search/Saved/Profile). 코드는 3탭 — `Search`
는 별도 탭 대신 각 페이지 헤더 버튼 + SearchSheet 모델로 의도적 분기. 시각 토큰만 핸드오프 그대로.

### 정렬 대상 (별도 PR 후보)
IconHeart(saved 내부 reaction badge) / IconSave / Close / Refresh / Detail / Share / Star / Pass 등 나머지는 기존 패턴 유지.
세부 일제 통합은 별도 작업 — 본 PR 범위는 BottomNav 4 아이콘 + IconSearch 정본화만.

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

### 햅틱 피드백 (`navigator.vibrate(10)`)
| 동작 | 진동 | 비고 |
|------|------|------|
| Pass 스와이프 임계값 도달 | 10ms | 가벼운 탭 |
| Save 스와이프 임계값 도달 | 10ms | 가벼운 탭 |
| 이전 카드 오버레이 30% 도달 | 10ms | 임계값 인지 |
| 시청 리포트 드래그 임계값 | 10ms | 트리거 시점 |
| 에러 | 없음 | Quiet Ink 는 에러에 진동을 쓰지 않음 |

미지원 브라우저는 무시. iOS Safari 는 `navigator.vibrate` 미지원 (사용자 설정 의존) — 핵심 UX 가 햅틱에 의존하지 않도록 시각 피드백 병행 필수.

### touch-action 전략
| 영역 | 값 | 이유 |
|------|---|------|
| 카드 스와이프 영역 | `none` | 수평 스와이프와 브라우저 뒤로가기 제스처 충돌 방지 |
| 바텀시트 본체 | `none` | 드래그↔스크롤 전환을 JS 가 직접 관리 |
| 바텀시트 내부 콘텐츠 | `pan-y` | 세로 스크롤은 네이티브 허용 |
| Saved 그리드 | `pan-y` | 기본 세로 스크롤 |
| BottomNav | `manipulation` | 기본 탭 동작만, double-tap zoom 차단 |

### 동시 제스처 충돌 방지
- 스와이프 중 (`swiping === true`) 이면 `onCardTap` 무시.
- 방향 잠금: 첫 10px 이동으로 수평/수직 결정. 이후 변경 불가.
- 시트 열린 상태에서는 z-index 차단으로 카드 터치 이벤트가 도달하지 않음.
- 애니메이션 진행 중 사용자 입력은 `swiping` ref 로 중복 실행 방지.

## Tone & Voice
- **기본 톤:** 해요체 (부드러운 존댓말). "~습니다" 격식체 금지.
- **키워드:** 담백 / 확신 / 위트 (적절한 순간에만)
- **DO:** 짧게 한 문장 / 행동 구체 ("저장하기" > "확인") / 사용자 주어 ("당신의 리스트") / 콘텐츠 이름 직접 언급.
- **DON'T:** 느낌표 연속, 이모지 UI, AI/알고리즘 노출, 과장 어휘, 영문 마케팅 카피.

### 금지 표현 목록
| 금지 | 사유 | 대안 |
|------|------|------|
| "환영합니다!" / "Welcome to neq" | 제네릭 AI slop | 바로 핵심 기능 진입 |
| "AI가 추천합니다" / "알고리즘 기반" | AI 노출 금지 | "취향에 맞는 작품이에요" |
| "최고의 영화" / "놀라운 발견" | 과장 | "마음에 들 영화" / "새로운 발견" |
| "잠금 해제" / "Unlock the power of..." | AI slop | 구체적 행동 서술 |
| "쉽고 빠르게" / "단 N초 만에" | 광고 카피 | 삭제 |
| "지금 바로!" | 강압 | "지금 시작해 보세요" (드물게) |
| 느낌표 2개 이상 (`!!`, `!!!`) | 과잉 | 최대 1개, 가급적 마침표 |
| "오류가 발생하였습니다" | 격식체 | "문제가 생겼어요" |
| "성공적으로 완료" | 격식체 | "저장했어요" / "완료" |
| "님" 호칭 | 커뮤니티 톤 | 호칭 생략 또는 "당신" |
| "Curated for you" 등 영문 마케팅 | 불필요한 영문 | 한글로 번역 |

### 마이크로카피 기본 패턴
| 상황 | 카피 |
|------|------|
| Save 스와이프 | "저장했어요" |
| Pass 스와이프 | (무언) |
| 되돌리기 | "되돌렸어요" |
| 시청 완료 토글 ON | "봤어요" |
| 공유 | "링크를 복사했어요" |
| 로그인 유도 | "로그인하면 리스트가 저장돼요" |

## Content Categories (확장용)
영화/시리즈 외 확장 시 카테고리 구분 색상. 메인 UI에는 미사용, 뱃지/필터 칩에만 적용.

| 카테고리 | Hex | 비고 |
|---------|-----|------|
| 영화 | #C4A35A | 기본 액센트와 동일 |
| 시리즈 | #9B8AE0 | 라벤더 |
| 음악 | #E08A6C | 코랄 |
| 도서 | #7EC4A0 | 세이지 그린 |
| 공연 | #D4A245 | 앰버 |

## References
DESIGN.md 는 원칙·토큰 문서. 컴포넌트별 상세 규격·시각 정본·산출물은 외부 문서로 분리해 두께를 관리.

- **`_design-handoff/`** — Claude Design `neq-design-v2` bundle (2026-04-29). **아이콘/시각 정본**. 진입점: `HANDOFF_README.md`. 정본 prototype: `Phase 4 - Full Prototype.html`. 시각 토큰 충돌 시 이쪽 우선.
- **`_workspace_20260417_172931/design-rebuild/`** — 4-Phase 디자인 팀 산출물 (2026-04-15 ~ 2026-04-17, brand/ui/motion/critic). 컴포넌트 디테일·빈 상태 카피 템플릿·gesture numeric spec 의 원전.
  - `01_brand-identity.md` — 경쟁 분석 5종 + 브랜드 포지셔닝
  - `01_color-system.md` — 컬러 토큰 (블루 → 앰버 결정 전 원안)
  - `01_typography.md` — 타이포 (Instrument Serif 원안, Fraunces 로 결정)
  - `01_tone-guide.md` — 빈 상태/에러/로딩 카피 템플릿 + 금지 표현 원전
  - `02_component-spec.md` — 컴포넌트 10종 풀스펙 (655L)
  - `02_spacing-layout.md` — Discover/Saved/Profile 레이아웃 다이어그램
  - `02_states-spec.md` — 스켈레톤·빈·에러·전환 애니메이션 원전
  - `03_gesture-spec.md` — 카드/시트 제스처 numeric spec
  - `03_motion-language.md` — easing/duration 토큰 원전
  - `04_anti-slop-audit.md` — 12 항목 PASS/FAIL 감사
  - `04_benchmark.md` — Letterboxd/Spotify/Watcha/Mubi 와 색상축 좌표 매핑
  - `04_design-critique.md` — P0/P1 비평 → DESIGN.md 가 채택한 결정의 근거
- **코드 토큰 정본:** `apps/web/src/app/globals.css` — `:root` CSS 변수 선언. DESIGN.md ↔ globals.css 값 불일치 시 globals.css 가 빌드 정본, DESIGN.md 가 인텐트 정본.
- **컴포넌트 진입점:** `CODEMAP.md` — 거대 파일 책임 분할 후 어디부터 읽을지 1줄 안내.

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
| 2026-05-06 | 로딩 인터랙션 = display 타이포 morph (C안 옵션 A) | 기존 3-dot 회전은 클래식 라인/기하학. Quiet Ink 정체성 보존하면서 활력 가미 = pop art 향. NeqSpinner 1곳 수정 → StatusScreens / FirstLoadingSkeleton / SearchSheet / Button(loading state) 자동 반영. (참고: 5/2 시점 Fraunces 기준 결정, 5/8 fontsV2 로 Instrument Serif 전환 후에도 morph 패턴 유지) |
| 2026-05-06 | Iconography = uniform stroke 1.5 round (`_design-handoff/Phase 4 - Full Prototype.html`) | Claude Design `neq-design-v2` bundle 의 Phase 4 정본 적용. 5 원칙(uniform thin / round / single-form / color 위임 / quiet weight). Discover/Bookmark active variant + Search/User. **Saved 탭 = Heart → Bookmark 변경** (정본 모티프). 두 차례 잘못된 출처 적용 후 정정: (1) `_brand/icon-prototype.html` serif terminal → 삭제, (2) `neq-design.zip`(v1, Phase 1-3) → 삭제하고 `neq-design-v2`(Phase 1-4 + Round 1-3 + Handoff Package) 풀어 `_design-handoff/` 통합. |
| 2026-05-06 | v2 핸드오프 시각 정렬 (B안 — 기능 보존) | Phase 2 audit 의 fix 6건 중 4건 적용 (A1/B1/B3+B4/B7). A1: ActionBar Save 버튼 1.5px border (idle `--border` / active `--accent`) — 정본 잉크 윤곽 회복. B1: Saved 헤더 20→28px weight 500 letter-spacing -0.025em (정본 40px 의 모바일 viewport 충돌 방지 절충안). B3+B4: viewFilter/ottFilter 1px border 추가 + ottFilter radius 12→8px(rounded-md) + weight 정본 통일(active 600/inactive 500) — 두 칩 위계(pill 강조 vs rounded-md 분류) 회복. B7: "OTT별 보기" 토글 amber → text-secondary — 보조 액션 amber 금지 정책(L40) 준수 + amber 카운트 안전 마진. **의도적 분기 5건 보존**: ActionBar 5-button(발견성) / Grid·List·Preview 뷰모드 토글 / 헤더 검색 버튼 / OTT 별행 분리 / 빈 상태 카피 5종 확장. **제외 2건**: A4(Discover bottom cue 텍스트), B2(Saved 서브카피) — 사용자 결정으로 보류. **amber 카운트 WARN**: Saved 화면 fix 후 6건 (B7 -1, Grid 토글 active +1, 카드 reaction +1 신규 카운트 발견) — 정체성 위반 수준 아니라 진입 허용, 후속 사이클에서 위계 재배분(예: Grid 토글 또는 reaction badge amber 박탈) 예고. |
| 2026-04-29 | fontsV2 전환: display Fraunces → Instrument Serif, data Outfit → Geist Mono (`f0982d0`, Stage 4 D1) | next/font/google 로 inject (`layout.tsx`). Instrument Serif 는 절제된 세리프 + 우아한 italic (italic 액센트 활용도 ↑), Geist Mono 는 tabular-nums + 잡지 eyebrow 톤. CSS var 명 (`--font-display`, `--font-data`) 보존 — 호출처 0 변경. DESIGN.md L42/L45 표기는 5/12 W3 통합에서 정정. **본 결정은 5/2 "Fraunces 유지"를 27일 후 reverse — Decisions Log 미기록 상태 유지되다 W3 에서 발견 후 추가 기록.** |
| 2026-05-12 | Brand Identity 섹션 신규 + 워드마크 = 이미지 정본 정책 | design-critique P2 "로고/워드마크 미정의" 해소. 사용자 결정: 워드마크는 `neq-logo.png` 이미지 그대로 사용 (텍스트 + font-display + text-accent 모방 금지). 워드마크 자체 폰트 디자인이 적합 = Quiet Ink 정합보다 정체성 보존 우선. manifest theme/background_color #0C0A09 → #12110E (Warm Cinema 잔재 정정). InstallBanner boxShadow rgba(12,10,9) → (18,17,14) 정정. discover/loading.tsx 텍스트 워드마크 → 이미지 교체. StatusScreens·StepHeader stale 주석 정정. **잔여:** 워드마크 amber 리컬러링·로고 마크(심볼)·1024×1024 앱 아이콘은 Phase 5 design-orchestrator 사이클로 분리. |
| 2026-05-12 | W3 디자인 통합: design-rebuild 산출물 → DESIGN.md 흡수 | 4-Phase 산출물 12종 중 운영 디테일 흡수 (Typography line-height/letter-spacing, Spacing 토큰명, States 공통 규격, Motion reduced-motion 표/회전 3deg/scale 위계, Haptics, touch-action, Tone 금지표현 표, ARIA 라벨, References 섹션). 247L → ~390L. 컴포넌트별 풀스펙(655L)·빈 상태 카피 템플릿은 흡수하지 않고 References 로 위임 — DESIGN.md 는 원칙·토큰 정본, 산출물은 컴포넌트 디테일 정본. 충돌: Instrument Serif·블루 액센트 원안은 4-15 결정으로 Fraunces·앰버로 폐기됨 (정합 OK). 미흡수 잔여: 로고/워드마크 미정의 (P2 critique), 앱 아이콘 미정의 (P2 critique) — Phase 5 별도 작업. |
| 2026-05-13 | Saved amber 위계 재배분 (M1, 5/6 L460 예고 이행) | 5/6 v2 핸드오프 후 Saved 화면 amber 정적 4건 + 조건부 1~3건 = 최악 6~7건으로 L33 "한 화면 amber ≤ 4" 정책 위반. **A+C 동시 박탈**: (A) viewMode 토글 Grid/List/Preview active 의 `--accent-dim` bg + `--accent` color → `--surface-raised` bg + `--text-primary` color. container `--surface` 위 한 단계 elevated 톤으로 active 식별 보존. focus-visible ring 의 `--accent` 는 transient overlay 정책(L456)으로 유지. (C) loved 인생작 reaction 의 텍스트 amber 박탈 — `color: var(--accent)` → `var(--text-primary)`, **bg `--accent-dim` + border `--accent-border-light` 는 유지** (면 amber 보존으로 "특별 상태" 메시지 살림). loved 카드 N개 노출 시 텍스트 amber 폭증 차단. REACTIONS 배열·grid picker·list picker·hero picker 4곳 일괄. **사용처 영향**: REACTIONS 정의는 Saved 화면 내부(SavedList/SavedHero/Saved page DetailSheet slot)에만 import — Profile/Discover 등 외부 페이지 영향 0. **amber 카운트**: Saved 정적 4 → 3 (viewMode -1, loved color 박탈로 조건부 amber 폭증 차단). |
| 2026-05-13 | Phase 5 워드마크 amber 리컬러링 (5/12 L462 잔여 이행) | 5/12 Brand Identity 섹션의 색상 drift 메모 해소. `apps/web/public/neq-logo.png` 워드마크 자산을 Warm Cinema 오렌지(#E87B35) → Quiet Ink amber(#C4A35A) 정합. 변환 방식: 알파 채널 마스크 + 단색 fill (sharp 라이브러리, `_workspace/recolor-wordmark.js`). tint 명도 grading 방식과 비교 후 단색 fill 채택 — DESIGN.md 토큰값 정확 매칭 우선. 폰트(Instrument Serif italic 계열) + 형태 + 알파 마스크는 유지. **사용처 8곳 자동 반영** (이미지 정본 단일 출처): discover/loading, share/[id]/ShareClient, StatusScreens 3곳, DiscoverHeader, StepHeader, OnboardingStepWelcome. 백업: `_workspace/neq-logo.warm-cinema.png` (gitignored). **잔여 Phase 5:** 로고 마크(심볼) + 1024² 앱 아이콘은 외부 디자인 팀 인계. |
| 2026-05-13 | 온보딩 6단계 UX 일괄 정합 (ux-reviewer audit 후속) | 보조 옵션 4종 시각 통일 = **Option A 풀폭 패턴** (`w-full py-3 text-sm text-secondary` 무장식 + `active:scale-[0.99]`): Hello "이름 없이 시작" / Genre "장르 정하지 않고 시작" / Taste "작품 정하지 않고 시작" / OTT "나중에 설정". Genre·Taste 의 inline underline + `text-decoration` 제거. 컨테이너 `flex-col items-center gap-3` → `flex flex-col gap-2` (Hello/OTT 패턴 정합). **Notify 신규 보조 옵션 "알림 받지 않기"** 추가 — 모든 토글 OFF + `Notification.requestPermission()` 호출 skip + `onNext({ skipped: true })` 분기. analytics `onboarding_step_completed` props = `{ notifications_skipped: true }` (Genre/Taste 의 `{ random: true }` 패턴 정합). **Tone 위반 정정 3건**: OTT "지금 바로 볼 수 있는" → "지금 보실 수 있는" + `<br />` 제거(자연 wrap), Welcome "알고리즘 대신, 큐레이션" → "리스트 대신, 한 편씩" (L393 "알고리즘" 노출 회피), Notify "곧 시작됩니다/적용됩니다" → "곧 시작해요/적용돼요" (L384 격식체 금지). **anti-slop #8 정정 2건**: Genre chip 의 `<span fontSize 10>✓</span>` + OTT row 의 raw `✓` 문자 → 모두 `<IconCheck size={12} />` 컴포넌트 (10px 폰트 → 12px SVG). **토큰 정합 2건**: StepHeader 워드마크 `h-6`(24px) → `h-5`(20px) (L51 기본), Controller `max-w-lg`(512px) → `max-w-[480px]` (L177). **예외 1건**: Hello 미리보기 "○○○ 님, 이번 주 한 편 어떠세요?" L125 의 "님" 호칭은 사용자 결정으로 유지 — DESIGN.md L401 정책 예외 인정. |
| 2026-05-27 | 온보딩 Hybrid v2 — persona 인라인 + 통합 10단계 progress | 기존 별도 작품 선택(taste) 단계 제거 + `PersonaSurveyController` 를 onboarding step 4 로 인라인 마운트. **STEP_LABELS 6단계 유지** (`welcome / hello / genre / persona / ott / notify`) 인데 사용자 progress 표시는 **통합 10단계** — persona 의 sub-step 5종 (context_select / step1 / step2-or-3 / favorites_pick / summary) = 4·5·6·7·8 위치. `OnboardingV2Controller.tsx` / 네이티브 `app/onboarding/index.tsx` 의 `headerCurrent` 산식: `step<3 ? step : step===3 ? 3+(subStep-1) : step+4`. **StepHeader** 가 모든 단계에서 동일 사용 — persona 내부 `SurveyHeader` 는 embedded 모드에서 hide. **trap 차단 영구 규칙 (P0 review fix)**: persona subStep≥2 일 때 우상단 X 건너뛰기 노출 — `PersonaSurveyController` 가 LLM 행/rate-limit 으로 사용자를 가두는 회귀 방지. confirm 후 `goNext({persona_created:false, skipped_from_header:true})`. error_modal 도 embedded 일 때 primary "다시 시도"·secondary "건너뛰기" 분기 (profile 진입은 기존 "닫기" 단일 버튼 유지). **헤더 동기화 회귀 가드 (P1 review fix)**: step 변화 시 `personaSubStep=1` 리셋 + `error_modal/resume_modal/done` phase 동안 `onSubStepChange` skip — progress 역행/stale 차단. **Native layout shift 3건 fix** (a3152bc): splash bg `#0a0a0a→#12110E` (colors.bg 정합), `SafeAreaProvider initialMetrics={initialWindowMetrics}`, fontsLoaded false 시 빈 View fallback. **잔여 검증**: Android splash bg 가 expo-splash-screen plugin 미등록 상태에서 실제 반영되는지 EAS Build 확인 필요 (TODOS.md #9 참조). |

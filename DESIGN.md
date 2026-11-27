# Design System — neq

> 2026-11-26 전면 리디자인. 이전 시스템 "Quiet Ink"(웜 다크 + 황금색 + 세리프 헤드라인)는 실사용자에게 "Claude 디자인과 비슷하다"는 평을 받아 폐기했다. 근거와 이전 결정은 맨 아래 Decisions Log에 남겼다. **코드 토큰은 아직 Quiet Ink 값이다** — 이 문서가 인텐트 정본이고, 구현은 별도 트랙에서 바꾼다.

## Product Context
- **What this is:** OTT 콘텐츠 발굴 앱. 포스터 카드를 넘기며 "오늘 뭐 볼까"를 고른다.
- **Who it's for:** 2030 직장인. 퇴근 후 소파에서 한 손으로 쓴다.
- **Space/industry:** OTT 디스커버리 (Netflix·Watcha·TVING·wavve·Letterboxd·MUBI와 같은 자리)
- **Project type:** iOS 네이티브 앱(Expo, `apps/native`) 우선 + 모바일 PWA(`apps/web`, 390×844 기준)

## Aesthetic Direction
- **Direction:** **Night Pool (밤 수영장)** — 깊은 청록 밤 위로 형광 라임이 튀고, 버튼은 젤리처럼 눌린다.
- **기억할 한 가지:** "만지고 싶은 촉감" + "친구가 골라주는 가벼움". 모든 결정은 이 두 가지를 강화하는지로 판단한다.
- **Decoration level:** Intentional — 장식 대신 재질(유리)과 반응(젤리 프레스, 스티커)이 개성을 만든다.
- **Mood:** 밤 수영장의 시원한 물빛, 포스터 위에 친구가 붙여 준 형광 메모. 진지한 큐레이터가 아니라 같이 보는 친구.
- **포스터가 가장 화려한 면이다.** UI 색은 청록 계열 중성과 라임·아쿠아 두 강조색으로 제한하고, 포스터를 필터로 덮지 않는다.

### 피해야 할 인상 (리디자인 이유)
- **Claude와 겹치는 조합 금지:** 크림·웜 슬레이트 바탕(#FAF9F5, #F0EEE6, #141413 계열), 테라코타·코랄·앰버 단일 강조(#D97757, #C96442, #CC785C, #C4A35A 계열), 문학적 세리프 헤드라인(Tiempos·Copernicus·Instrument Serif 류), 베이지·토프 중성색, "사려 깊은 지식인" 분위기.
- **경쟁 OTT와 겹치는 조합 금지:** 검정 + 빨강(Netflix·TVING), 검정 + 분홍(Watcha), 파랑 주조(wavve·MUBI), 슬레이트 + 초록(Letterboxd).

### Anti-slop 금지 목록
1. 보라/바이올렛 그라디언트 배경
2. 모든 요소에 같은 큰 radius (아래 Shape 위계를 따른다)
3. 3열/4열 균일 아이콘 그리드
4. 센터 정렬 일변도
5. 그라디언트 버튼
6. `border-left: Npx solid accent` 인용 블록
7. 에모지를 디자인 요소로 사용 (텍스트/아이콘으로 대체)
8. 11px 미만 글자. 예외: 영문·숫자 전용 Recursive Mono 라벨은 10px 허용. **한글에는 넓은 자간(0.05em 초과)과 uppercase 계열 처리 금지.**
9. 장식용 blob, 물결 SVG 디바이더
10. "Welcome to X", "Unlock the power of..." 류 제네릭 카피
11. 라임 남용 — 한 화면에 라임 채움 요소는 동시에 3개 이하 (선택된 칩 그룹은 1개로 센다. 토스트 점·드래그 중 스티커처럼 잠깐 뜨는 것은 제외)
12. 유리 위 유리 겹치기, 포스터 **면** 위에 유리·블러 적용 (2026-06 카드 깜빡임 이력). 카드 **가장자리**의 유리 테두리(아래 Material)는 예외 — 2026-11-27 제임스 요청
13. 웜 브라운·베이지 중성색 (Claude 회귀)

## Brand Identity

### 워드마크 (Wordmark)
- **형태 유지:** `apps/web/public/neq-logo.png` 의 세리프 이탤릭 "neq," 형태는 바꾸지 않는다(사용자 결정 2026-11-26). 화면 안 세리프는 **워드마크에만** 남는다 — 굵은 산세리프 UI 사이의 서명 한 줄.
- **색:** 다크 `#58DCCB`(아쿠아), 라이트 `#007B72`. 자산이 단색 알파 PNG라 재색칠이 쉽다 — 네이티브는 `Image tintColor`, 웹은 CSS `mask-image` + 배경색. 색별 PNG를 새로 굽지 않는다.
- **사이즈·여백·금지:** 기본 높이 20px, 최소 16px, 온보딩 hero 24~40px. 주위에 자체 높이의 50% 여백. 텍스트 모방, 그라디언트·글로우·그림자, 회전·왜곡, 글자 분리 재배치 금지.
- **Alt:** `"neq,"` (쉼표 포함). 렌더되지 않는 메타 텍스트(title, OG, manifest)도 `"neq,"`.
- **미정:** 로고 마크·1024² 앱 아이콘은 외부 팀 의뢰 트랙. 앱 아이콘은 새 팔레트(청록 + 라임) 기준으로 의뢰한다.

## Typography
모두 OFL(앱 임베드 가능). 한글 우선.

| 역할 | 폰트 | 비고 |
|---|---|---|
| 한글 UI·본문·한글 제목 | **SUIT Variable** | 본문 400, 라벨·버튼 600, 한글 제목 800~900. [sun-typeface/SUIT](https://github.com/sun-typeface/SUIT) |
| 영문 제목·영문 강조 | **Unbounded** (500/700/900) | 넓고 둥근 디스플레이. 영문 원제, 큰 영문 숫자 강조에만. **한글에는 쓰지 않는다**(한글 글리프 없음 → SUIT로 폴백되면 안 됨) |
| 데이터·숫자 | **Recursive** (MONO 1, CASL 0) | 평점, 연도, 러닝타임, 회차, 통계 숫자. tabular |
| 워드마크 | 이미지 자산 | 텍스트로 재현하지 않는다 |

- **폐기:** Pretendard, Instrument Serif, Geist Mono, Fraunces (Quiet Ink).
- **Scale (size / line-height / letter-spacing):**

| 토큰 | size | lh | ls | 용도 |
|---|---|---|---|---|
| xs | 11 | 1.45 | 0 | 뱃지, 캡션 |
| sm | 13 | 1.5 | 0 | 메타, 보조 |
| base | 15 | 1.55 | 0 | 본문 |
| lg | 18 | 1.4 | -0.01em | 섹션 제목 |
| xl | 22 | 1.3 | -0.03em | 시트 제목 |
| 2xl | 28 | 1.2 | -0.035em | 페이지 제목, 통계 숫자 |
| 3xl | 34 | 1.15 | -0.035em | 카드 한글 제목 |

- 한글 제목은 SUIT 900 + 음수 자간이 시그니처. 영문 원제는 Unbounded 700 + 0.02em, 대문자 허용.
- 본문 최소 15(시트·설명), 카드 위 이유 문구 13 이상.

## Color
- **Approach:** Balanced — 청록 계열 중성 + 강조 2색(라임 = 행동, 아쿠아 = 길 안내). 시스템 설정을 따라 **다크·라이트 둘 다** 지원한다.

### 다크 (기본 아님 — 시스템 따름)
| 토큰 | 값 | 비고 |
|---|---|---|
| bg | `#071B20` | 깊은 청록 밤 |
| surface | `#0E252A` | 시트 본문, 카드 바탕 |
| raised | `#17343A` | 칩·입력·떠 있는 면 |
| sunken | `#04141A` | 인셋 |
| border | `#23444A` | 기본 선 |
| text | `#F3FAF8` | bg 대비 16.7:1 |
| text-secondary | `#A9C2C0` | 9.4:1 |
| text-muted | `#6F8E8C` | 5.0:1 (surface 4.49 — 작은 글자는 text-meta) |
| text-meta | `#82A09E` | 작은 보조 글자(메타·캡션) bg 6.3 · surface 5.7 · raised 4.7 |
| lime | `#D8F547` | 채움, 위 글자는 `#071B20` (14.4:1) |
| aqua | `#58DCCB` | 글자·아이콘 (bg 10.5:1) |
| danger | `#FF7A6B` | 글자 7.0:1, 채움 위 글자 `#071B20` |
| warning | `#FFC857` | |
| success | 라임 사용 | |

### 라이트
| 토큰 | 값 | 비고 |
|---|---|---|
| bg | `#EAF6F5` | 연한 민트 (흰색·크림 아님) |
| surface | `#FFFFFF` | |
| raised | `#D8EBE9` | |
| sunken | `#DCEDEB` | |
| border | `#B9D4D2` | |
| text | `#0F2A2F` | 13.6:1 |
| text-secondary | `#43626A` | 5.9:1 |
| text-muted | `#6A858A` | 3.6:1 — **큰 글자·힌트·아이콘 전용** |
| text-meta | `#4F6D73` | 작은 보조 글자(메타·캡션) — bg 5.0 · raised 4.5 |
| lime | `#D8F547` | **채움 전용**(밝은 배경 위 글자로 쓰면 1.1:1). 위 글자 `#0F2A2F` |
| lime-text | `#4E6E00` | 라임 의미를 글자로 써야 할 때 (5.3:1) |
| aqua-text | `#00716A` | 링크·현재 탭·선택 글자 (bg 5.3, 옅은 아쿠아 면 위 4.5+) |
| wordmark | `#007B72` | 워드마크 tint 전용 (사용자 결정값 유지) |
| danger | `#C0392B` | 글자 4.9:1, 흰 글자 채움 5.4:1 |
| warning | `#8A6100` | 글자 5.0:1 |

### 색 역할
- **라임:** 저장(버튼 활성, 저장 스와이프 스티커 "찜!"), 선택된 필터 칩, 주요 CTA("Netflix에서 보기"), 인생작 표시, 친구 메모 스티커. 라임은 **채움**으로 쓰고 위 글자는 bg 색.
- **아쿠아:** 워드마크, 현재 탭, 링크, 평가 선택(인생작/괜찮았어/별로/안 맞아의 선택 상태), 포커스 링.
- **포스터:** 카드에 색 필터를 씌우지 않는다. 카드 하단 그라디언트는 `rgba(4,20,24,…)` 청록 잉크로 끝난다(검정 아님).

## Material — Liquid Glass
- **어디에:** 탭바(4슬롯: 발견·큐·저장·프로필 — 검색은 각 화면 헤더 우상단 버튼, 2026-11-27), 필터 칩, 액션바 버튼, 헤더 버튼, 토스트, 시트 상단·반만 열린 시트. 탭바는 `GlassView` 기반 자체 탭바(떠 있는 알약, 좌우 16) — 0단계 당시 시스템 native tabs 는 검색 슬롯(시트 열기 액션)을 막을 수 없어 제외했다.
- **카드 유리 테두리 (2026-11-27):** 스와이프 카드는 포스터 면을 덮지 않고 가장자리만 유리처럼 — 밝은 림 1.5 `rgba(200,255,245,0.32)` + 안쪽 잉크 헤어라인 1 `rgba(4,20,24,0.35)`(두께감) + 위 72px 반사광 `rgba(214,255,248,0.16→0)`. 테마 무관. 움직이는 카드 위 실제 `GlassView` 는 쓰지 않는다(매 프레임 뒤를 다시 샘플링 + 깜빡임 이력).
- **어디에 안:** 포스터 면, Saved 그리드, 시트 본문(끝까지 올렸을 때), 긴 텍스트 면.
- **시트 규칙:** 화면 일부만 덮을 때는 유리(뒤 포스터 색이 비침), 끝까지 올리면 `surface` 불투명 면으로 굳는다.
- **틴트:** 다크 `rgba(7,27,32,0.15)` + 테두리 `rgba(160,240,230,0.24)`, 라이트 `rgba(234,246,245,0.80)`(민트 bg 기반) + 테두리 `rgba(15,42,47,0.10)`. 2026-11-27 실기기 피드백("유리가 맞나 싶을 만큼 평평")으로 낮춤 — 다크 0.40·라이트 0.92 는 굴절이 안 보여 불투명 면과 구분이 안 됐다. 라이트 0.60 이하는 어두운 포스터 위에서 회색으로 탁해진다. 밝은 포스터 위 clear 유리 버튼에는 청록 잉크 받침 `rgba(7,27,32,0.28~0.45)`.
- **유리 위 글자:** `text` 색, 13px 이상, 600 이상. `text-secondary`·`text-muted`는 불투명 면에서만.
- **iOS 26 미만·PWA:** 같은 모양의 불투명 `raised` 면 + 1px `border`. 가짜 블러로 흉내 내지 않는다. 손맛(프레스·햅틱)은 동일.
- **구현 메모:** `expo-glass-effect`(iOS 26 + Xcode 26 빌드). 부모에 `opacity: 0`을 걸면 유리가 렌더되지 않는다. 가용성은 OS 버전이 아니라 API로 판단.

## Spacing
- **Base unit:** 4px. 모든 간격은 4의 배수.
- **Density:** Comfortable. 최소 터치 타겟 44×44.
- **Scale:** 2xs 2 · xs 4 · sm 8 · md 16 · lg 24 · xl 32 · 2xl 48 · 3xl 64
- **좌우 여백:** 콘텐츠 20, 그리드/칩 줄 12~16.

## Layout & Shape
- **Discover:** 카드가 화면을 거의 채우고(좌우 6), 칩·헤더 버튼·액션바·탭바가 **카드 위에 유리로 뜬다**. 다음 카드는 뒤에서 살짝 보인다.
- **Saved:** 3열 비대칭 그리드 유지(가운데 열 14px 내림, 포스터 2:3). 균일 4열 이상 금지.
- **Max content width (PWA):** 480px.
- **Radius 위계:** 뱃지 8 · 썸네일 14 · 칩·토스트 14(높이 28이면 알약형) · 저장 버튼 16 · 카드 24 · 시트 상단 32 · 원형 버튼 full. 같은 큰 값을 일괄 적용하지 않는다.

## Motion & Touch
- **Approach:** Expressive-tactile. 손에 닿는 순간은 크게, 화면 전환은 짧게. 동시 움직임 최대 3개.
- **젤리 프레스 (시그니처):** 누르면 90ms에 `scale(1.03, 0.92)`로 찌그러지고, 놓으면 스프링 `cubic-bezier(0.3, 1.6, 0.5, 1)` 280ms로 튕겨 복귀. 큰 버튼일수록 찌그러짐을 줄인다(저장 버튼 `scale(1.02, 0.94)`).
- **드래그 피드백:** 카드 수평 드래그 회전 최대 ±8°. 아래로 끌면 라임 "찜!" 스티커, 위로 끌면 청록 반투명 "관심 없음" 스티커가 `rotate(-6deg)` 상태로 0.6→1.1 스케일로 붙는다. 저장 버튼은 끄는 거리에 비례해 최대 1.14배.
- **관심 없음 퇴장:** 카드가 작아지며(0.6) 흑백·어둡게 가라앉는다, 220ms ease-in. 이 연출은 이 동작에서만 쓴다. (RN에서 흑백 필터가 안 되면 어둡게만.)
- **Easing:** enter `cubic-bezier(0.25,1,0.5,1)` · exit `cubic-bezier(0.5,0,0.75,0)` · move `cubic-bezier(0.45,0,0.55,1)` · jelly `cubic-bezier(0.3,1.6,0.5,1)` · sheet `cubic-bezier(0.32,0.72,0.24,1)`
- **Duration:** instant 90 · quick 150 · moderate 250 · steady 320 · sheet 450/350(열림/닫힘)
- **햅틱:** 누름 soft, 스와이프 임계 통과 rigid, 저장 확정 success 1회. 연속 발화 금지. 에러에는 진동 없음.
- **reduced-motion:** 드래그 1:1 추적은 유지, 스프링·스티커 스케일·젤리는 즉시 상태 변경으로 대체.

## Iconography
- 선 1.5 균일, 둥근 끝, 단일 실루엣, `currentColor` 위임 — `_design-handoff/` 아이콘 형태는 그대로 쓴다(색·폰트 토큰은 이 문서가 대체).
- 선택 상태: 현재 탭 아이콘은 아쿠아 + 옅은 아쿠아 캡슐 배경.

## Interaction Model

### Discover 카드 제스처
| 제스처 | 동작 |
|---|---|
| 좌 스와이프 | 다음 카드 (탐색, 평가 아님) |
| 우 스와이프 | 이전 카드 오버레이 (놓을 때만 전환) |
| **아래 스와이프** | 저장 (라임 "찜!") |
| **위 스와이프** | **관심 없음 = 이 작품 숨기기** (2026-11-26 재도입). 평가가 아니라 치우는 동작이다. 토스트 "다시 안 보여요 · 되돌리기" |
| 탭 | 상세 시트 |

- 좌우 축에는 좋음/싫음 의미를 붙이지 않는다. "관심 없음"은 위 축 하나에만.
- **평가는 제스처가 아니라 명시 픽커**(상세 시트의 인생작/괜찮았어/별로/안 맞아)에서만.
- 세로 축(위·아래)과 탭 판정이 겹치지 않게 임계를 분리한다(아래 터치 임계 참조, `feedback_pan_gesture_offset_conflict`).

### 터치 임계
- 탭: 이동 8px 미만 + 300ms 미만
- 수평 스와이프: 80px
- 세로 스와이프(저장·관심 없음): 100px
- 방향 잠금: 첫 10px 이동 방향
- 시트 닫기: 아래로 30%

## States
- **Skeleton:** `surface` 바탕 + `raised` 펄스 2s. 카드 모양 그대로.
- **Empty:** 아이콘 48(`text-muted`) → 제목 15/600 → 설명 13 → CTA(유리 또는 라임). 최대 폭 260.
- **Error:** Empty와 같은 구조, 아이콘만 danger. 포스터 로딩 실패는 `surface` + 워드마크 실루엣(아쿠아 20%)으로 조용히.
- **Toast:** 상단 44, 유리, radius 14, 라임 점 7px. 등장 250ms enter, 체류 2.5s(되돌리기 있으면 3s), 동시 1개.
- **Friend memo (친구 메모 스티커):** 카드 우상단, 라임 채움, SUIT 800 12px, `rotate(-6deg)`, radius 12. **12자 안팎의 한마디**("비 오는 밤에 딱"). 긴 추천 이유는 상세 시트로 내린다. 문구는 추천 생성 단계에서 별도 필드로 만든다(구현 트랙).

## Accessibility
- 터치 타겟 44×44 이상. 포커스는 아쿠아 2px 링.
- 대비: 본문 AA 이상(위 표 수치). 라이트 `text-muted`는 큰 글자·힌트 전용. 라이트에서 라임을 글자로 쓰지 않는다.
- 색만으로 상태를 전달하지 않는다 — 저장/관심 없음은 방향 + 스티커 글자 + 햅틱을 함께 준다.
- `user-scalable=no`, `autoFocus` 금지(PWA). 유리 위 글자는 대비가 흔들리므로 받침·굵기 규칙을 지킨다.
- ARIA/접근성 라벨은 기존 매핑 유지(ActionBar "처음으로/공유/상세보기/새 추천/저장", 탭 라벨 등) + 위 스와이프 대체 수단: 상세 시트에 "관심 없음" 버튼.

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

## References
- **이번 리디자인 산출물:** `~/.gstack/projects/bininthehood-neq/designs/redesign-20261126/` — 3안 비교(`neq-redesign-3way-b8.html`), B안 확장 시안(`neq-night-pool-c1.html`), 브리프·외부 의견.
- **리퀴드 글래스 시안:** `~/.gstack/projects/bininthehood-neq/designs/liquid-glass-20261126/preview.html` (Quiet Ink 색 기준으로 만든 재질·제스처 시안. 재질 규칙만 유효)
- **`_design-handoff/`:** 아이콘 형태의 정본. 색·폰트·분위기 토큰은 이 문서가 대체한다.
- **코드 토큰 위치(아직 Quiet Ink 값):** `packages/design/src/tokens.ts`, `packages/design/src/tokens.css`, `apps/web/src/app/globals.css`, `apps/native/lib/tokens.ts`(re-export).
- Apple: [Materials](https://developer.apple.com/design/human-interface-guidelines/materials), [Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass). Expo: [GlassEffect (SDK 54)](https://docs.expo.dev/versions/v54.0.0/sdk/glass-effect), [Native tabs](https://docs.expo.dev/router/advanced/native-tabs/).

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
| 2026-11-26 | **전면 리디자인: Quiet Ink → Night Pool** | 실사용자 피드백 "폰트·색·분위기가 Claude 디자인과 비슷하다". 웜 다크 + 앰버 단일 강조 + 세리프 헤드라인이 Claude 시각 축과 겹쳤다. /design-consultation 처음부터 재실행: 경쟁 OTT·Claude 시각 조사 + Codex·별도 에이전트 외부 의견 → 3안(라임 소다/밤 수영장/포스터 물들임) 시안 비교 → 사용자 B안 선택. 세 의견 공통: 형광 라임 강조, 세리프는 워드마크에만, 젤리 프레스. |
| 2026-11-26 | 다크·라이트 둘 다 지원 | 사용자 결정. 시스템 설정 따름. |
| 2026-11-26 | 워드마크 형태 유지, 색만 아쿠아(#58DCCB / #007B72) | 사용자 결정. 단색 알파 PNG라 tint/mask로 재색칠. |
| 2026-11-26 | 폰트 교체: SUIT(한글 UI·제목) + Unbounded(영문 제목) + Recursive(숫자) | Pretendard·Instrument Serif·Geist Mono 폐기. 모두 OFL. |
| 2026-11-26 | Liquid Glass 재질 규칙 | 조작부·칩·토스트·탭바·반만 열린 시트만 유리, 카드·본문은 불투명, iOS 26 미만은 불투명 대체. Apple 가이드(콘텐츠 층 금지) + 2026-06 카드 블러 깜빡임 이력. |
| 2026-11-26 | 위 스와이프 = "관심 없음" 재도입 (2026-05-02 R1 제거 결정 번복) | 사용자 요청. 평가가 아닌 숨기기 액션으로 정의, 평가는 명시 픽커에만 둔다는 원칙은 유지. |
| 2026-11-26 | 친구 메모 스티커 도입 | "친구가 골라주는 가벼움". 카드에는 12자 안팎 한마디, 긴 이유는 상세 시트로. 추천 생성에 짧은 문구 필드 추가 필요. |
| 2026-11-26 | Content Categories(확장용 카테고리 색) 표 폐기 | 앰버·코랄·라벤더가 새 팔레트와 충돌. 카테고리 확장 시 Night Pool 기준으로 다시 정한다. |
| 2026-11-27 | 라이트 유리 틴트 `rgba(234,246,245,0.92)`, 다크 text-meta `#82A09E` | 흰색 0.55 틴트는 어두운 포스터 위에서 회색으로 탁해짐(시뮬 확인). text-meta 는 다크 raised 위 3.9 → 4.7 (작은 글자 4.5 기준). |
| 2026-11-27 | 유리 틴트 낮춤(다크 0.40→0.15·테두리 0.18→0.24, 라이트 0.92→0.80) + 카드 유리 테두리 도입(anti-slop #12 를 "포스터 면" 금지로 좁힘) + 탭바 4번째 = 프로필·검색은 헤더 | TestFlight 1.1.0(49) 제임스 피드백: 유리가 평평함·카드가 평면·검색↔프로필 위치 교체 요청. 빌드 49 는 Xcode 26.0 이미지라 유리 자체는 켜져 있었고, 틴트가 굴절을 덮은 것이 원인. 카드 테두리는 정적 뷰라 스와이프 프레임 변화 없음(시뮬 측정, 계획 문서). |
| 2026-11-27 | 라이트 모드 대비 보정: `text-meta` 신설, 라이트 `aqua-text` #007B72 → #00716A, 워드마크는 별도 `wordmark` 토큰으로 #007B72 고정 | 3단계 대비 측정. 라이트 text-muted(3.6)를 쓰던 작은 글자 63곳과, 옅은 아쿠아 면 위 aqua-text(4.1)가 본문 기준 4.5 미달. 워드마크 색은 사용자 결정이라 UI 글자색과 분리했다. |

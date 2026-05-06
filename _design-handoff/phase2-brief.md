# Neko — Phase 2 Brief

## Concept (1-line)
"OTT 콘텐츠를 카드 스택으로 발견·저장하는 모바일 추천 PWA. 사용자 취향을 LLM과 TMDB 메타데이터로 큐레이션하고, 좌/우 스와이프로 브라우징, 좋아요는 명시적 액션."

## Visual style
- **Editorial spot illustrations** (Style B from Phase 1) — 손맛 있는 잉크 스팟, 비대칭/해칭, 신문 칼럼 삽화 무드
- 폰트: Fraunces (헤더), Outfit (본문) ← 사용자 지정. (기존 시스템은 Instrument Serif + Pretendard. 새 폰트로 바꿔야 함)
- "수제 느낌" 유지 — anti-slop 원칙

## Categories (3개만)
- 영화 (movie)
- 시리즈 (series, TV)
- 예능 (variety) — Reality/Talk
- ❌ 음악·책 없음. 디자인 시스템에서 이 색상은 영화/시리즈/예능 3개로 다시 매핑

## Card data — Discover
- 포스터 이미지 (세로 2:3)
- 제목 (한글)
- 평점 (TMDB vote_average, 0~10)
- 출시 년도
- OTT 로고 (1~3개)
- 추천 이유 (LLM 생성, 1줄, 해요체)
  - 예: "느릿한 호흡으로 멍하게 보기 좋아요"

## Card data — DetailSheet
- + 백드롭 이미지
- 줄거리 (한글)
- 감독 / 주연 4명
- 장르 태그
- 런타임 또는 시즌 수
- OTT별 가용성 (구독/대여/구매)
- 관련 작품

## Discover 인터랙션 — 4방향 + 탭 (틴더 아님)
- **좌 스와이프** → 다음 카드 (next)
- **우 스와이프** → 이전 카드 (위에서 미끄러져 내려옴 / 오버레이)
- **위 스와이프** → 상세 시트
- **아래 스와이프** → 저장 (Save 버튼으로 흡수)
- **탭** → 상세 시트
- 카드 스택: 3장 부채꼴, depth별 scale = 1 - depth × 0.04, yOffset = depth × 12px

## Saved 뷰
- **기본: OTT별 그룹핑**
  - 헤더: OTT 로고 + 작품 수 ("Netflix · 12개")
  - 본문: 가로 스크롤 카로셀
  - 빈 상태: 온보딩 픽 5개 자동 시드 (절대 비어있지 않음)
- 필터: 저장 시점 / OTT / 작품 유형
- 재방문 동기:
  - "OO에서 새로 추가됨" 배지
  - "○일 전에 저장" 미세 텍스트
  - 시청한 vs 안 본 구분

## 요청한 변형 — Discover 카드 3가지
- **A. 포스터 강조** (Editorial 사진 잡지 톤)
- **B. 타이포 강조** (제목·추천 이유가 시각 위계 상위)
- **C. 시네마틱** (어두운 배경 + 영화관 분위기)
- 각 변형마다 4방향 스와이프 모션 prototype 함께

## 참고 스크린샷 (현재 디자인 톤)
- uploads/after-antislop-discover.png — 카드 스택, "Neko" 헤더, 포스터 + 메타 + 줄거리 + Save 버튼
- uploads/after-antislop-saved.png — "Saved" 헤더, 탭(전체/안 본/시청 완료/히스토리), CTA 배너, 그리드 카드(봤어요?/X 칩)

## Phase 1에서 결정된 것
- Editorial illustrations 8종 — 새 빈 상태에 활용
- Motion: 5 easings + 5 durations, 8 micro-interactions

## Fonts (확정)
- **Fraunces** (헤더, 영문/숫자, 큰 작품 제목, 섹션 구분)
- **Pretendard** (모든 한글 텍스트 — 작품 제목, 추천 이유, 본문, 라벨, 버튼)
- Pretendard weights: 300/400/500/600/700
- 본문 line-height ≈ 1.5

## 포스터 (확정)
실제 TMDB mock 데이터 사용. 작품 리스트:
- **한국 영화**: 헤어질 결심, 기생충, 올드보이, 패스트 라이브즈
- **한국 시리즈**: 오징어 게임, 마스크걸, 더 글로리
- **한국 예능**: 환승연애, 유 퀴즈 온 더 블럭
- **글로벌**: 오자크, 인터스텔라, 듄: 파트2
- OTT 분포: Netflix / Wavve / Tving / Watcha / Disney+

## 4방향 스와이프 — Save 흡수 모션 (보강)
**아래 스와이프 = 저장**:
- 카드가 우측하단 Save 버튼으로 빨려 들어가듯 transform (scale ↓ + translate to button)
- Save 버튼 scale up + glow → 흡수 시점
- 햅틱 피드백 시사
- 변형 A/B/C 모두 동일 감각 유지

## 빈 상태 8종 (확정 시나리오)
1. **Discover 추천 0개** — 필터 너무 좁음 → "noResults" 일러
2. **Discover 로딩 / Bridge** — 첫 추천 생성 중 → "calibrating"
3. **Discover 네트워크 에러** — 재시도 버튼 → "error"
4. **Saved 빈 (폴백)** — 자동 시드 전 → "emptySaved"
5. **Saved 필터 빈** — 필터 적용 후 0개 → "emptyDiscover" 변형 또는 신규
6. **검색 결과 빈** — "검색 결과 없어요" → "noResults" 변형
7. **온보딩 검색 빈** — 5개 픽 단계 → "onboarding"
8. **시청 리포트 빈** — 아직 본 작품 없음 → "archive" 변형 또는 신규

→ Phase 1 8종을 이 시나리오에 매핑하되, 일부는 신규로 그릴 수 있음.

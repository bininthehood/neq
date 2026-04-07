---
name: mobile-qa
description: "Neko 모바일 PWA QA 테스트, 통합 정합성 검증, 엣지 케이스, 리그레션 체크, 빌드 검증. 'QA', '테스트', '버그 찾아줘', '검증', '리그레션', '빌드 확인' 요청 시 사용."
---

# Mobile QA — Neko 품질 검증 가이드

## 검증 순서
1. `npm run build` — 빌드/타입 에러 체크
2. 통합 정합성 — API ↔ 프론트 교차 비교
3. 기능 정합성 — 핵심 플로우 검증
4. 엣지 케이스 — 빈 상태, 에러, 경계값
5. DESIGN.md 준수 — ux-reviewer와 교차 확인

## 1. 통합 정합성 검증

### API 응답 ↔ 프론트 타입

각 API route의 `NextResponse.json()` 반환값과 프론트의 소비 코드를 동시에 읽고 비교:

| API | 응답 shape | 소비 코드 | 검증 |
|-----|----------|----------|------|
| POST `/api/recommend` | `{ recommendations: Recommendation[] }` | `data.recommendations` | shape 일치? |
| GET `/api/search` | `SearchResult[]` | `setResults(data)` | 배열 직접? |
| GET `/api/trending` | `SearchResult[]` | `setSuggestions(data)` | 배열 직접? |

### localStorage 키 일관성

`src/lib/store.ts`의 키와 실제 사용처 교차 비교:

| 키 | set 함수 | get 함수 | 소비 컴포넌트 |
|-----|---------|---------|-------------|
| `neko_favorites` | `setFavorites()` | `getFavorites()` | onboarding, discover |
| `neko_saved` | `addSaved()` | `getSaved()` | discover, saved |
| `neko_recommendations` | `setRecommendations()` | `getRecommendations()` | discover |
| `neko_recs_*` | `setRecommendations(ft, fo)` | `getRecommendations(ft, fo)` | discover (필터별) |

## 2. 핵심 플로우 검증

### 온보딩 → 디스커버
1. 작품 3개 미만 선택 → 버튼 비활성화
2. 작품 3-5개 선택 → "시작하기" 활성화
3. router.push("/discover") → 추천 로딩 → 카드 표시

### 스와이프 사이클
1. 좌측 스와이프 (Pass) → 다음 카드
2. 우측 스와이프 (Save) → `addSaved()` + 다음 카드
3. 탭 → Detail 오버레이
4. Undo → 이전 카드 복원
5. 모든 카드 소진 → "새로운 추천 받기"

### 필터 변경
1. 필터 칩 클릭 → 캐시 확인 → 있으면 즉시, 없으면 API 호출
2. 필터 조합: all/movie/series × all/kr/foreign = 9가지

## 3. 엣지 케이스

| 케이스 | 예상 동작 | 확인 파일 |
|--------|----------|----------|
| 추천 0개 | 빈 상태 UI + "다시 시도" | discover/page.tsx |
| 포스터 null | 폴백 이모지 (🎬) | discover/page.tsx |
| Provider 0개 | 해당 추천 스킵 (recommend.ts) | recommend.ts:92 |
| API 500 에러 | `{ error, recommendations: [] }` | api/recommend/route.ts |
| Rate limit 429 | 에러 메시지 표시 | api/recommend/route.ts |
| localStorage 비어있음 | 온보딩으로 리다이렉트 | discover useEffect |
| 네트워크 끊김 | fetch 실패 → 에러 상태? | 미구현 여부 확인 |

## 리포트 형식

```markdown
## QA Report — {날짜} {범위}

### Summary
- PASS: N / FAIL: M / WARN: K / SKIP: J

### Details
- [PASS] API 정합성 — /api/recommend 응답 shape 일치
- [FAIL] 엣지 케이스 — discover/page.tsx:68 — fetch 실패 시 에러 UI 미표시
  재현: API 서버 다운 시 무한 로딩
  수정 방향: try-catch + setError 상태 추가
- [WARN] 터치 타겟 — BottomNav.tsx:16 — nav 링크 터치 영역 불명확
```

---
name: tmdb-integration
description: "TMDB API 통합, OTT provider 조회, 메타데이터 확장, 검색 최적화, 트렌딩 데이터. 'TMDB', 'provider', 'OTT 가용성', '메타데이터', '포스터', '검색 개선' 요청 시 사용."
---

# TMDB Integration — 콘텐츠 데이터 관리

Neko의 TMDB API 통합 가이드.

## 핵심 파일
- `src/lib/tmdb.ts` — TMDB API 함수들
- `src/lib/types.ts` — TMDBResult, Recommendation 타입
- `src/app/api/search/route.ts` — 검색 API
- `src/app/api/trending/route.ts` — 트렌딩 API

## 현재 TMDB 함수 목록

| 함수 | 용도 | 엔드포인트 |
|------|------|-----------|
| `searchTMDB(title, type)` | 한글→영문 폴백 검색 | `/search/{movie\|tv}` |
| `searchMulti(query)` | 멀티 검색 (온보딩용) | `/search/multi` |
| `getKoreanProviders(id, type)` | KR OTT provider 조회 | `/{movie\|tv}/{id}/watch/providers` |
| `posterUrl(path, size)` | 포스터 URL 생성 | image.tmdb.org |

## TMDB API 패턴

### 검색
- 항상 `language=ko-KR` 우선, 결과 없으면 `language=en-US` 폴백
- `api_key`는 쿼리 파라미터로 전달 (Bearer 토큰 방식도 가능하지만 현재 구조 유지)

### Provider 조회
- KR region 데이터만 사용 (`data.results?.KR`)
- flatrate(구독) + rent(대여) + buy(구매) 통합, 중복 제거
- watchLink: `kr.link` — JustWatch 연결

### 포스터
- 기본 size: `w500` (카드용)
- 작은 size: `w200` (온보딩 그리드, Saved 리스트)
- null 체크 필수 — `poster_path`가 null인 콘텐츠 존재

## 확장 가능한 엔드포인트

| 엔드포인트 | 용도 | 추가 시 주의사항 |
|-----------|------|----------------|
| `/{type}/{id}` | 상세 정보 (장르, 런타임, 감독) | 추가 API 호출 비용 |
| `/{type}/{id}/credits` | 출연진/감독 | 데이터 양 많음, 필요한 필드만 추출 |
| `/{type}/{id}/similar` | 유사 작품 | LLM 추천과 중복 가능 |
| `/trending/{type}/week` | 주간 트렌딩 | 현재 사용 중 |

## 변경 시 주의사항
- `TMDBResult` 타입 변경 시 `Recommendation` 매핑 로직도 함께 확인
- 새 API 함수 추가 시 에러 핸들링 패턴 유지 (try-catch, null 반환)
- rate limit 고려: TMDB는 40 req/10sec 제한

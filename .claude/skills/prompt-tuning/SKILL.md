---
name: prompt-tuning
description: "OpenAI 추천 프롬프트 튜닝, 추천 다양성 개선, 필터 로직 최적화, temperature 조정, 추천 품질 분석. '추천이 뻔하다', '다양성 부족', '필터가 안 먹힌다', '프롬프트 개선', '추천 품질' 요청 시 사용."
---

# Prompt Tuning — 추천 프롬프트 최적화

Neko 추천 엔진의 OpenAI 프롬프트를 분석하고 최적화하는 스킬.

## 핵심 파일
- `src/lib/recommend.ts` — OpenAI 프롬프트, 필터 로직, 추천 파이프라인
- `src/app/api/recommend/route.ts` — API 엔드포인트, 입력 검증, rate limit
- `src/lib/types.ts` — Recommendation, RecommendFilter 타입

## 프롬프트 구조 이해

현재 시스템 프롬프트 구조:
1. 역할 정의 ("영화/시리즈 추천 전문가")
2. 규칙 (입력 작품 제외, 초유명작 제외, 한국 OTT 가용, 숨겨진 명작 우선)
3. 필터 프롬프트 (type/origin 조건 — `buildFilterPrompt()`)
4. 출력 형식 (JSON schema)

## 튜닝 체크리스트

### 다양성
- 장르 다양성: 입력이 모두 액션이라도 스릴러/SF/느와르 등 인접 장르 포함
- 시대 다양성: 최신작 편중 방지 — 클래식도 포함
- 국가 다양성: 한국/미국 편중 방지 (origin 필터가 없을 때)

### 필터 정확도
- type 필터: LLM 프롬프트(소프트) + 서버 `rec.type` 검증(하드)
- origin 필터: LLM 프롬프트(소프트) + 서버 `originCountry` 검증(하드)
- 이중 방어 구조를 반드시 유지. LLM만 믿지 말 것

### 품질
- reason 필드: 구체적이고 개인화된 이유 ("당신이 좋아한 X의 Y 요소와 비슷한...")
- 중복 방지: 같은 프랜차이즈/시리즈의 다른 시즌 제외
- 가용성: "한국에서 OTT로 볼 수 있는" 조건 강화

## 파라미터 가이드
- `temperature: 0.9` — 현재 값. 다양성 vs 관련성 트레이드오프
  - 0.7~0.8: 더 안전하고 관련성 높은 추천
  - 0.9~1.0: 더 다양하고 의외의 추천
- `response_format: { type: "json_object" }` — JSON 출력 강제
- 추천 개수: LLM에 15개 요청 → OTT 가용 필터링 → 최대 10개 반환

## 변경 시 주의사항
- 프롬프트 변경 후 반드시 qa-tester에게 검증 요청
- Recommendation 타입 필드 추가/변경 시 frontend-builder에게 알림
- `buildFilterPrompt()` 변경 시 모든 filter 조합 (all/movie/series × all/kr/foreign) 검증

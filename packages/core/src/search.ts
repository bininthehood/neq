/**
 * Search UI — 순수 로직 (web/native 공용).
 *
 * D10 web SearchSheet 의 4 case 분기와 카테고리 그룹 빌드를 packages/core 로 추출.
 * web (`apps/web/src/components/discover/SearchSheet.tsx`) + native
 * (`apps/native/components/SearchSheet.tsx`) 가 동일 함수를 import 한다.
 *
 * 외부 의존 0. 단위 테스트 대상.
 */

import type { GroupedSearchResponse } from "./types";

// ─────────────────────────────────────────────────────
// State machine
// ─────────────────────────────────────────────────────

export type SearchUiState = "idle" | "loading" | "empty" | "error" | "ok";

export interface SearchUiInput {
  /** 사용자 입력 query (trim 안 된 raw) */
  query: string;
  /** fetch 진행 중 여부 */
  isFetching: boolean;
  /** 마지막 fetch 에러 */
  hasError: boolean;
  /** grouped 응답 (또는 null = 아직 응답 없음) */
  data: GroupedSearchResponse | null;
}

/**
 * 4 케이스 + idle 상태 분기 결정.
 *
 * 우선순위:
 *   1. query 비어있으면 → idle
 *   2. fetch 진행 중이면 → loading
 *   3. 에러 발생했으면 → error
 *   4. data 가 null (아직 응답 X) 또는 모든 그룹 0건 → empty
 *   5. 그 외 → ok
 */
export function resolveSearchUiState(input: SearchUiInput): SearchUiState {
  const trimmed = input.query.trim();
  if (trimmed.length === 0) return "idle";
  if (input.isFetching) return "loading";
  if (input.hasError) return "error";
  if (!input.data) return "empty";
  const total =
    input.data.works.length +
    input.data.directors.length +
    input.data.actors.length;
  if (total === 0) return "empty";
  return "ok";
}

// ─────────────────────────────────────────────────────
// Category groups
// ─────────────────────────────────────────────────────

/**
 * 카테고리별 그룹 정의. 0건 그룹은 호출자가 필터링.
 */
export interface CategoryGroup {
  key: "works" | "directors" | "actors";
  label: string;
  count: number;
}

/**
 * grouped 응답 → 카테고리 헤더 메타 (count > 0 그룹만).
 */
export function buildCategoryGroups(
  data: GroupedSearchResponse,
): CategoryGroup[] {
  const groups: CategoryGroup[] = [
    { key: "works", label: "작품", count: data.works.length },
    { key: "directors", label: "감독", count: data.directors.length },
    { key: "actors", label: "배우", count: data.actors.length },
  ];
  return groups.filter((g) => g.count > 0);
}

// ─────────────────────────────────────────────────────
// 디바운스
// ─────────────────────────────────────────────────────

/** 디바운스 ms — UI/테스트 모두 동일 상수 사용. */
export const SEARCH_DEBOUNCE_MS = 200;

// ─────────────────────────────────────────────────────────────────────
// Phase C (2026-06-06) — Diversity reorder
//
// LLM 이 선택한 N 개 추천을 **순서만 재정렬** 해 같은 장르(type)/연도(decade)/
// OTT 가 연속 노출되지 않게 한다. 후보 풀 자체는 손대지 않음 (Phase B 그대로).
//
// 알고리즘:
//   greedy reorder — 매 슬롯에서 제약 (maxConsecutive…) 을 충족하는 첫 후보를 선택.
//   충족 가능한 후보가 없으면 첫 후보 그대로 사용 (drop 없음 — 입력 길이 보존).
//
// 효과:
//   - 같은 batch 안에서 같은 type / decade / OTT 가 연속 등장 cap → 사용자 체감
//     "비슷한 추천" 감소.
//   - 후보 셋 (tmdbId set) 은 동일 → 다음 batch 와의 Jaccard 자체에는 영향이 없으나,
//     **단일 batch 내 다양성** 이 핵심 목적.
//
// 기존 interleaveByGenre 의 superset — type 연속만 차단하던 것을 decade/OTT 까지 확장.
// ─────────────────────────────────────────────────────────────────────

import type { Recommendation } from "./types";

export interface DiversityConstraints {
  /** 같은 장르(primary genre) 연속 허용 최대. 기본 1 (= 즉시 차단). */
  maxConsecutiveSameGenre: number;
  /** 같은 decade 연속 허용 최대. 기본 2. */
  maxConsecutiveSameDecade: number;
  /** 같은 OTT 연속 허용 최대. 기본 3. */
  maxConsecutiveSameOtt: number;
  /** batch 내 director 종류 최소 (drop 으로 보장. 부족하면 그대로 통과). 기본 5. */
  minDirectorVariety: number;
}

export const DEFAULT_DIVERSITY: DiversityConstraints = {
  maxConsecutiveSameGenre: 1,
  maxConsecutiveSameDecade: 2,
  maxConsecutiveSameOtt: 3,
  minDirectorVariety: 5,
};

// ── 필드 추출 헬퍼 (Recommendation primary 매핑) ─────────────────────
// Recommendation 에 genres 필드가 없음 → type (movie | series | variety) 사용.
// 더 정교한 genre matching 은 enrichment 단계에서 별도 필드 추가 필요.

function primaryGenre(rec: Recommendation): string {
  return rec.type ?? "unknown";
}

function primaryDecade(rec: Recommendation): string | null {
  const d = rec.date;
  if (!d) return null;
  const m = /^(\d{4})/.exec(d);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  if (!Number.isFinite(year)) return null;
  const decade = Math.floor(year / 10) * 10;
  return `${decade}s`;
}

function primaryOtt(rec: Recommendation): string | null {
  const p = rec.providers?.[0];
  if (!p?.name) return null;
  return p.name;
}

// ── 위반 검사 ────────────────────────────────────────────────────────
// prefix 의 마지막 N 개에서 candidate 와 동일한 attribute 가 연속된 카운트가
// max 를 초과하면 true.

function trailingSame<T>(
  arr: T[],
  match: T,
): number {
  let n = 0;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] === match) n++;
    else break;
  }
  return n;
}

function violates(
  prefix: Recommendation[],
  candidate: Recommendation,
  c: DiversityConstraints,
): boolean {
  if (prefix.length === 0) return false;

  // genre
  const gPrefix = prefix.map(primaryGenre);
  const gCand = primaryGenre(candidate);
  if (trailingSame(gPrefix, gCand) >= c.maxConsecutiveSameGenre) return true;

  // decade — null 끼리는 연속 카운트하지 않음 (제약 없음)
  const dCand = primaryDecade(candidate);
  if (dCand !== null) {
    const dPrefix = prefix.map(primaryDecade);
    if (trailingSame(dPrefix, dCand) >= c.maxConsecutiveSameDecade) return true;
  }

  // ott — null (provider 없음) 은 제약 없음
  const oCand = primaryOtt(candidate);
  if (oCand !== null) {
    const oPrefix = prefix.map(primaryOtt);
    if (trailingSame(oPrefix, oCand) >= c.maxConsecutiveSameOtt) return true;
  }

  return false;
}

/**
 * Recommendation 배열을 diversity 제약 조건 기준으로 재배열.
 * - constraint 위반 시 다음 후보를 swap (greedy reorder)
 * - 입력 길이 보존 (drop 없음)
 * - 무한 루프 방지 — 한 슬롯 당 swap 시도 횟수 cap (= remaining.length)
 *
 * 주의:
 *  - Phase B 의 LLM phase 1 (개인화 reason) 와 phase 2 (template reason) 가
 *    섞여있을 수 있으므로 reason 보존. id/순서만 변경.
 *  - interleaveByGenre 와 동일 인터페이스 — recommend.ts 가 한 줄 교체로 적용 가능.
 */
export function applyDiversityReorder(
  recs: Recommendation[],
  constraints: DiversityConstraints = DEFAULT_DIVERSITY,
): Recommendation[] {
  if (recs.length <= 1) return [...recs];

  const result: Recommendation[] = [];
  const remaining = [...recs];

  while (remaining.length > 0) {
    let chosenIdx = -1;
    for (let i = 0; i < remaining.length; i++) {
      if (!violates(result, remaining[i], constraints)) {
        chosenIdx = i;
        break;
      }
    }
    // 제약 충족 불가 → 첫 후보 (drop 없음 — 입력 길이 보존)
    if (chosenIdx < 0) chosenIdx = 0;
    result.push(remaining[chosenIdx]);
    remaining.splice(chosenIdx, 1);
  }

  return result;
}

import { VARIETY_GENRE_IDS } from "../discover-types";
import type { RecommendFilter } from "../types";
import type { EnrichedCandidate } from "./types";

// ---------- Step 5: 필터링 ----------

export function applyFilters(
  enriched: EnrichedCandidate[],
  filter: RecommendFilter
): EnrichedCandidate[] {
  return enriched.filter((c) => {
    // 한국 OTT 가용성 필수
    if (c.providers.length === 0) return false;

    // type 필터
    if (filter.type === "movie" && c.type !== "movie") return false;
    if (filter.type === "series" && c.type !== "series") return false;

    // 예능(variety) 필터: TV이면서 genre_ids에 Reality(10764) 또는 Talk(10767) 포함
    if (filter.type === "variety") {
      if (c.type !== "series") return false;
      const hasVarietyGenre = (c.item.genre_ids ?? []).some(
        (gid) => VARIETY_GENRE_IDS.includes(gid),
      );
      if (!hasVarietyGenre) return false;
    }

    // origin 필터 (production_countries 기준)
    const isKR = c.details.country.includes("KR");
    if (filter.origin === "kr" && !isKR) return false;
    if (filter.origin === "foreign" && isKR) return false;

    // OTT 필터 (서버 사이드 — 클라이언트에서 부족할 때 전달됨)
    if (filter.ott && filter.ott.length > 0) {
      const ottSet = new Set(filter.ott);
      if (!c.providers.some((p) => ottSet.has(p.name))) return false;
    }

    // 년도 필터
    if (filter.year) {
      const dateStr = c.item.release_date ?? c.item.first_air_date ?? "";
      const year = parseInt(dateStr.slice(0, 4));
      if (isNaN(year)) return false;
      if (filter.year === "recent" && year < 2020) return false;
      if (filter.year === "2010s" && (year < 2010 || year > 2019)) return false;
      if (filter.year === "classic" && year > 2009) return false;
    }

    return true;
  });
}

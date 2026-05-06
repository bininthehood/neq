import { searchTMDB, getTMDBRecommendations } from "../tmdb";
import type { Candidate, MatchedFavorite } from "./types";

// ---------- Step 1: favorites → TMDB 매칭 ----------

export async function matchFavoritesToTMDB(favorites: string[]): Promise<MatchedFavorite[]> {
  const results = await Promise.all(
    favorites.map(async (title) => {
      let result = await searchTMDB(title, "movie");
      let type: "movie" | "series" = "movie";
      if (!result) {
        result = await searchTMDB(title, "series");
        type = "series";
      }
      if (!result) return null;
      return { id: result.id, type, title, genreIds: result.genre_ids ?? [] };
    })
  );
  return results.filter((r): r is MatchedFavorite => r !== null);
}

// ---------- Step 2-3: 후보 수집 + 병합 + 랭킹 ----------

export async function gatherCandidates(
  matched: MatchedFavorite[],
  excludeIds: Set<number>,
  excludeTitles: Set<string>
): Promise<Candidate[]> {
  // 각 취향 작품마다 movie + series 양쪽 /recommendations 호출
  // (영화 ID로 tv 호출 시 빈 결과 → 안전하게 무시됨)
  const allRecs = await Promise.all(
    matched.flatMap((fav) => [
      getTMDBRecommendations(fav.id, "movie"),
      getTMDBRecommendations(fav.id, "series"),
    ])
  );

  const freqMap = new Map<number, Candidate>();
  for (const recs of allRecs) {
    for (const item of recs) {
      if (excludeIds.has(item.id)) continue;
      if (excludeTitles.has(item.title)) continue;
      const existing = freqMap.get(item.id);
      if (existing) {
        existing.frequency++;
        existing.score = existing.frequency * (existing.item.vote_average || 1);
      } else {
        freqMap.set(item.id, {
          id: item.id,
          type: item.media_type === "tv" ? "series" : "movie",
          item,
          frequency: 1,
          score: item.vote_average || 1,
        });
      }
    }
  }

  const sorted = Array.from(freqMap.values())
    .sort((a, b) => b.score - a.score);
  // 상위 20개는 유지하고, 나머지는 셔플 → 매 호출마다 다른 조합
  const top = sorted.slice(0, 20);
  const rest = sorted.slice(20).sort(() => Math.random() - 0.5);
  // 100 → 75: user prompt 토큰 ~25% 절감 + LLM 처리 시간 ~15~20% 단축 추정 [Day 19 옵션 5]
  return [...top, ...rest].slice(0, 75);
}

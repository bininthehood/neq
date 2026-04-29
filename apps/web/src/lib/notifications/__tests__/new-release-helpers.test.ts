/**
 * new-release-helpers 단위 테스트
 *
 * 검증 범위:
 *  - normalizePopularity / attractivenessScore : 매력도 가중치 (Q2)
 *  - pickTopCandidate : 우선순위 (A>B>C>D) + score desc + release_date desc
 *  - extractNewSeasonCandidates : 시즌 0 제외 (Q1) + air_date 비교
 *  - extractPersonNewWorks : director(crew) / actor(cast) + release_date 필터
 *  - extractDiscoverCandidates : results 변환 + topN
 *  - posterUrlFromPath : null 안전
 *  - buildPayloadText : 트리거별 텍스트
 *  - tmdbTvDetails / tmdbPersonCredits / tmdbDiscoverByProvider : fetch wrapper (정상/429/404)
 *  - yesterdayIsoDate : YYYY-MM-DD 형식
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

beforeEach(() => {
  vi.stubEnv("TMDB_API_KEY", "test-tmdb-key");
  vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
});

describe("normalizePopularity", () => {
  it("p=0 → 0", async () => {
    const { normalizePopularity } = await import("../new-release-helpers");
    expect(normalizePopularity(0)).toBe(0);
  });
  it("p=1000 → 약 1.0 cap", async () => {
    const { normalizePopularity } = await import("../new-release-helpers");
    const v = normalizePopularity(1000);
    expect(v).toBeGreaterThan(0.9);
    expect(v).toBeLessThanOrEqual(1.0);
  });
  it("p=10 → 약 0.34", async () => {
    const { normalizePopularity } = await import("../new-release-helpers");
    const v = normalizePopularity(10);
    expect(v).toBeGreaterThan(0.3);
    expect(v).toBeLessThan(0.4);
  });
  it("음수/NaN → 0", async () => {
    const { normalizePopularity } = await import("../new-release-helpers");
    expect(normalizePopularity(-5)).toBe(0);
    expect(normalizePopularity(Number.NaN)).toBe(0);
  });
});

describe("attractivenessScore", () => {
  it("0.5 * vote/10 + 0.5 * pop_norm 합산", async () => {
    const { attractivenessScore } = await import("../new-release-helpers");
    // vote=8, pop=10 → 0.5*0.8 + 0.5*~0.34 ≈ 0.57
    const score = attractivenessScore({
      trigger: "B_director",
      tmdbId: 1,
      mediaType: "movie",
      title: "x",
      posterUrl: null,
      voteAverage: 8,
      popularity: 10,
      releaseDate: "2026-04-29",
    });
    expect(score).toBeGreaterThan(0.55);
    expect(score).toBeLessThan(0.6);
  });
  it("vote=0, pop=0 → 0", async () => {
    const { attractivenessScore } = await import("../new-release-helpers");
    const score = attractivenessScore({
      trigger: "A_season",
      tmdbId: 1,
      mediaType: "tv",
      title: "x",
      posterUrl: null,
      voteAverage: 0,
      popularity: 0,
      releaseDate: null,
    });
    expect(score).toBe(0);
  });
});

describe("pickTopCandidate", () => {
  it("A > B > C > D 우선순위 (점수 동률)", async () => {
    const { pickTopCandidate } = await import("../new-release-helpers");
    const same = (trigger: "A_season" | "B_director" | "C_actor" | "D_provider") => ({
      trigger,
      tmdbId: 1,
      mediaType: "movie" as const,
      title: trigger,
      posterUrl: null,
      voteAverage: 8,
      popularity: 50,
      releaseDate: "2026-04-29",
    });
    const out = pickTopCandidate([same("D_provider"), same("B_director"), same("A_season"), same("C_actor")]);
    expect(out?.trigger).toBe("A_season");
  });
  it("동일 우선순위 시 매력도 desc", async () => {
    const { pickTopCandidate } = await import("../new-release-helpers");
    const out = pickTopCandidate([
      {
        trigger: "B_director",
        tmdbId: 1,
        mediaType: "movie",
        title: "low",
        posterUrl: null,
        voteAverage: 5,
        popularity: 1,
        releaseDate: "2026-04-29",
      },
      {
        trigger: "B_director",
        tmdbId: 2,
        mediaType: "movie",
        title: "high",
        posterUrl: null,
        voteAverage: 9,
        popularity: 500,
        releaseDate: "2026-04-29",
      },
    ]);
    expect(out?.tmdbId).toBe(2);
  });
  it("점수 동률 시 release_date desc (최신 우선)", async () => {
    const { pickTopCandidate } = await import("../new-release-helpers");
    const out = pickTopCandidate([
      {
        trigger: "B_director",
        tmdbId: 1,
        mediaType: "movie",
        title: "older",
        posterUrl: null,
        voteAverage: 8,
        popularity: 100,
        releaseDate: "2026-04-01",
      },
      {
        trigger: "B_director",
        tmdbId: 2,
        mediaType: "movie",
        title: "newer",
        posterUrl: null,
        voteAverage: 8,
        popularity: 100,
        releaseDate: "2026-04-29",
      },
    ]);
    expect(out?.tmdbId).toBe(2);
  });
  it("빈 배열 → null", async () => {
    const { pickTopCandidate } = await import("../new-release-helpers");
    expect(pickTopCandidate([])).toBeNull();
  });
});

describe("extractNewSeasonCandidates", () => {
  it("season_number > 0 + air_date > sinceIso 만 통과 (Q1: 시즌 0 제외)", async () => {
    const { extractNewSeasonCandidates } = await import("../new-release-helpers");
    const tv = {
      id: 1399,
      name: "왕좌의 게임",
      vote_average: 9,
      popularity: 200,
      poster_path: "/x.jpg",
      seasons: [
        { season_number: 0, air_date: "2026-04-29" }, // 스페셜 — drop
        { season_number: 1, air_date: "2025-01-01" }, // 옛날 — drop
        { season_number: 8, air_date: "2026-04-29" }, // 통과
      ],
    };
    const out = extractNewSeasonCandidates(tv, "2026-04-28");
    expect(out).toHaveLength(1);
    expect(out[0].seasonNumber).toBe(8);
    expect(out[0].trigger).toBe("A_season");
    expect(out[0].mediaType).toBe("tv");
    expect(out[0].posterUrl).toBe("https://image.tmdb.org/t/p/w500/x.jpg");
  });

  it("seasons 비어있거나 null → 빈 배열", async () => {
    const { extractNewSeasonCandidates } = await import("../new-release-helpers");
    expect(extractNewSeasonCandidates(null, "2026-04-28")).toEqual([]);
    expect(extractNewSeasonCandidates({ id: 1 }, "2026-04-28")).toEqual([]);
    expect(extractNewSeasonCandidates({ id: 1, seasons: [] }, "2026-04-28")).toEqual([]);
  });

  it("air_date null → drop", async () => {
    const { extractNewSeasonCandidates } = await import("../new-release-helpers");
    const out = extractNewSeasonCandidates(
      {
        id: 1,
        name: "test",
        seasons: [{ season_number: 1, air_date: null }],
      },
      "2026-04-28",
    );
    expect(out).toEqual([]);
  });
});

describe("extractPersonNewWorks", () => {
  it("director role → crew.job=Director 만 통과", async () => {
    const { extractPersonNewWorks } = await import("../new-release-helpers");
    const credits = {
      crew: [
        {
          id: 100,
          title: "신작",
          job: "Director",
          release_date: "2026-04-29",
          vote_average: 7,
          popularity: 50,
        },
        {
          id: 200,
          title: "에디팅",
          job: "Editor",
          release_date: "2026-04-29",
        },
      ],
      cast: [],
    };
    const out = extractPersonNewWorks(credits, 1, "박찬욱", "movie", "director", "2026-04-28");
    expect(out).toHaveLength(1);
    expect(out[0].tmdbId).toBe(100);
    expect(out[0].trigger).toBe("B_director");
    expect(out[0].personId).toBe(1);
    expect(out[0].personName).toBe("박찬욱");
  });

  it("actor role → cast 사용 + release_date 필터", async () => {
    const { extractPersonNewWorks } = await import("../new-release-helpers");
    const credits = {
      cast: [
        { id: 1, name: "old", title: "old film", release_date: "2025-01-01" },
        { id: 2, name: "new", title: "new film", release_date: "2026-04-29" },
      ],
      crew: [],
    };
    const out = extractPersonNewWorks(credits, 99, "송강호", "movie", "actor", "2026-04-28");
    expect(out).toHaveLength(1);
    expect(out[0].tmdbId).toBe(2);
    expect(out[0].trigger).toBe("C_actor");
  });

  it("tv → first_air_date 사용", async () => {
    const { extractPersonNewWorks } = await import("../new-release-helpers");
    const credits = {
      cast: [{ id: 9, name: "x", first_air_date: "2026-04-29" }],
    };
    const out = extractPersonNewWorks(credits, 1, "x", "tv", "actor", "2026-04-28");
    expect(out).toHaveLength(1);
    expect(out[0].mediaType).toBe("tv");
  });

  it("동일 작품 ID dedup", async () => {
    const { extractPersonNewWorks } = await import("../new-release-helpers");
    const credits = {
      cast: [
        { id: 5, name: "ep1", title: "x", release_date: "2026-04-29" },
        { id: 5, name: "ep2", title: "x", release_date: "2026-04-30" }, // 같은 id 중복
      ],
    };
    const out = extractPersonNewWorks(credits, 1, "x", "movie", "actor", "2026-04-28");
    expect(out).toHaveLength(1);
  });

  it("null/undefined credits → 빈 배열", async () => {
    const { extractPersonNewWorks } = await import("../new-release-helpers");
    expect(extractPersonNewWorks(null, 1, "x", "movie", "actor", "2026-04-28")).toEqual([]);
  });
});

describe("extractDiscoverCandidates", () => {
  it("results.slice(0, topN) → D_provider 후보", async () => {
    const { extractDiscoverCandidates } = await import("../new-release-helpers");
    const out = extractDiscoverCandidates(
      {
        results: [
          { id: 1, title: "1편", release_date: "2026-04-29", vote_average: 7, popularity: 50 },
          { id: 2, title: "2편", release_date: "2026-04-28", vote_average: 6, popularity: 30 },
          { id: 3, title: "3편", release_date: "2026-04-27", vote_average: 5, popularity: 10 },
        ],
      },
      "movie",
      2,
    );
    expect(out).toHaveLength(2);
    expect(out[0].tmdbId).toBe(1);
    expect(out[0].trigger).toBe("D_provider");
  });

  it("tv → name + first_air_date", async () => {
    const { extractDiscoverCandidates } = await import("../new-release-helpers");
    const out = extractDiscoverCandidates(
      { results: [{ id: 99, name: "tv시리즈", first_air_date: "2026-04-29" }] },
      "tv",
      5,
    );
    expect(out[0].title).toBe("tv시리즈");
    expect(out[0].releaseDate).toBe("2026-04-29");
  });

  it("results 없으면 빈 배열", async () => {
    const { extractDiscoverCandidates } = await import("../new-release-helpers");
    expect(extractDiscoverCandidates({}, "movie")).toEqual([]);
    expect(extractDiscoverCandidates(null, "movie")).toEqual([]);
  });
});

describe("posterUrlFromPath", () => {
  it("path → 풀 URL", async () => {
    const { posterUrlFromPath } = await import("../new-release-helpers");
    expect(posterUrlFromPath("/abc.jpg")).toBe("https://image.tmdb.org/t/p/w500/abc.jpg");
  });
  it("null/undefined → null", async () => {
    const { posterUrlFromPath } = await import("../new-release-helpers");
    expect(posterUrlFromPath(null)).toBeNull();
    expect(posterUrlFromPath(undefined)).toBeNull();
    expect(posterUrlFromPath("")).toBeNull();
  });
});

describe("buildPayloadText", () => {
  it("A_season — 시즌 번호 노출", async () => {
    const { buildPayloadText } = await import("../new-release-helpers");
    const text = buildPayloadText({
      trigger: "A_season",
      tmdbId: 1,
      mediaType: "tv",
      title: "왕좌의 게임",
      posterUrl: null,
      voteAverage: 9,
      popularity: 200,
      releaseDate: "2026-04-29",
      seasonNumber: 8,
    });
    expect(text.title).toBe("왕좌의 게임 새 시즌");
    expect(text.body).toMatch(/시즌 8/);
  });

  it("B_director — '감독 신작' 톤", async () => {
    const { buildPayloadText } = await import("../new-release-helpers");
    const text = buildPayloadText({
      trigger: "B_director",
      tmdbId: 1,
      mediaType: "movie",
      title: "헤어질 결심",
      posterUrl: null,
      voteAverage: 8,
      popularity: 100,
      releaseDate: "2026-04-29",
      personName: "박찬욱",
    });
    expect(text.title).toBe("박찬욱 감독 신작");
  });

  it("D_provider — providerNameKr 포함", async () => {
    const { buildPayloadText } = await import("../new-release-helpers");
    const text = buildPayloadText(
      {
        trigger: "D_provider",
        tmdbId: 1,
        mediaType: "movie",
        title: "오징어게임2",
        posterUrl: null,
        voteAverage: 8,
        popularity: 100,
        releaseDate: "2026-04-29",
      },
      "넷플릭스",
    );
    expect(text.title).toBe("넷플릭스 신작");
  });
});

describe("yesterdayIsoDate", () => {
  it("YYYY-MM-DD UTC 형식", async () => {
    const { yesterdayIsoDate } = await import("../new-release-helpers");
    const d = yesterdayIsoDate(new Date("2026-04-29T01:00:00Z"));
    expect(d).toBe("2026-04-28");
  });
});

describe("tmdb fetch wrappers (single sample)", () => {
  it("tmdbTvDetails 200 → JSON", async () => {
    const { tmdbTvDetails, RateLimiter } = await import("../new-release-helpers");
    const limiter = new RateLimiter(1000);
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 1, seasons: [] }),
    });
    const out = await tmdbTvDetails(1, "k", limiter, fakeFetch as unknown as typeof fetch);
    expect(out).toEqual({ id: 1, seasons: [] });
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it("tmdbPersonCredits 429 → 1회 재시도 후 성공", async () => {
    const { tmdbPersonCredits, RateLimiter } = await import("../new-release-helpers");
    const limiter = new RateLimiter(1000);
    const fakeFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ cast: [] }),
      });
    const out = await tmdbPersonCredits(1, "movie", "k", limiter, fakeFetch as unknown as typeof fetch);
    expect(out).toEqual({ cast: [] });
    expect(fakeFetch).toHaveBeenCalledTimes(2);
  }, 10000);

  it("tmdbDiscoverByProvider 404 → throw", async () => {
    const { tmdbDiscoverByProvider, RateLimiter } = await import("../new-release-helpers");
    const limiter = new RateLimiter(1000);
    const fakeFetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    await expect(
      tmdbDiscoverByProvider(8, "movie", "2026-04-28", "k", limiter, fakeFetch as unknown as typeof fetch),
    ).rejects.toThrow(/404/);
  });
});

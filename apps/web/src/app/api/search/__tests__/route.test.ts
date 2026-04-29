/**
 * /api/search route 단위 테스트
 *
 * 검증 범위:
 *  - V1 응답 회귀 (grouped 미지정 / grouped=0)
 *  - grouped=1 정상 분기 (works/directors/actors 매핑)
 *  - grouped=1 빈 결과 (질의 결과 없음 + 빈 query)
 *  - PersonResult.knownFor top 3 매핑 정확성 (title/year 폴백)
 *  - PersonResult.profileUrl null 처리 (profile_path 미존재)
 *
 * 모킹:
 *  - global.fetch: TMDB search/multi 응답 시뮬레이션
 *  - 라우트 모듈 캐시는 vi.resetModules 로 매 케이스 재로드해 env stub 반영
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

interface TMDBSearchResultRaw {
  id: number;
  title?: string;
  name?: string;
  media_type: "movie" | "tv" | "person";
  poster_path?: string | null;
  profile_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  known_for_department?: string;
  known_for?: Array<Record<string, unknown>>;
}

function buildTmdbResponse(results: TMDBSearchResultRaw[]) {
  return {
    ok: true,
    json: async () => ({ results }),
  } as unknown as Response;
}

function makeReq(qs: string): NextRequest {
  return new NextRequest(`https://example.com/api/search?${qs}`);
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("TMDB_API_KEY", "test-tmdb-key");
  vi.resetModules();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("GET /api/search — V1 회귀", () => {
  it("grouped 미지정: V1 배열 응답 (movie/tv 만)", async () => {
    fetchMock.mockResolvedValueOnce(
      buildTmdbResponse([
        {
          id: 101,
          title: "기생충",
          media_type: "movie",
          poster_path: "/abc.jpg",
          release_date: "2019-05-30",
          vote_average: 8.5,
        },
        {
          id: 202,
          name: "오징어 게임",
          media_type: "tv",
          poster_path: "/def.jpg",
          first_air_date: "2021-09-17",
          vote_average: 7.8,
        },
        // person 은 V1 응답에서 필터 제거되어야 함
        {
          id: 999,
          name: "봉준호",
          media_type: "person",
          profile_path: "/p.jpg",
          known_for_department: "Directing",
        },
      ]),
    );

    const { GET } = await import("../route");
    const res = await GET(makeReq("q=기생충"));
    const body = await res.json();

    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect(body[0]).toMatchObject({
      id: 101,
      title: "기생충",
      mediaType: "movie",
      year: "2019",
      rating: 8.5,
    });
    expect(body[0].posterUrl).toBe("https://image.tmdb.org/t/p/w200/abc.jpg");
    expect(body[1]).toMatchObject({ id: 202, mediaType: "tv", year: "2021" });
  });

  it("grouped=0: V1 배열 응답 (grouped 미지정과 동일)", async () => {
    fetchMock.mockResolvedValueOnce(
      buildTmdbResponse([
        {
          id: 101,
          title: "기생충",
          media_type: "movie",
          poster_path: "/abc.jpg",
          release_date: "2019-05-30",
          vote_average: 8.5,
        },
      ]),
    );

    const { GET } = await import("../route");
    const res = await GET(makeReq("q=기생충&grouped=0"));
    const body = await res.json();

    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    expect(body[0].title).toBe("기생충");
  });

  it("빈 query (V1): 빈 배열, fetch 호출 없음", async () => {
    const { GET } = await import("../route");
    const res = await GET(makeReq("q="));
    const body = await res.json();
    expect(body).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/search?grouped=1 — 신규 분기", () => {
  it("정상: works + directors + actors 모두 분류", async () => {
    fetchMock.mockResolvedValueOnce(
      buildTmdbResponse([
        {
          id: 101,
          title: "기생충",
          media_type: "movie",
          poster_path: "/abc.jpg",
          release_date: "2019-05-30",
          vote_average: 8.5,
        },
        {
          id: 202,
          name: "오징어 게임",
          media_type: "tv",
          poster_path: "/def.jpg",
          first_air_date: "2021-09-17",
          vote_average: 7.8,
        },
        {
          id: 301,
          name: "봉준호",
          media_type: "person",
          profile_path: "/bong.jpg",
          known_for_department: "Directing",
          known_for: [
            { id: 11, media_type: "movie", title: "기생충", release_date: "2019-05-30" },
            { id: 12, media_type: "movie", title: "설국열차", release_date: "2013-08-01" },
          ],
        },
        {
          id: 401,
          name: "송강호",
          media_type: "person",
          profile_path: "/song.jpg",
          known_for_department: "Acting",
          known_for: [
            { id: 13, media_type: "movie", title: "기생충", release_date: "2019-05-30" },
          ],
        },
        // 다른 부서 (Production 등) 는 무시되어야 함
        {
          id: 501,
          name: "어떤 프로듀서",
          media_type: "person",
          profile_path: "/x.jpg",
          known_for_department: "Production",
        },
      ]),
    );

    const { GET } = await import("../route");
    const res = await GET(makeReq("q=기생충&grouped=1"));
    const body = await res.json();

    expect(body).toHaveProperty("works");
    expect(body).toHaveProperty("directors");
    expect(body).toHaveProperty("actors");

    expect(body.works).toHaveLength(2);
    expect(body.works[0]).toMatchObject({ id: 101, mediaType: "movie", title: "기생충" });
    expect(body.works[1]).toMatchObject({ id: 202, mediaType: "tv" });

    expect(body.directors).toHaveLength(1);
    expect(body.directors[0]).toMatchObject({
      id: 301,
      name: "봉준호",
      knownForDept: "Directing",
    });
    expect(body.directors[0].profileUrl).toBe("https://image.tmdb.org/t/p/w200/bong.jpg");

    expect(body.actors).toHaveLength(1);
    expect(body.actors[0]).toMatchObject({
      id: 401,
      name: "송강호",
      knownForDept: "Acting",
    });
  });

  it("빈 결과: TMDB results 빈 배열 → { works: [], directors: [], actors: [] }", async () => {
    fetchMock.mockResolvedValueOnce(buildTmdbResponse([]));

    const { GET } = await import("../route");
    const res = await GET(makeReq("q=zzzz없는질의zzzz&grouped=1"));
    const body = await res.json();

    expect(body).toEqual({ works: [], directors: [], actors: [] });
  });

  it("빈 query (grouped=1): { works: [], directors: [], actors: [] }, fetch 호출 없음", async () => {
    const { GET } = await import("../route");
    const res = await GET(makeReq("q=&grouped=1"));
    const body = await res.json();
    expect(body).toEqual({ works: [], directors: [], actors: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("knownFor: top 3 cap + title/name 폴백 + year 폴백", async () => {
    fetchMock.mockResolvedValueOnce(
      buildTmdbResponse([
        {
          id: 301,
          name: "봉준호",
          media_type: "person",
          profile_path: "/bong.jpg",
          known_for_department: "Directing",
          known_for: [
            // movie: title + release_date
            { id: 1, media_type: "movie", title: "기생충", release_date: "2019-05-30" },
            // tv: name + first_air_date (title/release_date 없음 — name/first_air_date 폴백 검증)
            { id: 2, media_type: "tv", name: "Some Series", first_air_date: "2017-04-01" },
            // 3번째: 연도/제목 모두 없는 케이스 (빈 문자열로 graceful)
            { id: 3, media_type: "movie" },
            // 4번째 — top 3 cap 검증용
            { id: 4, media_type: "movie", title: "잘림", release_date: "2010-01-01" },
          ],
        },
      ]),
    );

    const { GET } = await import("../route");
    const res = await GET(makeReq("q=봉준호&grouped=1"));
    const body = await res.json();

    expect(body.directors).toHaveLength(1);
    const kf = body.directors[0].knownFor;
    expect(kf).toHaveLength(3); // top 3 cap
    expect(kf[0]).toEqual({ title: "기생충", year: "2019" });
    expect(kf[1]).toEqual({ title: "Some Series", year: "2017" });
    expect(kf[2]).toEqual({ title: "", year: "" });
  });

  it("profileUrl null 처리: profile_path 가 null 인 경우", async () => {
    fetchMock.mockResolvedValueOnce(
      buildTmdbResponse([
        {
          id: 401,
          name: "익명배우",
          media_type: "person",
          profile_path: null,
          known_for_department: "Acting",
          known_for: [],
        },
      ]),
    );

    const { GET } = await import("../route");
    const res = await GET(makeReq("q=익명&grouped=1"));
    const body = await res.json();

    expect(body.actors).toHaveLength(1);
    expect(body.actors[0].profileUrl).toBeNull();
    expect(body.actors[0].knownFor).toEqual([]);
  });
});

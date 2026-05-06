/**
 * /api/tmdb/related route 단위 테스트
 *
 * 검증 범위:
 *  1) work_id 누락 → 400
 *  2) collection + director 모두 있는 정상 케이스 → 응답 매핑 (year, posterUrl, mediaType)
 *  3) collection 없는 영화 (belongs_to_collection null) → collection: null + directorWorks 채워짐
 *  4) director credits 빈 결과 → directorWorks: [] + collection 만 반환
 *  5) 자기 자신 제외 (collection.parts/director.crew 둘 다 work_id 동일 항목 제거)
 *  6) directorWorks popularity desc 정렬 + top 12 컷
 *  7) collection 과 directorWorks 중복 제거 (동일 작품 양쪽 등장 시 directorWorks 에서 제거)
 *  8) series(type=series) → /tv/{id} + person tv_credits 사용. collection 항상 null
 *  9) TMDB 4xx/5xx 모두 graceful → 빈 응답 (200) 반환
 *  10) 사용자 직접 테스트 #4 — recommendations 필드 매핑 + popularity desc + top 8 컷
 *  11) recommendations 가 collection/directorWorks 와 dedup (양쪽 등장 작품 제거)
 *
 * 모킹 패턴은 /api/search route 테스트와 동일 — fetchMock + vi.resetModules.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

function makeReq(qs: string): NextRequest {
  return new NextRequest(`https://example.com/api/tmdb/related?${qs}`);
}

interface PartRaw {
  id: number;
  title?: string;
  name?: string;
  poster_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  popularity?: number;
}

interface CrewMemberRaw {
  id: number;
  name?: string;
  title?: string;
  job?: string;
  department?: string;
  poster_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  popularity?: number;
}

function mockOk(json: unknown): Response {
  return { ok: true, json: async () => json } as unknown as Response;
}

function mockFail(status = 500): Response {
  return { ok: false, status, json: async () => ({}) } as unknown as Response;
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

describe("GET /api/tmdb/related", () => {
  it("work_id 누락 → 400", async () => {
    const { GET } = await import("../route");
    const res = await GET(makeReq("type=movie"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/work_id/);
  });

  it("collection + director 정상 매핑 (year/posterUrl/mediaType)", async () => {
    // 호출 순서:
    //  seeds → /movie/120 (detail), /movie/120/credits 병렬
    //  → /collection/119, /person/578/movie_credits 병렬
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/movie/120?")) {
        return mockOk({
          id: 120,
          belongs_to_collection: { id: 119, name: "반지의 제왕 컬렉션" },
        });
      }
      if (url.includes("/movie/120/credits")) {
        return mockOk({
          crew: [{ id: 578, name: "Peter Jackson", job: "Director", department: "Directing" }],
        });
      }
      if (url.includes("/collection/119")) {
        return mockOk({
          id: 119,
          name: "반지의 제왕 컬렉션",
          parts: [
            { id: 120, title: "반지원정대", poster_path: "/p1.jpg", release_date: "2001-12-19" },
            { id: 121, title: "두 개의 탑", poster_path: "/p2.jpg", release_date: "2002-12-18" },
            { id: 122, title: "왕의 귀환", poster_path: "/p3.jpg", release_date: "2003-12-17" },
          ] as PartRaw[],
        });
      }
      if (url.includes("/person/578/movie_credits")) {
        return mockOk({
          cast: [],
          crew: [
            { id: 120, title: "반지원정대", job: "Director", popularity: 80, release_date: "2001-12-19" },
            { id: 999, title: "킹콩", job: "Director", popularity: 50, release_date: "2005-12-14", poster_path: "/k.jpg" },
            { id: 1001, title: "호빗", job: "Director", popularity: 70, release_date: "2012-12-14", poster_path: "/h.jpg" },
          ] as CrewMemberRaw[],
        });
      }
      return mockFail(404);
    });

    const { GET } = await import("../route");
    const res = await GET(makeReq("work_id=120&type=movie"));
    expect(res.status).toBe(200);
    const body = await res.json();

    // collection — 자기 자신(120) 제외하고 2건
    expect(body.collection).not.toBeNull();
    expect(body.collection.id).toBe(119);
    expect(body.collection.name).toBe("반지의 제왕 컬렉션");
    expect(body.collection.works).toHaveLength(2);
    expect(body.collection.works[0]).toMatchObject({
      id: 121,
      title: "두 개의 탑",
      year: "2002",
      mediaType: "movie",
    });
    // posterUrl 은 w185 사이즈
    expect(body.collection.works[0].posterUrl).toContain("w185");
    expect(body.collection.works[0].posterUrl).toContain("/p2.jpg");

    // directorWorks — 자기(120) 제외 + collection 의 다른 작품(2건)도 제외 → 호빗(70) → 킹콩(50)
    expect(body.directorWorks).toHaveLength(2);
    expect(body.directorWorks[0]).toMatchObject({ id: 1001, title: "호빗", year: "2012" });
    expect(body.directorWorks[1]).toMatchObject({ id: 999, title: "킹콩", year: "2005" });
    expect(body.directorName).toBe("Peter Jackson");
  });

  it("collection 없는 영화: collection=null + directorWorks 만", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/movie/500?")) {
        return mockOk({ id: 500, belongs_to_collection: null });
      }
      if (url.includes("/movie/500/credits")) {
        return mockOk({
          crew: [{ id: 800, name: "박찬욱", job: "Director" }],
        });
      }
      if (url.includes("/person/800/movie_credits")) {
        return mockOk({
          cast: [],
          crew: [
            { id: 700, title: "올드보이", job: "Director", popularity: 100, release_date: "2003-11-21" },
            { id: 500, title: "헤어질 결심", job: "Director", popularity: 90 },
          ] as CrewMemberRaw[],
        });
      }
      return mockFail(404);
    });

    const { GET } = await import("../route");
    const res = await GET(makeReq("work_id=500&type=movie"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.collection).toBeNull();
    expect(body.directorWorks).toHaveLength(1);
    expect(body.directorWorks[0]).toMatchObject({ id: 700, title: "올드보이", year: "2003" });
    expect(body.directorName).toBe("박찬욱");
  });

  it("director credits 빈 결과: directorWorks=[]", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/movie/300?")) {
        return mockOk({ id: 300, belongs_to_collection: null });
      }
      if (url.includes("/movie/300/credits")) {
        return mockOk({ crew: [] });
      }
      return mockFail(404);
    });

    const { GET } = await import("../route");
    const res = await GET(makeReq("work_id=300&type=movie"));
    const body = await res.json();
    expect(body.collection).toBeNull();
    expect(body.directorWorks).toEqual([]);
    expect(body.directorName).toBeNull();
  });

  it("directorWorks 12개 컷 + popularity desc 정렬", async () => {
    const crew: CrewMemberRaw[] = Array.from({ length: 20 }, (_, i) => ({
      id: 1000 + i,
      title: `작품${i}`,
      job: "Director",
      popularity: i, // 0~19
      release_date: "2020-01-01",
    }));

    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/movie/1?")) {
        return mockOk({ id: 1, belongs_to_collection: null });
      }
      if (url.includes("/movie/1/credits")) {
        return mockOk({ crew: [{ id: 5000, name: "Director X", job: "Director" }] });
      }
      if (url.includes("/person/5000/movie_credits")) {
        return mockOk({ cast: [], crew });
      }
      return mockFail(404);
    });

    const { GET } = await import("../route");
    const res = await GET(makeReq("work_id=1&type=movie"));
    const body = await res.json();
    expect(body.directorWorks).toHaveLength(12);
    // 가장 인기 높은 popularity=19 → id=1019 부터
    expect(body.directorWorks[0].id).toBe(1019);
    expect(body.directorWorks[11].id).toBe(1008);
  });

  it("series(type=series): collection 항상 null, /tv/{id} + tv_credits 사용", async () => {
    let calledTvCredits = false;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/tv/77?")) {
        return mockOk({ id: 77 }); // tv 는 belongs_to_collection 없음
      }
      if (url.includes("/tv/77/credits")) {
        return mockOk({
          crew: [{ id: 900, name: "Showrunner", job: "Director" }],
        });
      }
      if (url.includes("/person/900/tv_credits")) {
        calledTvCredits = true;
        return mockOk({
          cast: [],
          crew: [
            { id: 880, name: "다른시리즈", job: "Director", popularity: 60, first_air_date: "2019-03-01" },
          ] as CrewMemberRaw[],
        });
      }
      return mockFail(404);
    });

    const { GET } = await import("../route");
    const res = await GET(makeReq("work_id=77&type=series"));
    const body = await res.json();
    expect(body.collection).toBeNull();
    expect(calledTvCredits).toBe(true);
    expect(body.directorWorks).toHaveLength(1);
    expect(body.directorWorks[0]).toMatchObject({ id: 880, year: "2019", mediaType: "tv" });
  });

  it("TMDB 5xx graceful: 빈 응답(200)", async () => {
    fetchMock.mockResolvedValue(mockFail(500));

    const { GET } = await import("../route");
    const res = await GET(makeReq("work_id=999&type=movie"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      collection: null,
      recommendations: [],
      directorWorks: [],
      directorName: null,
    });
  });

  it("사용자 직접 테스트 #4 — recommendations 매핑 + popularity desc + top 8 컷", async () => {
    // collection 없는 영화에 recommendations 만 가득 → 8개 컷 + popularity 내림차순
    const recs = Array.from({ length: 15 }, (_, i) => ({
      id: 5000 + i,
      title: `비슷한작품${i}`,
      poster_path: `/r${i}.jpg`,
      release_date: "2018-01-01",
      popularity: i, // 0~14
    }));

    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/movie/2000?")) {
        return mockOk({ id: 2000, belongs_to_collection: null });
      }
      if (url.includes("/movie/2000/credits")) {
        return mockOk({ crew: [] }); // 감독 없음 → directorWorks 비움
      }
      if (url.includes("/movie/2000/recommendations")) {
        return mockOk({ results: recs });
      }
      return mockFail(404);
    });

    const { GET } = await import("../route");
    const res = await GET(makeReq("work_id=2000&type=movie"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.collection).toBeNull();
    expect(body.directorWorks).toEqual([]);
    expect(body.recommendations).toHaveLength(8);
    // 가장 인기 높은 popularity=14 → id=5014
    expect(body.recommendations[0]).toMatchObject({
      id: 5014,
      title: "비슷한작품14",
      year: "2018",
      mediaType: "movie",
    });
    expect(body.recommendations[0].posterUrl).toContain("w185");
    expect(body.recommendations[0].posterUrl).toContain("/r14.jpg");
    // 마지막 (8번째) — popularity=7
    expect(body.recommendations[7].id).toBe(5007);
  });

  it("recommendations 가 collection/directorWorks 와 중복 제거", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/movie/3000?")) {
        return mockOk({
          id: 3000,
          belongs_to_collection: { id: 2999, name: "테스트 시리즈" },
        });
      }
      if (url.includes("/movie/3000/credits")) {
        return mockOk({
          crew: [{ id: 8888, name: "감독X", job: "Director" }],
        });
      }
      if (url.includes("/collection/2999")) {
        return mockOk({
          id: 2999,
          name: "테스트 시리즈",
          parts: [
            { id: 3000, title: "본편", release_date: "2010-01-01" },
            { id: 3001, title: "후속편", release_date: "2012-01-01", poster_path: "/x.jpg" },
          ] as PartRaw[],
        });
      }
      if (url.includes("/person/8888/movie_credits")) {
        return mockOk({
          cast: [],
          crew: [
            { id: 4000, title: "감독다른작품", job: "Director", popularity: 50 },
          ] as CrewMemberRaw[],
        });
      }
      if (url.includes("/movie/3000/recommendations")) {
        return mockOk({
          results: [
            { id: 3001, title: "후속편(중복)", popularity: 100 }, // collection 중복 → 제거
            { id: 4000, title: "감독다른작품(중복)", popularity: 90 }, // directorWorks 중복 → 제거
            { id: 5555, title: "유니크추천", popularity: 80, poster_path: "/u.jpg", release_date: "2020-05-05" },
            { id: 3000, title: "자기자신(중복)", popularity: 70 }, // 자기 자신 → 제거
          ],
        });
      }
      return mockFail(404);
    });

    const { GET } = await import("../route");
    const res = await GET(makeReq("work_id=3000&type=movie"));
    const body = await res.json();

    expect(body.collection).not.toBeNull();
    expect(body.collection.works).toHaveLength(1);
    expect(body.collection.works[0].id).toBe(3001);
    expect(body.directorWorks).toHaveLength(1);
    expect(body.directorWorks[0].id).toBe(4000);
    // recommendations — 자기 자신/collection/directorWorks 모두 dedup → 유니크만 남음
    expect(body.recommendations).toHaveLength(1);
    expect(body.recommendations[0]).toMatchObject({
      id: 5555,
      title: "유니크추천",
      year: "2020",
    });
  });

  it("series(type=series) recommendations: tv mediaType 으로 매핑", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/tv/600?")) {
        return mockOk({ id: 600 });
      }
      if (url.includes("/tv/600/credits")) {
        return mockOk({ crew: [] });
      }
      if (url.includes("/tv/600/recommendations")) {
        return mockOk({
          results: [
            { id: 6001, name: "비슷한시리즈", popularity: 30, first_air_date: "2021-09-01", poster_path: "/s.jpg" },
          ],
        });
      }
      return mockFail(404);
    });

    const { GET } = await import("../route");
    const res = await GET(makeReq("work_id=600&type=series"));
    const body = await res.json();

    expect(body.collection).toBeNull();
    expect(body.recommendations).toHaveLength(1);
    expect(body.recommendations[0]).toMatchObject({
      id: 6001,
      title: "비슷한시리즈",
      year: "2021",
      mediaType: "tv",
    });
  });

  it("collection 있고 director 없음 (TV 시리즈 직접 detail 의 director 미지정 등)", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/movie/200?")) {
        return mockOk({ id: 200, belongs_to_collection: { id: 199, name: "테스트 컬렉션" } });
      }
      if (url.includes("/movie/200/credits")) {
        return mockOk({ crew: [] }); // 감독 없음
      }
      if (url.includes("/collection/199")) {
        return mockOk({
          id: 199,
          name: "테스트 컬렉션",
          parts: [
            { id: 200, title: "본편", release_date: "2010-01-01" },
            { id: 201, title: "후속편", release_date: "2012-01-01", poster_path: "/x.jpg" },
          ] as PartRaw[],
        });
      }
      return mockFail(404);
    });

    const { GET } = await import("../route");
    const res = await GET(makeReq("work_id=200&type=movie"));
    const body = await res.json();
    expect(body.collection).not.toBeNull();
    expect(body.collection.works).toHaveLength(1);
    expect(body.collection.works[0]).toMatchObject({ id: 201, year: "2012" });
    expect(body.directorWorks).toEqual([]);
    expect(body.directorName).toBeNull();
  });
});

/**
 * store.ts persona 관련 기능 테스트
 *
 * _migrated 모듈 변수가 테스트 간 상태를 공유하므로,
 * 각 테스트에서 vi.resetModules() + 동적 import 로 격리한다.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Recommendation } from "../types";

// 매 테스트마다 모듈을 새로 로드하기 위한 헬퍼
async function loadStore() {
  const mod = await import("../store");
  return mod;
}

// crypto.randomUUID 모킹 — 예측 가능한 ID 생성
let uuidCounter = 0;
vi.stubGlobal("crypto", {
  ...globalThis.crypto,
  randomUUID: () => {
    uuidCounter++;
    return `00000000-0000-0000-0000-${String(uuidCounter).padStart(12, "0")}`;
  },
});

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  uuidCounter = 0;
  vi.resetModules();
});

// ─── 1. Migration v1 → v2 ───

describe("Migration v1 → v2", () => {
  it("v1 데이터를 default persona 로 마이그레이션한다", async () => {
    // v1 데이터 세팅
    localStorage.setItem("neq_favorites", JSON.stringify(["기생충", "올드보이", "살인의 추억"]));
    localStorage.setItem("neq_favorites_meta", JSON.stringify([
      { id: 1, title: "기생충", posterUrl: null },
    ]));
    localStorage.setItem("neq_watch_reports", JSON.stringify([
      { tmdbId: 100, reaction: "loved", reportedAt: 1000 },
    ]));
    localStorage.setItem("neq_seen_titles", JSON.stringify(["제목A", "제목B"]));
    localStorage.setItem("neq_recommendations", JSON.stringify([
      { title: "추천1", tmdbId: 200 },
    ]));

    const store = await loadStore();
    store.migrateToPersonaV2();

    // default persona 가 생성되었는지
    const personas = store.getPersonas();
    expect(personas).toHaveLength(1);
    expect(personas[0].id).toBe("default");
    expect(personas[0].name).toBe("기본");
    expect(personas[0].favorites).toEqual(["기생충", "올드보이", "살인의 추억"]);
    expect(personas[0].favoritesMeta).toEqual([
      { id: 1, title: "기생충", posterUrl: null },
    ]);
    expect(personas[0].watchReports).toEqual([
      { tmdbId: 100, reaction: "loved", reportedAt: 1000 },
    ]);
    expect(personas[0].seenTitles).toEqual(["제목A", "제목B"]);
    expect(personas[0].recCache).toEqual([{ title: "추천1", tmdbId: 200 }]);

    // 레거시 키 삭제 확인
    expect(localStorage.getItem("neq_favorites")).toBeNull();
    expect(localStorage.getItem("neq_favorites_meta")).toBeNull();
    expect(localStorage.getItem("neq_watch_reports")).toBeNull();
    expect(localStorage.getItem("neq_seen_titles")).toBeNull();
    expect(localStorage.getItem("neq_recommendations")).toBeNull();

    // migration version
    expect(JSON.parse(localStorage.getItem("neq_migration_version")!)).toBe(2);
  });

  it("필터된 추천 캐시도 마이그레이션한다", async () => {
    localStorage.setItem("neq_recs_movie_netflix", JSON.stringify([
      { title: "영화1", tmdbId: 300 },
    ]));

    const store = await loadStore();
    store.migrateToPersonaV2();

    const personas = store.getPersonas();
    expect(personas[0].recFilteredCache["neq_recs_movie_netflix"]).toEqual([
      { title: "영화1", tmdbId: 300 },
    ]);
    expect(localStorage.getItem("neq_recs_movie_netflix")).toBeNull();
  });
});

// ─── 2. Migration 멱등성 ───

describe("Migration 멱등성", () => {
  it("두 번 실행해도 데이터가 중복되지 않는다", async () => {
    localStorage.setItem("neq_favorites", JSON.stringify(["기생충"]));

    const store = await loadStore();
    store.migrateToPersonaV2();

    // 첫 번째 실행 후 상태 기록
    const personasAfterFirst = store.getPersonas();
    expect(personasAfterFirst).toHaveLength(1);

    // _migrated = true 이므로 두 번째 호출은 no-op
    store.migrateToPersonaV2();

    const personasAfterSecond = store.getPersonas();
    expect(personasAfterSecond).toHaveLength(1);
    expect(personasAfterSecond[0].favorites).toEqual(["기생충"]);
  });

  it("이미 v2인 경우 마이그레이션을 건너뛴다", async () => {
    // 이미 v2 마이그레이션 완료 상태 세팅
    const existingPersona = {
      id: "default",
      name: "기본",
      favorites: ["기생충"],
      favoritesMeta: [],
      watchReports: [],
      seenTitles: [],
      recCache: [],
      recFilteredCache: {},
    };
    localStorage.setItem("neq_personas", JSON.stringify([existingPersona]));
    localStorage.setItem("neq_active_persona_id", JSON.stringify("default"));
    localStorage.setItem("neq_migration_version", JSON.stringify(2));

    const store = await loadStore();
    store.migrateToPersonaV2();

    const personas = store.getPersonas();
    expect(personas).toHaveLength(1);
    expect(personas[0].favorites).toEqual(["기생충"]);
  });
});

// ─── 3. 빈 상태에서의 마이그레이션 ───

describe("빈 상태에서 마이그레이션", () => {
  it("v1 데이터 없이도 빈 default persona 를 생성한다", async () => {
    const store = await loadStore();
    store.migrateToPersonaV2();

    const personas = store.getPersonas();
    expect(personas).toHaveLength(1);
    expect(personas[0].id).toBe("default");
    expect(personas[0].favorites).toEqual([]);
    expect(personas[0].watchReports).toEqual([]);
    expect(personas[0].seenTitles).toEqual([]);
  });
});

// ─── 4. Persona CRUD ───

describe("Persona CRUD", () => {
  it("createPersona 로 새 페르소나를 생성한다", async () => {
    const store = await loadStore();
    store.migrateToPersonaV2();

    const meta = [
      { id: 1, title: "나혼자산다", posterUrl: null },
      { id: 2, title: "놀면뭐하니", posterUrl: null },
      { id: 3, title: "유퀴즈", posterUrl: null },
    ];
    const id = store.createPersona("예능", ["나혼자산다", "놀면뭐하니", "유퀴즈"], meta);

    expect(id).not.toBeNull();
    expect(typeof id).toBe("string");

    const personas = store.getPersonas();
    expect(personas).toHaveLength(2);
    expect(personas[1].name).toBe("예능");
    expect(personas[1].favorites).toEqual(["나혼자산다", "놀면뭐하니", "유퀴즈"]);
    expect(personas[1].favoritesMeta).toEqual(meta);
  });

  it("최대 3개 제한: 4번째 생성 시 null 반환", async () => {
    const store = await loadStore();
    store.migrateToPersonaV2();

    // default(1) + 2개 더 생성
    const id2 = store.createPersona("예능", ["a", "b", "c"], []);
    const id3 = store.createPersona("드라마", ["d", "e", "f"], []);
    expect(id2).not.toBeNull();
    expect(id3).not.toBeNull();

    // 4번째 — MAX_PERSONAS(3) 초과
    const id4 = store.createPersona("공포", ["g", "h", "i"], []);
    expect(id4).toBeNull();

    expect(store.getPersonas()).toHaveLength(3);
  });
});

// ─── 5. switchPersona ───

describe("switchPersona", () => {
  it("페르소나 전환 시 getFavorites 가 해당 페르소나 데이터를 반환한다", async () => {
    const store = await loadStore();
    store.migrateToPersonaV2();
    store.setFavorites(["기생충", "올드보이", "살인의 추억"]);

    const secondId = store.createPersona("예능", ["나혼자산다", "놀면뭐하니", "유퀴즈"], []);
    expect(secondId).not.toBeNull();

    // default persona
    expect(store.getFavorites()).toEqual(["기생충", "올드보이", "살인의 추억"]);

    // 전환
    store.switchPersona(secondId!);
    expect(store.getFavorites()).toEqual(["나혼자산다", "놀면뭐하니", "유퀴즈"]);

    // 다시 기본으로
    store.switchPersona("default");
    expect(store.getFavorites()).toEqual(["기생충", "올드보이", "살인의 추억"]);
  });

  it("존재하지 않는 persona id 로 전환 시 무시된다", async () => {
    const store = await loadStore();
    store.migrateToPersonaV2();

    store.switchPersona("nonexistent");
    expect(store.getActivePersonaId()).toBe("default");
  });
});

// ─── 6. deletePersona ───

describe("deletePersona", () => {
  it("비기본 페르소나를 삭제한다", async () => {
    const store = await loadStore();
    store.migrateToPersonaV2();

    const id = store.createPersona("예능", ["a", "b", "c"], []);
    expect(store.getPersonas()).toHaveLength(2);

    store.deletePersona(id!);
    expect(store.getPersonas()).toHaveLength(1);
    expect(store.getPersonas()[0].id).toBe("default");
  });

  it("활성 페르소나 삭제 시 기본으로 폴백한다", async () => {
    const store = await loadStore();
    store.migrateToPersonaV2();

    const id = store.createPersona("예능", ["a", "b", "c"], []);
    store.switchPersona(id!);
    expect(store.getActivePersonaId()).toBe(id);

    store.deletePersona(id!);
    expect(store.getActivePersonaId()).toBe("default");
  });

  it("마지막 페르소나를 삭제하면 새 기본 페르소나가 생성된다", async () => {
    const store = await loadStore();
    store.migrateToPersonaV2();

    // default 하나만 있는 상태에서 삭제
    store.deletePersona("default");

    const personas = store.getPersonas();
    expect(personas).toHaveLength(1);
    expect(personas[0].id).toBe("default");
    expect(personas[0].name).toBe("기본");
    expect(personas[0].favorites).toEqual([]);
  });
});

// ─── 7. 페르소나별 데이터 격리 ───

describe("페르소나별 데이터 격리", () => {
  it("watchReport 가 페르소나별로 격리된다", async () => {
    const store = await loadStore();
    store.migrateToPersonaV2();

    const personaBId = store.createPersona("예능", ["a", "b", "c"], []);
    expect(personaBId).not.toBeNull();

    // persona A(default) 에 리포트 추가
    store.addWatchReport(123, "loved");
    expect(store.getWatchReports()).toHaveLength(1);
    expect(store.getWatchReports()[0].tmdbId).toBe(123);

    // persona B 로 전환 — 빈 상태
    store.switchPersona(personaBId!);
    expect(store.getWatchReports()).toHaveLength(0);

    // persona A 로 복귀 — 리포트 유지
    store.switchPersona("default");
    expect(store.getWatchReports()).toHaveLength(1);
    expect(store.getWatchReports()[0].tmdbId).toBe(123);
  });

  it("seenTitles 가 페르소나별로 격리된다", async () => {
    const store = await loadStore();
    store.migrateToPersonaV2();

    const personaBId = store.createPersona("예능", ["a", "b", "c"], []);

    store.addSeenTitles(["제목1", "제목2"]);
    expect(store.getSeenTitles()).toEqual(["제목1", "제목2"]);

    store.switchPersona(personaBId!);
    expect(store.getSeenTitles()).toEqual([]);

    store.switchPersona("default");
    expect(store.getSeenTitles()).toEqual(["제목1", "제목2"]);
  });

  it("recommendations 가 페르소나별로 격리된다", async () => {
    const store = await loadStore();
    store.migrateToPersonaV2();

    const personaBId = store.createPersona("예능", ["a", "b", "c"], []);

    const recs = [{ title: "추천1", tmdbId: 200 }] as unknown as Recommendation[];
    store.setRecommendations(recs);
    expect(store.getRecommendations()).toEqual(recs);

    store.switchPersona(personaBId!);
    expect(store.getRecommendations()).toEqual([]);

    store.switchPersona("default");
    expect(store.getRecommendations()).toEqual(recs);
  });
});

// ─── 8. 글로벌 데이터 유지 ───

describe("글로벌 데이터 유지", () => {
  it("saved 는 페르소나 전환과 무관하게 유지된다", async () => {
    const store = await loadStore();
    store.migrateToPersonaV2();

    const personaBId = store.createPersona("예능", ["a", "b", "c"], []);

    const rec = {
      title: "기생충",
      titleEn: "Parasite",
      type: "movie" as const,
      tmdbId: 496243,
      overview: "test",
      posterUrl: null,
      rating: 8.5,
      date: "2019-05-30",
      reason: "test",
      providers: [],
      watchLink: null,
      director: null,
      cast: [],
      runtime: 132,
      seasons: null,
      country: ["KR"],
      backdrop: null,
    };
    store.addSaved(rec);
    expect(store.getSaved()).toHaveLength(1);

    // persona B 로 전환해도 saved 유지
    store.switchPersona(personaBId!);
    expect(store.getSaved()).toHaveLength(1);
    expect(store.getSaved()[0].recommendation.tmdbId).toBe(496243);
  });

  it("archived 는 페르소나 전환과 무관하게 유지된다", async () => {
    const store = await loadStore();
    store.migrateToPersonaV2();

    const personaBId = store.createPersona("예능", ["a", "b", "c"], []);

    store.archiveItem(999);
    expect(store.getArchivedIds()).toContain(999);

    store.switchPersona(personaBId!);
    expect(store.getArchivedIds()).toContain(999);
  });
});

// ─── 9. Export / Import v2 ───

describe("Export / Import", () => {
  it("exportUserData 에 personas 배열이 포함된다", async () => {
    const store = await loadStore();
    store.migrateToPersonaV2();
    store.setFavorites(["기생충", "올드보이", "살인의 추억"]);
    store.createPersona("예능", ["나혼자산다"], []);

    const exported = store.exportUserData();
    expect(exported.version).toBe(2);
    expect(exported.data.personas).toHaveLength(2);
    expect(exported.data.activePersonaId).toBe("default");
    expect(exported.data.personas![0].favorites).toEqual(["기생충", "올드보이", "살인의 추억"]);
  });

  it("v2 데이터 import 시 personas 가 복원된다", async () => {
    const store = await loadStore();
    store.migrateToPersonaV2();

    const v2Data = {
      version: 2,
      deviceId: "test-device",
      exportedAt: Date.now(),
      data: {
        favorites: [],
        saved: [],
        watchReports: [],
        seenTitles: [],
        archived: [111],
        personas: [
          {
            id: "default",
            name: "기본",
            favorites: ["수리남"],
            favoritesMeta: [],
            watchReports: [{ tmdbId: 50, reaction: "good", reportedAt: 2000 }],
            seenTitles: ["제목X"],
            recCache: [],
            recFilteredCache: {},
          },
          {
            id: "abc",
            name: "공포",
            favorites: ["곤지암", "장산범", "여고괴담"],
            favoritesMeta: [],
            watchReports: [],
            seenTitles: [],
            recCache: [],
            recFilteredCache: {},
          },
        ],
        activePersonaId: "abc",
      },
    };

    const result = store.importUserData(v2Data);
    expect(result.ok).toBe(true);
    expect(result.counts?.favorites).toBe(4); // 1 + 3
    expect(result.counts?.watchReports).toBe(1);
    expect(result.counts?.archived).toBe(1);

    const personas = store.getPersonas();
    expect(personas).toHaveLength(2);
    expect(store.getActivePersonaId()).toBe("abc");
  });

  it("v1 데이터 import 시 자동으로 default persona 로 변환된다", async () => {
    const store = await loadStore();
    store.migrateToPersonaV2();

    const v1Data = {
      version: 1,
      deviceId: "old-device",
      exportedAt: Date.now(),
      data: {
        favorites: ["기생충", "올드보이", "살인의 추억"],
        saved: [],
        watchReports: [{ tmdbId: 10, reaction: "loved", reportedAt: 500 }],
        seenTitles: ["A", "B"],
        archived: [],
      },
    };

    const result = store.importUserData(v1Data);
    expect(result.ok).toBe(true);
    expect(result.counts?.favorites).toBe(3);
    expect(result.counts?.watchReports).toBe(1);

    const personas = store.getPersonas();
    expect(personas).toHaveLength(1);
    expect(personas[0].id).toBe("default");
    expect(personas[0].favorites).toEqual(["기생충", "올드보이", "살인의 추억"]);
    expect(personas[0].watchReports).toHaveLength(1);
  });

  it("잘못된 형식의 데이터 import 시 에러를 반환한다", async () => {
    const store = await loadStore();
    store.migrateToPersonaV2();

    expect(store.importUserData(null).ok).toBe(false);
    expect(store.importUserData("string").ok).toBe(false);
    expect(store.importUserData({ version: 999, data: {} }).ok).toBe(false);
    expect(store.importUserData({ noVersion: true }).ok).toBe(false);
  });
});

// ─── 10. hasOnboarded ───

describe("hasOnboarded", () => {
  it("페르소나가 없으면 false", async () => {
    // migration 전에는 빈 persona 가 생성되므로 favorites=[] → false
    const store = await loadStore();
    expect(store.hasOnboarded()).toBe(false);
  });

  it("favorite 2개면 false", async () => {
    const store = await loadStore();
    store.migrateToPersonaV2();
    store.setFavorites(["기생충", "올드보이"]);
    expect(store.hasOnboarded()).toBe(false);
  });

  it("favorite 3개 이상이면 true", async () => {
    const store = await loadStore();
    store.migrateToPersonaV2();
    store.setFavorites(["기생충", "올드보이", "살인의 추억"]);
    expect(store.hasOnboarded()).toBe(true);
  });

  it("어떤 페르소나든 3개 이상이면 true", async () => {
    const store = await loadStore();
    store.migrateToPersonaV2();
    // default 는 비어있지만 두 번째 페르소나에 3개
    store.createPersona("예능", ["나혼자산다", "놀면뭐하니", "유퀴즈"], []);
    expect(store.hasOnboarded()).toBe(true);
  });
});

// ─── 추가: clearAllUserData ───

describe("clearAllUserData", () => {
  it("모든 데이터를 초기화하고 재마이그레이션이 가능하다", async () => {
    const store = await loadStore();
    store.migrateToPersonaV2();
    store.setFavorites(["기생충"]);
    store.addSaved({
      title: "test",
      tmdbId: 1,
      overview: "",
      posterUrl: null,
      rating: 0,
      year: "",
      genres: [],
      providers: [],
      mediaType: "movie",
      reason: "",
    } as unknown as Recommendation);

    store.clearAllUserData();

    // localStorage 키 삭제 확인
    expect(localStorage.getItem("neq_personas")).toBeNull();
    expect(localStorage.getItem("neq_saved")).toBeNull();
    expect(localStorage.getItem("neq_migration_version")).toBeNull();
  });

  it("설문 진행 상태도 함께 정리한다 (resume_modal 오트리거 차단)", async () => {
    const store = await loadStore();
    store.migrateToPersonaV2();
    sessionStorage.setItem(
      "neq_taste_survey_progress:movie-alone",
      JSON.stringify({
        context: { contentType: "movie", companion: "alone" },
        prevAnswers: [{ question: "q", selectedOption: "a" }],
        step: 1,
      }),
    );
    sessionStorage.setItem(
      "neq_taste_survey_progress:series-together",
      JSON.stringify({
        context: { contentType: "series", companion: "together" },
        prevAnswers: [],
        step: 1,
      }),
    );

    store.clearAllUserData();

    expect(
      sessionStorage.getItem("neq_taste_survey_progress:movie-alone"),
    ).toBeNull();
    expect(
      sessionStorage.getItem("neq_taste_survey_progress:series-together"),
    ).toBeNull();
  });
});

// ─── 추가: getWatchStats ───

describe("getWatchStats", () => {
  it("리액션별 통계를 정확히 계산한다", async () => {
    const store = await loadStore();
    store.migrateToPersonaV2();

    store.addWatchReport(1, "loved");
    store.addWatchReport(2, "loved");
    store.addWatchReport(3, "good");
    store.addWatchReport(4, "meh");
    store.addWatchReport(5, "dropped");

    const stats = store.getWatchStats();
    expect(stats.total).toBe(5);
    expect(stats.loved).toBe(2);
    expect(stats.good).toBe(1);
    expect(stats.meh).toBe(1);
    expect(stats.dropped).toBe(1);
  });
});

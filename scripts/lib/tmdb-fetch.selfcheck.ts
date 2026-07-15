/**
 * extractRelatedSeeds 자체 검증 — `npx tsx scripts/lib/tmdb-fetch.selfcheck.ts`
 * (P1 related 미러 보강. movie-only collection 분기 + director job/department fallback 회귀 감지)
 */
import { strict as assert } from "node:assert";
import { extractRelatedSeeds } from "./tmdb-fetch";

// movie: collection + director(job=Director)
assert.deepEqual(
  extractRelatedSeeds(
    { media_type: "movie" },
    { belongs_to_collection: { id: 119 } },
    { crew: [{ id: 578, job: "Director" }] },
  ),
  { collection_id: 119, director_tmdb_id: 578 },
);

// tv: collection 무시(항상 null) + department=Directing fallback
assert.deepEqual(
  extractRelatedSeeds(
    { media_type: "tv" },
    { belongs_to_collection: { id: 999 } },
    { crew: [{ id: 42, department: "Directing" }] },
  ),
  { collection_id: null, director_tmdb_id: 42 },
);

// 감독 미상 + collection 없음 → 둘 다 null (TV 정상 케이스)
assert.deepEqual(
  extractRelatedSeeds({ media_type: "movie" }, { belongs_to_collection: null }, { crew: [] }),
  { collection_id: null, director_tmdb_id: null },
);

// job=Director 가 department 보다 우선 (첫 Director 매칭)
assert.deepEqual(
  extractRelatedSeeds(
    { media_type: "movie" },
    {},
    { crew: [{ id: 1, department: "Directing" }, { id: 2, job: "Director" }] },
  ),
  { collection_id: null, director_tmdb_id: 2 },
);

console.log("extractRelatedSeeds selfcheck OK");

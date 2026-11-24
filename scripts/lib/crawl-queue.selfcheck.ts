import { strict as assert } from "node:assert";
import { selectQueueForGuard } from "./crawl-queue";

const rows = [
  { tmdb_id: 1, media_type: "movie" as const, failed_count: 0 },
  { tmdb_id: 2, media_type: "tv" as const, failed_count: 0 },
];
const existing = new Set(["tv:2"]);

assert.deepEqual(selectQueueForGuard(rows, existing, "halt"), []);
assert.deepEqual(selectQueueForGuard(rows, existing, "refreshOnly"), [rows[1]]);
assert.deepEqual(selectQueueForGuard(rows, existing, "ok"), [rows[1], rows[0]]);
console.log("crawl-queue selfcheck passed");

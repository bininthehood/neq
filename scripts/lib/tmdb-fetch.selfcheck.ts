import { strict as assert } from "node:assert";
import { RateLimiter, TmdbNotFoundError, tmdbGet } from "./tmdb-fetch";

let calls = 0;
globalThis.fetch = (async () => {
  calls++;
  return new Response("{}", { status: 404 });
}) as typeof fetch;

void (async () => {
  await assert.rejects(
  tmdbGet({ tmdb_id: 1, media_type: "movie" }, "", new RateLimiter(1000), "k"),
  TmdbNotFoundError,
  );
  assert.equal(calls, 1, "404 must not be retried");
  console.log("tmdb-fetch selfcheck passed");
})();

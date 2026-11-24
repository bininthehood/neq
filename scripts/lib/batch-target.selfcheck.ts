import { strict as assert } from "node:assert";
import { resolveBatchTarget } from "./batch-target";

const local = {
  TMDB_BATCH_TARGET: "local",
  MIRROR_SUPABASE_URL: "http://127.0.0.1:54321",
  MIRROR_SUPABASE_SERVICE_ROLE_KEY: "local-test-key",
};

assert.deepEqual(resolveBatchTarget(local), {
  target: "local",
  url: local.MIRROR_SUPABASE_URL,
  key: local.MIRROR_SUPABASE_SERVICE_ROLE_KEY,
});
assert.throws(() => resolveBatchTarget({ ...local, TMDB_BATCH_TARGET: undefined }), /TMDB_BATCH_TARGET/);
assert.throws(() => resolveBatchTarget({ ...local, MIRROR_SUPABASE_SERVICE_ROLE_KEY: undefined }), /MIRROR_SUPABASE/);
assert.throws(() => resolveBatchTarget({ ...local, MIRROR_SUPABASE_URL: "https://example.supabase.co" }), /loopback/);
assert.throws(() => resolveBatchTarget({ ...local, MIRROR_SUPABASE_URL: "http://192.168.1.1:54321" }), /loopback/);
assert.throws(() => resolveBatchTarget({ ...local, TMDB_BATCH_TARGET: "hosted" }), /HTTPS/);
assert.deepEqual(
  resolveBatchTarget({
    TMDB_BATCH_TARGET: "hosted",
    MIRROR_SUPABASE_URL: "https://example.supabase.co",
    MIRROR_SUPABASE_SERVICE_ROLE_KEY: "hosted-test-key",
  }).target,
  "hosted",
);
console.log("batch-target selfcheck passed");

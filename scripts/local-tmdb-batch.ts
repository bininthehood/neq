/** Launch one TMDB writer with local-only credentials and bounded local DB limits. */
import { spawnSync } from "node:child_process";
import { localMirrorCredentials } from "./lib/local-mirror-client";

const scripts: Record<string, string> = {
  catalog: "scripts/tmdb-catalog-sync.ts",
  bulk: "scripts/tmdb-bulk-crawl.ts",
  "refresh-stale": "scripts/tmdb-refresh-stale.ts",
  "refresh-providers": "scripts/tmdb-refresh-providers.ts",
  embed: "scripts/tmdb-embed-sync.ts",
};

const [name, ...args] = process.argv.slice(2);
const script = scripts[name];
if (!script) {
  console.error(`Usage: local-tmdb-batch.ts ${Object.keys(scripts).join("|")} [script args]`);
  process.exit(2);
}

const { url, key } = localMirrorCredentials();
const result = spawnSync("npx", ["tsx", script, ...args], {
  stdio: "inherit",
  env: {
    ...process.env,
    TMDB_BATCH_TARGET: "local",
    MIRROR_SUPABASE_URL: url,
    MIRROR_SUPABASE_SERVICE_ROLE_KEY: key,
    DB_GUARD_REFRESH_ONLY_MB: process.env.LOCAL_MIRROR_REFRESH_ONLY_MB ?? "1024",
    DB_GUARD_HALT_MB: process.env.LOCAL_MIRROR_HALT_MB ?? "1536",
  },
});
process.exitCode = result.status ?? 1;

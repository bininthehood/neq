/**
 * 집 로컬 미러 일일 작업 (launchd `me.neq.mirror-daily`, 매일 03:00 + 로그인 시).
 *
 *   1. 백업 — pg_dump 후 목록 검증. 외장에 최근 14개, 7일마다 iCloud(~/Documents)에 최근 2개
 *   2. 신규 유입 — Daily Export 상위 300편 (TMDB_DAILY_INGEST)
 *   3. 갱신 — 180일 지난 메타·30일 지난 제공처를 큐에 넣고 bulk 로 다시 가져온다.
 *      PostgREST 가 한 번에 1000행만 돌려주므로 큐가 빌 때까지 반복 (최대 5시간)
 *   4. 임베딩 — 새로 들어오거나 바뀐 작품만 (OpenAI)
 *
 * launchd 에서는 셸이 외장 볼륨을 읽지 못한다(macOS 권한). 그래서 권한을 받은
 * /opt/homebrew/bin/node 로 직접 실행한다. 하루 한 번만 성공 처리하며, 실패하면
 * 다음 로그인이나 다음 날 03:00 에 다시 돈다. 백업이 실패하면 쓰기 작업은 하지 않는다.
 *
 *   /opt/homebrew/bin/node --env-file=apps/web/.env --import tsx scripts/local-mirror-daily.ts [--force|--check]
 *   --check: 백업 1회 + iCloud 쓰기 시험 + 밀린 양 조회 + 쓰기 없는 dry-run 만 (권한 확인용)
 */
import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, copyFileSync, statSync, truncateSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { localMirrorClient } from "./lib/local-mirror-client";

// launchd WorkingDirectory 와 수동 실행 모두 저장소 루트에서 돈다.
const repo = process.cwd();
if (!existsSync(path.join(repo, "scripts/local-tmdb-batch.ts"))) throw new Error("run from the repository root");
const backupDir = process.env.LOCAL_MIRROR_BACKUP_DIR ?? path.resolve(repo, "../neko-backups");
const icloudDir = path.join(homedir(), "Documents/neko-backups");
const statePath = path.join(backupDir, ".daily-state.json");
const logPath = path.join(homedir(), "Library/Logs/neq-mirror-daily.log");
const KEEP_LOCAL = 14;
const KEEP_ICLOUD = 2;
const DAY = 24 * 3600 * 1000;
const REFRESH_BUDGET_MS = 5 * 3600 * 1000;

type State = { lastSuccess?: string; lastIcloud?: string };
const log = (msg: string) => console.log(`${new Date().toISOString()} ${msg}`);
const readState = (): State => (existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : {});
const writeState = (s: State) => writeFileSync(statePath, JSON.stringify(s, null, 2));

function rotateLog() {
  // ponytail: launchd 가 붙잡은 로그를 5MB 마다 한 세대만 보관
  if (existsSync(logPath) && statSync(logPath).size > 5 * 1024 * 1024) {
    copyFileSync(logPath, `${logPath}.1`);
    truncateSync(logPath, 0);
  }
}

function keepNewest(dir: string, keep: number) {
  const dumps = readdirSync(dir).filter((f) => /^neko-mirror-\d{8}T\d{6}Z\.dump$/.test(f)).sort();
  for (const f of dumps.slice(0, Math.max(0, dumps.length - keep))) {
    rmSync(path.join(dir, f));
    log(`backup pruned ${path.join(dir, f)}`);
  }
}

async function backup(state: State): Promise<void> {
  mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const dest = path.join(backupDir, `neko-mirror-${stamp}.dump`);
  const tmp = `${dest}.partial`;
  try {
    await new Promise<void>((resolve, reject) => {
      const out = createWriteStream(tmp, { mode: 0o600 });
      const p = spawn("docker", ["exec", "supabase_db_neko", "pg_dump", "-U", "postgres", "-d", "postgres", "-Fc"], {
        stdio: ["ignore", "pipe", "inherit"],
      });
      p.stdout.pipe(out);
      p.on("error", reject);
      p.on("close", (code) => out.close(() => (code === 0 ? resolve() : reject(new Error(`pg_dump exit ${code}`)))));
    });
    const check = spawnSync("docker", ["exec", "-i", "supabase_db_neko", "pg_restore", "-l"], {
      input: readFileSync(tmp),
      stdio: ["pipe", "ignore", "inherit"],
      maxBuffer: 64 * 1024 * 1024,
    });
    if (check.status !== 0) throw new Error(`pg_restore -l exit ${check.status}`);
    renameSync(tmp, dest);
  } finally {
    rmSync(tmp, { force: true });
  }
  log(`backup ok ${dest} ${(statSync(dest).size / 1e6).toFixed(0)}MB`);
  keepNewest(backupDir, KEEP_LOCAL);

  if (!state.lastIcloud || Date.now() - Date.parse(state.lastIcloud) > 7 * DAY - 3600 * 1000) {
    mkdirSync(icloudDir, { recursive: true, mode: 0o700 });
    copyFileSync(dest, path.join(icloudDir, path.basename(dest)));
    keepNewest(icloudDir, KEEP_ICLOUD);
    state.lastIcloud = new Date().toISOString();
    log(`backup copied to ${icloudDir}`);
  }
}

function batch(name: string, env: Record<string, string> = {}): boolean {
  log(`run ${name} ${JSON.stringify(env)}`);
  const r = spawnSync(process.execPath, ["--import", "tsx", "scripts/local-tmdb-batch.ts", name], {
    cwd: repo,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  log(`${name} exit ${r.status}`);
  return r.status === 0;
}

async function backlog() {
  const db = localMirrorClient();
  const ago = (d: number) => new Date(Date.now() - d * DAY).toISOString();
  const count = async (q: PromiseLike<{ count: number | null; error: unknown }>) => {
    const { count, error } = await q;
    if (error) throw error;
    return count ?? 0;
  };
  const [stale, providers, queue] = await Promise.all([
    count(db.from("tmdb_metadata").select("tmdb_id", { count: "exact", head: true }).lt("fetched_at", ago(180))),
    count(
      db
        .from("tmdb_metadata")
        .select("tmdb_id", { count: "exact", head: true })
        .or(`providers_fetched_at.is.null,providers_fetched_at.lt.${ago(30)}`),
    ),
    count(db.from("tmdb_crawl_queue").select("tmdb_id", { count: "exact", head: true }).lt("failed_count", 5)),
  ]);
  return { stale, providers, queue };
}

async function refresh(): Promise<boolean> {
  const deadline = Date.now() + REFRESH_BUDGET_MS;
  let ok = true;
  let prev = Infinity;
  let stuck = 0;
  for (;;) {
    const b = await backlog();
    log(`backlog stale180=${b.stale} providers30=${b.providers} queue=${b.queue}`);
    const total = b.stale + b.providers + b.queue;
    if (total === 0) return ok;
    // 404·반복 실패 작품은 큐에서 빠져도 다시 stale 로 잡힌다. 두 바퀴 줄지 않으면 멈춘다.
    stuck = total >= prev ? stuck + 1 : 0;
    if (stuck >= 2) {
      log(`backlog not shrinking (${total}); stop until tomorrow`);
      return ok;
    }
    if (Date.now() > deadline) {
      log("refresh budget (5h) used; continue tomorrow");
      return ok;
    }
    prev = total;
    if (b.queue < 2000) {
      ok = batch("refresh-stale") && ok;
      ok = batch("refresh-providers") && ok;
    }
    if (!batch("bulk")) return false;
  }
}

async function main() {
  rotateLog();
  const force = process.argv.includes("--force");
  const state = readState();
  if (process.argv.includes("--check")) {
    log("check start");
    await backup({ ...state, lastIcloud: new Date().toISOString() });
    mkdirSync(icloudDir, { recursive: true, mode: 0o700 });
    const probe = path.join(icloudDir, ".write-check");
    writeFileSync(probe, "ok");
    rmSync(probe);
    log(`icloud write ok ${icloudDir}`);
    log(`backlog ${JSON.stringify(await backlog())}`);
    const ok = batch("refresh-providers", { DRY_RUN: "true" });
    log(ok ? "check ok" : "check failed");
    process.exitCode = ok ? 0 : 1;
    return;
  }
  if (!force && state.lastSuccess && Date.now() - Date.parse(state.lastSuccess) < 20 * 3600 * 1000) {
    log(`skip: last success ${state.lastSuccess}`);
    return;
  }
  log("start");
  await backup(state); // 실패하면 throw → 쓰기 작업 없이 종료
  writeState(state);

  let ok = batch("catalog", { TMDB_DAILY_INGEST: "300" });
  ok = (await refresh()) && ok;
  ok = batch("embed") && ok;

  if (ok) {
    state.lastSuccess = new Date().toISOString();
    writeState(state);
  }
  log(ok ? "done" : "done with failures; will retry");
  process.exitCode = ok ? 0 : 1;
}

main().catch((err) => {
  log(`fatal ${err instanceof Error ? err.stack : String(err)}`);
  process.exitCode = 1;
});

# Local TMDB mirror

This setup keeps TMDB collection on this computer. The hosted site continues to read its online mirror until a separate, reviewed serving-set publication is performed.

## Start

Prerequisites: Docker and the Supabase CLI (`npx supabase`). The CLI stack is for local development and must stay on loopback.

```bash
docker network create -o com.docker.network.bridge.host_binding_ipv4=127.0.0.1 neq-local-mirror
npx supabase start --network-id neq-local-mirror
bash scripts/local-mirror-schema.sh
```

The network creation command is needed only once. `supabase/config.toml` disables the repository's automatic migrations because the user schema has external prerequisites; the schema script applies only the TMDB mirror migrations. Re-running the schema script is safe. Do not run `supabase db push` against a hosted project for this setup.

## Copy existing TMDB data

The import reads only `tmdb_catalog` and `tmdb_metadata` from `NEXT_PUBLIC_SUPABASE_URL` with `SUPABASE_SERVICE_ROLE_KEY`, and writes only to the loopback local stack. It does not copy user tables. Check that the source variables refer to the intended project before running it.

```bash
node --env-file=apps/web/.env --env-file=apps/web/.env.local --import tsx scripts/tmdb-local-import.ts --limit=100
node --env-file=apps/web/.env --env-file=apps/web/.env.local --import tsx scripts/tmdb-local-import.ts --limit=200000
bash scripts/local-mirror-schema.sh
docker exec -e PGOPTIONS='-c maintenance_work_mem=256MB' -i supabase_db_neko psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < supabase/migrations/20260624_tmdb_embedding_hnsw.sql
```

The final two commands ensure schema and vector index coverage after import. The importer upserts by `(tmdb_id, media_type)` and can be rerun. The full import copies all available rows up to 200,000 per table; it does not fetch TMDB data. If a migration fails halfway through on a fresh stack, inspect or reset that local stack before retrying the schema script.

Make a separate backup before relying on the local mirror. The backup script creates a private PostgreSQL dump in `../neko-backups` (beside the repository, on the Workspace volume) by default and checks its archive listing. Set `LOCAL_MIRROR_BACKUP_DIR` to choose another destination. A successful listing is not a substitute for a restore drill (see below).

```bash
bash scripts/local-mirror-backup.sh
```

## Restore from a backup

Tested 2026-11-24 in an empty container of the same Postgres image (no network): 68s, all 113,651 rows of both tables matched by content hash, and indexes, constraints, functions, RLS policies and grants were identical to the live mirror. Not tested: a stack newly created by `npx supabase start`, and serving through PostgREST after a restore.

A plain `pg_restore` fails: `-n public` does not create the extensions, and Supabase's `DEFAULT ACL` entries need a superuser. Restore into an empty stack only (never over a live mirror), instead of `local-mirror-schema.sh`:

```bash
DB=supabase_db_neko; DUMP=../neko-backups/<file>.dump
docker exec $DB psql -U postgres -v ON_ERROR_STOP=1 -q \
  -c "create extension if not exists vector schema public" \
  -c "create extension if not exists pg_trgm schema public" \
  -c "do \$\$ begin if not exists (select from pg_roles where rolname='mirror_reader') then create role mirror_reader nologin; end if; end \$\$"
docker exec -i $DB sh -c 'cat > /tmp/mirror.dump' < "$DUMP"
docker exec $DB sh -c "pg_restore -l -n public /tmp/mirror.dump | grep -v 'DEFAULT ACL' > /tmp/mirror.toc"
docker exec -e PGOPTIONS='-c maintenance_work_mem=256MB' $DB pg_restore -U postgres -d postgres -n public \
  -L /tmp/mirror.toc --exit-on-error --single-transaction /tmp/mirror.dump
docker exec -i $DB psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/local-mirror-reader.sql
docker exec $DB psql -U postgres -v ON_ERROR_STOP=1 -q -c "revoke execute on function public.db_size_bytes() from anon, authenticated" -c "analyze public.tmdb_metadata, public.tmdb_catalog"
docker exec $DB rm /tmp/mirror.dump /tmp/mirror.toc
```

The `revoke` matters: a fresh stack's default privileges grant the function to `anon`. IVFFlat is rebuilt on restore, so approximate neighbours can differ slightly; exact search returned the same result. The backup and the Docker volume are on the same Workspace disk, so keep a copy on another disk.

## Run local batches

The runner reads local credentials from `supabase status` without printing them. It sets `TMDB_BATCH_TARGET=local` and refuses non-loopback destinations. Local DB guard thresholds default to 1024MB for new ingestion and 1536MB for full stop; override with `LOCAL_MIRROR_REFRESH_ONLY_MB` and `LOCAL_MIRROR_HALT_MB` if the available disk requires lower values.

```bash
DRY_RUN=true PROVIDERS_ONLY=true BATCH_SIZE=100 node --import tsx scripts/local-tmdb-batch.ts refresh-providers
BATCH_SIZE=100 node --import tsx scripts/local-tmdb-batch.ts refresh-stale
PROVIDERS_ONLY=true BATCH_SIZE=100 node --import tsx scripts/local-tmdb-batch.ts refresh-providers
TMDB_BULK_BATCH=100 TMDB_RATE_LIMIT_RPS=5 node --env-file=apps/web/.env --env-file=apps/web/.env.local --import tsx scripts/local-tmdb-batch.ts bulk
```

`bulk` and `catalog` require `TMDB_API_KEY`; `embed` also requires `OPENAI_API_KEY` and incurs API usage. Verify environment variable names and target before invoking them. Start with small batches and check DB size, queue length, stale counts, and errors after each run. Do not enable GitHub schedules as part of local setup.

In a 10-row local smoke test on 2026-11-20, the oldest overall 10 rows all returned TMDB 404. With `PROVIDERS_ONLY=true`, 6 of 10 refreshed and 4 returned 404. The current queue retries these 404 rows; decide how to tombstone removed TMDB works before a broad catch-up run. The six successful rows changed only the local mirror.

## Preview online serving size

After the local mirror is populated, run a read-only comparison against the existing default online DB:

```bash
node --env-file=apps/web/.env --env-file=apps/web/.env.local --import tsx scripts/tmdb-serving-preview.ts --use-default-source
```

The preview preserves all locally known works with provider data, fills the remaining slots by popularity, and reports selected, retained, missing, and removable row counts. This matches the recommendation query's `providers IS NOT NULL` candidate pool. `ONLINE_MIRROR_MAX_ROWS` defaults to 30,000 and rejects a limit smaller than the required provider set. It makes no online writes or deletions. Verify the actual Production and Actions targets before deciding which online DB to compact.

On 2026-11-20 the imported source had 113,666 metadata rows. A 30,000-row preview retained all 25,924 rows with provider data, including 20,068 marked `subscription`, found zero missing online rows, and identified 83,666 potential removals. Provider timestamps were already stale, so coverage needs a fresh check before any online compaction. The selected set still contains 25,936 of 26,036 embeddings, or 152.1MB of the 152.7MB logical vector payload; a row cap alone is not a reliable capacity cap. The default hosted source DB measured 423.8MB, including about 399MB in `tmdb_metadata` (109MB heap, 70MB indexes, 221MB TOAST and other). The source project has not been confirmed as the Production target.

An alternative online budget is to keep vectors only for a measured high-demand subset. In the local copy, the top 5,000 provider works by popularity contain about 29.3MB of vectors, compared with 152.1MB in the 30,000-row set. This would change vector-based recommendation coverage and needs product verification. Deleting rows or clearing vectors does not necessarily reduce the physical PostgreSQL database file immediately; measure the size after a safe reclaim operation or a compact migration.

Stop the local stack with `npx supabase stop` when needed. Persistent Docker volumes hold the local data; keep a separate backup before treating the local mirror as the only full copy.

## Public traffic and recommendation budget

Shared genre lookup responses use a five-minute public CDN cache. Personalized recommendation responses are never given this public cache header. To cap paid recommendation requests across all web instances, configure `RECOMMEND_DAILY_MAX_REQUESTS` together with the existing Upstash Redis URL and token in the web deployment. With a cap configured, Redis errors return 503 before any recommendation work; after the UTC daily limit, requests return 429. The cap counts requests admitted to the recommendation pipeline, including requests that later fail. Keep the limit unset until the shared Redis connection and an affordable daily request budget are confirmed.

## Serving the web app from the local mirror (PoC, 2026-11-23)

Do not expose the Supabase dev stack (Kong): it also routes auth, storage and pg-meta, and its keys are public demo values. Instead run a separate read-only PostgREST and expose only that:

```bash
bash scripts/local-mirror-serve.sh            # applies supabase/local-mirror-reader.sql, starts neq_mirror_serve on 127.0.0.1:54400, prints the token
cloudflared tunnel --url http://127.0.0.1:54400   # quick tunnel; URL changes on every restart
```

- The JWT secret is random and kept in `supabase/.mirror-serve.secret` (gitignored). Requests without a token or with a forged token get 401. The `mirror_reader` role can only SELECT `tmdb_metadata`, `tmdb_catalog`, `tmdb_provider_snapshots` and execute `match_tmdb_by_embedding`; writes, the crawl queue and other functions return 403.
- Web env: `MIRROR_POSTGREST_URL` (tunnel URL) and `MIRROR_POSTGREST_TOKEN` override `MIRROR_SUPABASE_*`. Remove them to roll back. The vector RPC is always cut at 3s, on every path. `MIRROR_TIMEOUT_MS` (default 8000) bounds other requests when an explicit mirror is set; it is longer because the recommendation SQL fallback (1.2–1.6MB responses) takes 2.0–2.9s through the tunnel even when healthy. Neither abort triggers postgrest-js retries.
- Measured from this machine through the tunnel: first call ~0.4–1s, then 20-row select ~50ms and `match_tmdb_by_embedding` ~90–110ms. Origin down with tunnel up returns Cloudflare 502 in ~0.9s. A server that accepts but never answers aborts at the timeout. A connection-level failure (tunnel itself unreachable) is still retried by postgrest-js for about 7s.
- The web app only reads through `supabaseMirror()`; writes would fail with 403 under this mode. `tmdb_provider_snapshots` is read and written in the main DB (`/api/cron/tmdb-providers-snapshot`, `ott-expiry`), so keep that table when the hosted mirror tables are dropped. The local copy of that table is not used by the web app.
- Named tunnel `neq-mirror` serves `https://mirror.neq.me` (config `~/.cloudflared/config.yml`, catch-all 404). cloudflared runs as a user LaunchAgent (`com.cloudflare.cloudflared`, args `tunnel --no-autoupdate run` added by hand because `cloudflared service install` omits them). All mirror containers use `restart: unless-stopped`.
- Colima does not auto-start yet. A LaunchAgent running `colima status`/`colima start` hung under launchd (likely the macOS removable-volume permission for `~/.colima` on `/Volumes/Workspace`); it is parked at `~/Library/LaunchAgents/me.neq.colima.plist.disabled`. After a reboot run `colima start` by hand until this is solved.
- Deploy from the CLI only with the root `.vercelignore` allowlist; without it the upload included git-ignored native builds (2.9GB).

### Preview measurement (2026-11-23, Vercel icn1)

Preview deployment with per-deployment `-e MIRROR_POSTGREST_*` (project env unchanged) vs Production (hosted mirror in the main Supabase project; Production has no `MIRROR_*` env, so the mirror was never split off):

| Request | Production (hosted) | Preview (local via tunnel) |
|---|---|---|
| `genre-top` (4 calls) | 0.35–4.0s | 0.69–2.7s |
| `related` movie/tv (8 calls) | 14.8–19.5s | 0.32–1.6s |
| `recommend` candidates stage (2 calls) | 18.2–21.3s | 0.38–1.1s |
| `recommend` match stage | 0.8–1.3s | 0.27s |

The local DB recorded 4,263 table scans during the `genre-top`/`related` run, confirming the Preview read the local mirror. ### Root cause of the slow Production path (confirmed 2026-11-24)

`idx_metadata_embedding_ivf` (about 205MB) was dropped on the hosted DB at 2026-08-18 11:37:13 UTC during the quota incident (`pg_stat_statements` has the `DROP INDEX`), and was never rebuilt. `match_tmdb_by_embedding` then exact-sorts every provider work of that media type (15,882 movies), hits its own `statement_timeout=15000`, returns 57014, and callers fall back (TMDB for `related`, rating SQL for `recommend`). Evidence: the RPC against hosted failed in 16.1s; Production logged `RPC 오류:canceling statement due to statement timeout` for an 18.3s `related` call; all 12 warmup pings in the retained hour failed the same way.

Hosted exact sort took 33.3s then 12.2s. The same plan on the local DB took 5.1s cold / 0.4s warm, and the IVFFlat plan 0.16s / 0.005s. Hosted is also slower for the same plan; a CPU probe explains only about 2.6x, the rest is not explained.

The Preview/Production table above changed DB and code together. The request-path code differs only in which Supabase client it uses, and the direct RPC reproduces the timeout without the app, so the index is the cause; the exact speedup is not a measurement of "local vs hosted" alone.

Do not simply recreate the index on hosted: 424MB + 205MB exceeds the 500MB limit. With the 3s vector RPC limit, the rollback path (no `MIRROR_*` env) now fails over instead of waiting 15s: `generateCandidates` against hosted took 4.3–5.3s. The limit cuts only the client; the hosted DB keeps running the statement until its own 15s limit.

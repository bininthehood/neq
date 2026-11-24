/** Read-only comparison of a bounded local serving set and the online mirror. */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { queueKey } from "./lib/crawl-queue";
import { chooseServingKeys, diffServingSet } from "./lib/serving-set";
import { localMirrorClient } from "./lib/local-mirror-client";

type WorkKey = { tmdb_id: number; media_type: "movie" | "tv" };
const PAGE = 1000;

function onlineClient(url: string | undefined, key: string | undefined): SupabaseClient {
  if (!url || !key) throw new Error("Online mirror URL and service key are required");
  const parsed = new URL(url);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  if (loopback || parsed.protocol !== "https:") {
    throw new Error("online mirror must use a non-loopback HTTPS URL");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function metadataKeys(admin: SupabaseClient, rows: WorkKey[]): Promise<Set<string>> {
  const keys = new Set<string>();
  for (const mediaType of ["movie", "tv"] as const) {
    const ids = rows.filter((row) => row.media_type === mediaType).map((row) => row.tmdb_id);
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await admin.from("tmdb_metadata")
        .select("tmdb_id, media_type")
        .eq("media_type", mediaType)
        .in("tmdb_id", ids.slice(i, i + 100));
      if (error) throw new Error(`local metadata lookup failed: ${error.message}`);
      for (const row of data ?? []) keys.add(queueKey(row as WorkKey));
    }
  }
  return keys;
}

async function selectedLocalKeys(admin: SupabaseClient, required: Set<string>, maxRows: number): Promise<Set<string>> {
  const ranked: string[] = [];
  for (let offset = 0;; offset += PAGE) {
    const { data, error } = await admin.from("tmdb_catalog")
      .select("tmdb_id, media_type")
      .order("popularity", { ascending: false })
      .order("tmdb_id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`local catalog lookup failed: ${error.message}`);
    const rows = (data ?? []) as WorkKey[];
    if (rows.length === 0) break;
    const available = await metadataKeys(admin, rows);
    for (const row of rows) {
      const key = queueKey(row);
      if (available.has(key)) ranked.push(key);
    }
    const selected = chooseServingKeys(required, ranked, maxRows);
    if (selected.size >= maxRows) return selected;
    if (rows.length < PAGE) break;
  }
  return chooseServingKeys(required, ranked, maxRows);
}

async function providerKeys(admin: SupabaseClient): Promise<Set<string>> {
  const keys = new Set<string>();
  for (let offset = 0;; offset += PAGE) {
    const { data, error } = await admin.from("tmdb_metadata")
      .select("tmdb_id, media_type")
      .not("providers", "is", null)
      .order("tmdb_id", { ascending: true })
      .order("media_type", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`local subscription lookup failed: ${error.message}`);
    const rows = (data ?? []) as WorkKey[];
    for (const row of rows) keys.add(queueKey(row));
    if (rows.length < PAGE) break;
  }
  return keys;
}

async function onlineKeys(admin: SupabaseClient): Promise<Set<string>> {
  const keys = new Set<string>();
  for (let offset = 0;; offset += PAGE) {
    const { data, error } = await admin.from("tmdb_metadata")
      .select("tmdb_id, media_type")
      .order("tmdb_id", { ascending: true })
      .order("media_type", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`online metadata lookup failed: ${error.message}`);
    const rows = (data ?? []) as WorkKey[];
    for (const row of rows) keys.add(queueKey(row));
    if (rows.length < PAGE) break;
  }
  return keys;
}

async function main(): Promise<void> {
  const maxRows = Number(process.env.ONLINE_MIRROR_MAX_ROWS ?? "30000");
  if (!Number.isInteger(maxRows) || maxRows < 1 || maxRows > 100000) {
    throw new Error("ONLINE_MIRROR_MAX_ROWS must be an integer from 1 to 100000");
  }
  const local = localMirrorClient();
  const useDefault = process.argv.includes("--use-default-source");
  const online = onlineClient(
    useDefault ? process.env.NEXT_PUBLIC_SUPABASE_URL : process.env.ONLINE_MIRROR_URL,
    useDefault ? process.env.SUPABASE_SERVICE_ROLE_KEY : process.env.ONLINE_MIRROR_SERVICE_ROLE_KEY,
  );
  const required = await providerKeys(local);
  const selected = await selectedLocalKeys(local, required, maxRows);
  const current = await onlineKeys(online);
  const diff = diffServingSet(selected, current);
  const { data: bytes, error } = await online.rpc("db_size_bytes");
  console.log(JSON.stringify({
    mode: "read-only preview",
    providerWorksRequired: required.size,
    selected: selected.size,
    online: current.size,
    retained: diff.retained,
    toPublish: diff.toPublish.length,
    toRemove: diff.toRemove.length,
    onlineDbMB: error || typeof bytes !== "number" ? null : Math.round(bytes / 1048576 * 10) / 10,
    note: "Review coverage and size before any publication or deletion. No database writes were made.",
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

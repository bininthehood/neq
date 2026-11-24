/** Copy TMDB mirror rows from a hosted source into the loopback local project. */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { localMirrorClient } from "./lib/local-mirror-client";

type Table = "tmdb_catalog" | "tmdb_metadata";
const PAGE = 100;

function sourceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || new URL(url).protocol !== "https:") {
    throw new Error("Hosted source URL and service key are required");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function copyTable(source: SupabaseClient, local: SupabaseClient, table: Table, limit: number): Promise<number> {
  let copied = 0;
  while (copied < limit) {
    const requested = Math.min(PAGE, limit - copied);
    const end = copied + requested - 1;
    const { data, error } = await source.from(table)
      .select("*")
      .order("tmdb_id", { ascending: true })
      .order("media_type", { ascending: true })
      .range(copied, end);
    if (error) throw new Error(`${table} source read failed: ${error.message}`);
    if (!data?.length) break;
    const { error: writeError } = await local.from(table).upsert(data, {
      onConflict: "tmdb_id,media_type",
    });
    if (writeError) throw new Error(`${table} local write failed: ${writeError.message}`);
    copied += data.length;
    if (copied % 1000 === 0 || data.length < requested) {
      console.log(`${table}: ${copied} rows copied to local`);
    }
    if (data.length < requested) break;
  }
  return copied;
}

async function main(): Promise<void> {
  const arg = process.argv.find((value) => value.startsWith("--limit="));
  const limit = Number(arg?.split("=")[1] ?? "100");
  if (!Number.isInteger(limit) || limit < 1 || limit > 200000) {
    throw new Error("--limit must be an integer from 1 to 200000");
  }
  const source = sourceClient();
  const local = localMirrorClient();
  const catalog = await copyTable(source, local, "tmdb_catalog", limit);
  const metadata = await copyTable(source, local, "tmdb_metadata", limit);
  console.log(JSON.stringify({ source: "hosted read-only", destination: "local", catalog, metadata }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import { strict as assert } from "node:assert";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkDbGuard } from "./db-guard";

function client(data: unknown, error: { message: string } | null = null): SupabaseClient {
  return {
    rpc: async () => ({ data, error }),
  } as unknown as SupabaseClient;
}

async function main(): Promise<void> {
  await assert.rejects(
    checkDbGuard(client(null, { message: "RPC missing" }), "selfcheck"),
    /DB 크기 조회 실패/,
  );
  await assert.rejects(
    checkDbGuard(client("440000000"), "selfcheck"),
    /DB 크기 응답 오류/,
  );
  assert.equal((await checkDbGuard(client(419 * 1024 * 1024), "selfcheck")).level, "ok");
  assert.equal((await checkDbGuard(client(420 * 1024 * 1024), "selfcheck")).level, "refreshOnly");
  assert.equal((await checkDbGuard(client(460 * 1024 * 1024), "selfcheck")).level, "halt");
  console.log("db-guard selfcheck passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

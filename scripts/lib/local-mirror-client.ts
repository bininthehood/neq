import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function localMirrorCredentials(): { url: string; key: string } {
  const status = JSON.parse(execFileSync("npx", ["supabase", "status", "--output", "json"], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  })) as { API_URL?: string; SERVICE_ROLE_KEY?: string };
  if (!status.API_URL || !status.SERVICE_ROLE_KEY) throw new Error("Local Supabase is not running");
  const url = new URL(status.API_URL);
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("Local Supabase API must use a loopback URL");
  }
  return { url: status.API_URL, key: status.SERVICE_ROLE_KEY };
}

export function localMirrorClient(): SupabaseClient {
  const { url, key } = localMirrorCredentials();
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

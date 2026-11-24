/** Require an explicit destination for every TMDB writer. */
export function resolveBatchTarget(env: Record<string, string | undefined>): {
  target: "local" | "hosted";
  url: string;
  key: string;
} {
  const target = env.TMDB_BATCH_TARGET;
  if (target !== "local" && target !== "hosted") {
    throw new Error("TMDB_BATCH_TARGET must be local or hosted");
  }

  const url = env.MIRROR_SUPABASE_URL;
  const key = env.MIRROR_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("MIRROR_SUPABASE_URL and MIRROR_SUPABASE_SERVICE_ROLE_KEY are both required");
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("MIRROR_SUPABASE_URL is invalid");
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  if (target === "local" && (!loopback || parsed.protocol !== "http:")) {
    throw new Error("local batch target must use an HTTP loopback URL");
  }
  if (target === "hosted" && (loopback || parsed.protocol !== "https:")) {
    throw new Error("hosted batch target must use a non-loopback HTTPS URL");
  }
  return { target, url, key };
}

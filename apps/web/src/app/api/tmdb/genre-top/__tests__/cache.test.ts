import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mirror = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase-admin", () => ({ supabaseMirror: mirror }));

import { GET } from "../route";

function query(result: { data: unknown[] | null; error: Error | null }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "contains", "not", "gte", "order", "limit", "in"]) {
    builder[method] = () => builder;
  }
  builder.then = (resolve: (value: typeof result) => void) => Promise.resolve(result).then(resolve);
  return builder;
}

describe("genre-top cache", () => {
  beforeEach(() => mirror.mockReset());

  it("caches a successful shared empty result", async () => {
    mirror.mockReturnValue({ from: () => query({ data: [], error: null }) });
    const response = await GET(new NextRequest("http://localhost/api/tmdb/genre-top?genre=18"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=300");
  });

  it("does not cache a mirror query failure as an empty result", async () => {
    mirror.mockReturnValue({ from: () => query({ data: null, error: new Error("database unavailable") }) });
    const response = await GET(new NextRequest("http://localhost/api/tmdb/genre-top?genre=18"));
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).not.toContain("s-maxage");
  });
});

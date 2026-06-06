import type { Recommendation } from "@/lib/types";

/**
 * /api/recommend NDJSON stream 응답을 line별 JSON 파싱해 callback 으로 전파.
 *
 * 호출처:
 * - hooks/useRecommendations.ts — Discover/Saved 의 streaming 추천
 * - app/onboarding/complete/page.tsx — 첫 진입 prefetch (collected 모드)
 *
 * Wire format (line 단위 JSON object):
 *   {"type":"card","rec":Recommendation}
 *   {"type":"timings",...}
 *   {"type":"usage",...}
 *   {"type":"meta",...}        — Phase A-4 (2026-06-06) LLM 메타데이터
 *   {"type":"error","message":"..."}
 *   {"type":"done"}
 */
export async function consumeStreamingNDJSON(
  response: Response,
  callbacks: {
    onCard: (rec: Recommendation) => void;
    onTimings: (timings: unknown) => void;
    onUsage: (usage: unknown) => void;
    onError: (msg: string) => void;
    /** Phase A-4 (2026-06-06) — LLM meta 흐름. 미정의 시 line 무시. */
    onMeta?: (meta: unknown) => void;
  },
  signal?: AbortSignal,
): Promise<void> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const handle = (line: string) => {
    if (!line) return;
    try {
      const msg = JSON.parse(line) as {
        type?: string;
        rec?: Recommendation;
        timings?: unknown;
        usage?: unknown;
        meta?: unknown;
        message?: string;
      };
      if (msg.type === "card" && msg.rec) callbacks.onCard(msg.rec);
      else if (msg.type === "timings") callbacks.onTimings(msg.timings);
      else if (msg.type === "usage") callbacks.onUsage(msg.usage);
      else if (msg.type === "meta") callbacks.onMeta?.(msg.meta);
      else if (msg.type === "error") callbacks.onError(msg.message ?? "stream error");
    } catch {
      /* malformed line, skip */
    }
  };

  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel();
        return;
      }
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) handle(line.trim());
    }
    if (buffer.trim()) handle(buffer.trim());
  } catch (err) {
    if (!(err instanceof DOMException && err.name === "AbortError")) {
      callbacks.onError(err instanceof Error ? err.message : String(err));
    }
  }
}

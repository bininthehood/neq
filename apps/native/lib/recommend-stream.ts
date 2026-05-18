import type { Recommendation } from './types';

/**
 * /api/recommend NDJSON stream 응답 처리 — web `apps/web/src/lib/recommend-stream.ts` 정합.
 *
 * Wire format (line 단위 JSON object):
 *   {"type":"card","rec":Recommendation}
 *   {"type":"timings",...}
 *   {"type":"usage",...}
 *   {"type":"error","message":"..."}
 *   {"type":"done"}
 *
 * RN/Hermes 환경 의존성:
 *   - `response.body.getReader()` — React Native 0.76+/Expo SDK 52+ 지원
 *   - `TextDecoder` — Hermes 기본 지원 (0.74+)
 * 미지원 환경에서는 throw → 호출자가 non-streaming 폴백.
 */
export async function consumeStreamingNDJSON(
  response: Response,
  callbacks: {
    onCard: (rec: Recommendation) => void;
    onTimings: (timings: unknown) => void;
    onUsage: (usage: unknown) => void;
    onError: (msg: string) => void;
  },
  signal?: AbortSignal,
): Promise<void> {
  if (!response.body) {
    throw new Error('streaming_unsupported: response.body 미지원');
  }
  if (typeof (response.body as ReadableStream<Uint8Array>).getReader !== 'function') {
    throw new Error('streaming_unsupported: getReader 미지원');
  }

  const reader = (response.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const handle = (line: string) => {
    if (!line) return;
    try {
      const msg = JSON.parse(line) as {
        type?: string;
        rec?: Recommendation;
        timings?: unknown;
        usage?: unknown;
        message?: string;
      };
      if (msg.type === 'card' && msg.rec) callbacks.onCard(msg.rec);
      else if (msg.type === 'timings') callbacks.onTimings(msg.timings);
      else if (msg.type === 'usage') callbacks.onUsage(msg.usage);
      else if (msg.type === 'error') callbacks.onError(msg.message ?? 'stream error');
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
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) handle(line.trim());
    }
    if (buffer.trim()) handle(buffer.trim());
  } catch (err) {
    if (!(err instanceof Error && err.name === 'AbortError')) {
      callbacks.onError(err instanceof Error ? err.message : String(err));
    }
  }
}

import type { Recommendation } from './types';

/**
 * /api/recommend NDJSON stream 응답 처리 — web `apps/web/src/lib/recommend-stream.ts` 정합.
 *
 * Wire format (line 단위 JSON object):
 *   {"type":"card","rec":Recommendation}
 *   {"type":"timings",...}
 *   {"type":"usage",...}
 *   {"type":"meta",...}        — Phase A-4 (2026-06-06) LLM 메타데이터
 *   {"type":"error","message":"..."}
 *   {"type":"done"}
 *
 * RN/Hermes 환경 의존성:
 *   - `response.body.getReader()` — React Native 0.76+/Expo SDK 52+ 지원
 *   - `TextDecoder` — Hermes 기본 지원 (0.74+)
 * 미지원 환경에서는 throw → 호출자가 non-streaming 폴백.
 */

/**
 * 2026-06-06 B-3 — dev-only race window 확장 hook.
 *
 * 목적: `refresh-race-2026-06-06.test.ts` 같은 race 회귀 spec 에서 새 stream 첫 카드
 *       도착~stream 종료 사이 윈도우를 결정적으로 확장. 빠른 좌 스와이프 입력 타이밍
 *       을 정확히 race 영역에 맞출 수 있게 한다.
 *
 * 활성 조건 (둘 다 만족):
 *   1) `__DEV__ === true` — dev/expo run 빌드만 (release 빌드 무영향)
 *   2) `EXPO_PUBLIC_DEBUG_STREAM_DELAY_MS` 가 정수 > 0
 *
 * 미설정 / prod 환경에서는 0 → 분기 영향 없음.
 *
 * 사용:
 *   ```bash
 *   EXPO_PUBLIC_DEBUG_STREAM_DELAY_MS=300 npx expo start --dev-client
 *   ```
 *   매 onCard 직후 300ms sleep → 카드 10건이 0.4s 가 아닌 3s+ 에 걸쳐 도착.
 */
const __test_delayStream: number = (() => {
  if (typeof __DEV__ !== 'undefined' && !__DEV__) return 0;
  const raw = process.env.EXPO_PUBLIC_DEBUG_STREAM_DELAY_MS;
  const n = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
})();

export async function consumeStreamingNDJSON(
  response: Response,
  callbacks: {
    onCard: (rec: Recommendation) => void;
    onTimings: (timings: unknown) => void;
    onUsage: (usage: unknown) => void;
    /** Phase A-4 (2026-06-06) — LLM meta 흐름. 미정의 시 line 무시. */
    onMeta?: (meta: unknown) => void;
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

  const handle = async (line: string): Promise<void> => {
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
      if (msg.type === 'card' && msg.rec) {
        callbacks.onCard(msg.rec);
        // race window 확장 — __test_delayStream 활성 시에만 sleep.
        if (__test_delayStream > 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, __test_delayStream));
        }
      } else if (msg.type === 'timings') callbacks.onTimings(msg.timings);
      else if (msg.type === 'usage') callbacks.onUsage(msg.usage);
      else if (msg.type === 'meta') callbacks.onMeta?.(msg.meta);
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
      for (const line of lines) await handle(line.trim());
    }
    if (buffer.trim()) await handle(buffer.trim());
  } catch (err) {
    if (!(err instanceof Error && err.name === 'AbortError')) {
      callbacks.onError(err instanceof Error ? err.message : String(err));
    }
  }
}

import type { Recommendation, RecommendCardSource } from './types';

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
    onCard: (rec: Recommendation, source?: RecommendCardSource) => void;
    onTimings: (timings: unknown) => void;
    onUsage: (usage: unknown) => void;
    /** Phase A-4 (2026-06-06) — LLM meta 흐름. 미정의 시 line 무시. */
    onMeta?: (meta: unknown) => void;
    /**
     * 1.0.4 latency cycle (트랙 B) — 이미 emit 된 mirror 카드의 reason 만 교체.
     * id = Recommendation.tmdbId. 미정의 시 line 무시 (옛 reader 하위호환).
     */
    onReswap?: (id: number, reason: string) => void;
    /**
     * 1.0.4 latency cycle (트랙 B) — LLM 권장 전체 노출 순서 (tmdbId[]).
     * 미정의 시 line 무시.
     */
    onRankDone?: (order: number[]) => void;
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
        source?: RecommendCardSource;
        id?: number;
        reason?: string;
        order?: number[];
        timings?: unknown;
        usage?: unknown;
        meta?: unknown;
        message?: string;
      };
      if (msg.type === 'card' && msg.rec) {
        callbacks.onCard(msg.rec, msg.source);
        // race window 확장 — __test_delayStream 활성 시에만 sleep.
        if (__test_delayStream > 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, __test_delayStream));
        }
      } else if (msg.type === 'timings') callbacks.onTimings(msg.timings);
      else if (msg.type === 'usage') callbacks.onUsage(msg.usage);
      else if (msg.type === 'meta') callbacks.onMeta?.(msg.meta);
      // 1.0.4 신규 — reswap / rank_done. 옛 reader 는 미지 type 이라 무시 (else 없음).
      else if (msg.type === 'reswap' && typeof msg.id === 'number' && typeof msg.reason === 'string') {
        callbacks.onReswap?.(msg.id, msg.reason);
      } else if (msg.type === 'rank_done' && Array.isArray(msg.order)) {
        callbacks.onRankDone?.(msg.order);
      } else if (msg.type === 'error') callbacks.onError(msg.message ?? 'stream error');
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
      // expo/fetch (winter) 일부 경로에서 마지막 데이터 청크가 done=true read 에
      // 동봉되어 올 수 있다 (표준 web ReadableStream 은 분리하지만 polyfill 안전망).
      // done 일 때도 value 가 있으면 먼저 디코드 후 break.
      if (value) buffer += decoder.decode(value, { stream: !done });
      if (done) break;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) await handle(line.trim());
    }
    // stream 종료 — TextDecoder flush (잔여 멀티바이트) 후 남은 라인 전부 처리.
    // 마지막 청크가 `...timings}\n{done}\n` 형태로 done read 에 동봉돼도
    // 여기서 split → timings/done 두 라인 모두 emit 된다.
    const tail = buffer + decoder.decode();
    for (const line of tail.split('\n')) {
      const t = line.trim();
      if (t) await handle(t);
    }
  } catch (err) {
    if (!(err instanceof Error && err.name === 'AbortError')) {
      callbacks.onError(err instanceof Error ? err.message : String(err));
    }
  }
}

/**
 * analytics 의 순수 함수만 분리.
 * - 외부 의존성(posthog-react-native, expo-constants) 없음
 * - vitest 등 web 테스트 러너에서 직접 import 가능
 * - sanitize / parseServerTiming / timingsToProps / usageToProps
 *
 * `analytics.ts` 는 이 모듈을 re-export 해서 사용. 단일 진입점 유지.
 */

export type Primitive = string | number | boolean | null | undefined;
export type EventProps = Record<string, Primitive>;

/**
 * undefined 값을 제외한 새 객체 반환. PostHog 가 undefined 를 받으면 직렬화 시 누락 위험.
 */
export function sanitize(props?: EventProps): Record<string, Exclude<Primitive, undefined>> {
  if (!props) return {};
  const out: Record<string, Exclude<Primitive, undefined>> = {};
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

/**
 * /api/recommend 응답 timings → PostHog props (srv_<step>_ms).
 * 입력 예: { enrich: 286, llm: 8855 } → { srv_enrich_ms: 286, srv_llm_ms: 8855 }
 */
export function timingsToProps(timings: unknown): Record<string, number> {
  if (!timings || typeof timings !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [key, ms] of Object.entries(timings as Record<string, unknown>)) {
    if (typeof ms === 'number' && !Number.isNaN(ms)) {
      out[`srv_${key}_ms`] = Math.round(ms);
    }
  }
  return out;
}

/**
 * /api/recommend 응답 usage → PostHog props (srv_<field>).
 */
export function usageToProps(usage: unknown): Record<string, number> {
  if (!usage || typeof usage !== 'object') return {};
  const u = usage as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const k of ['prompt_tokens', 'completion_tokens', 'cached_tokens'] as const) {
    const v = u[k];
    if (typeof v === 'number' && !Number.isNaN(v)) {
      out[`srv_${k}`] = v;
    }
  }
  return out;
}

/**
 * Phase A-4 (2026-06-06) — /api/recommend 응답 body 의 meta (CurationMeta) →
 * PostHog 프로퍼티. baseline `srv_*` prefix 패턴 따름.
 *  - srv_diversity_axis (string) — Phase A-3
 *  - srv_temperature    (number) — Phase A-1
 *  - srv_seed           (number) — Phase A-2
 */
export function metaToProps(meta: unknown): Record<string, string | number> {
  if (!meta || typeof meta !== 'object') return {};
  const m = meta as Record<string, unknown>;
  const out: Record<string, string | number> = {};
  if (typeof m.diversity_axis === 'string') {
    out.srv_diversity_axis = m.diversity_axis;
  }
  if (typeof m.temperature === 'number' && !Number.isNaN(m.temperature)) {
    out.srv_temperature = m.temperature;
  }
  if (typeof m.seed === 'number' && !Number.isNaN(m.seed)) {
    out.srv_seed = m.seed;
  }
  return out;
}

/**
 * Server-Timing 헤더 파싱.
 * 형식: `enrich;dur=286,llm;dur=8855` → { enrich: 286, llm: 8855 }
 *
 * - 헤더가 비어 있거나 null 이면 빈 객체
 * - dur 파라미터가 없는 segment 는 스킵
 * - dur 값은 숫자만 추출 (`Math.round` 적용)
 * - 공백, 대소문자 변형 (`Dur=`, ` dur = `) 도 허용
 */
export function parseServerTiming(header: string | null | undefined): Record<string, number> {
  if (!header) return {};
  const out: Record<string, number> = {};
  for (const segment of header.split(',')) {
    const parts = segment.split(';').map((s) => s.trim());
    const name = parts[0];
    if (!name) continue;
    let dur: number | null = null;
    for (const p of parts.slice(1)) {
      const m = p.match(/^dur\s*=\s*([\d.]+)$/i);
      if (m) {
        const n = Number(m[1]);
        if (!Number.isNaN(n)) dur = n;
        break;
      }
    }
    if (dur !== null) out[name] = Math.round(dur);
  }
  return out;
}

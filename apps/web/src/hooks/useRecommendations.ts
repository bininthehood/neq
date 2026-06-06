"use client";

import { useState, useRef } from "react";
import {
  getRecommendations,
  setRecommendations,
  getWatchReports,
  getSaved,
  getSeenTitles,
  getFavorites,
  addRecHistory,
} from "@/lib/store";
import { getAccountPrefs } from "@/lib/account-prefs";
import type { Recommendation } from "@/lib/types";
import type { FilterType, FilterOrigin, FilterYear, FilterRating } from "@/lib/discover-types";
import { track } from "@/lib/analytics";
import { consumeStreamingNDJSON } from "@/lib/recommend-stream";

/**
 * V2 신규 입력 (P0-2). flag ON + 값이 있을 때만 fetch body에 포함.
 * 두 flag 독립 토글. 둘 다 OFF면 빈 객체 → 기존 V1 body 그대로.
 *
 * 반환:
 *   - body: fetch body에 spread할 부분 객체 (tasteGenres / subscribedOtt 또는 둘 다 없음)
 *   - tasteGenresCount / subscribedOttCount: PostHog 이벤트 속성용 counts
 *   - coldStartVersion: V1 = 둘 다 없음, V2 = 하나 이상 포함
 */
function readV2Inputs(): {
  body: { tasteGenres?: string[]; subscribedOtt?: number[] };
  tasteGenresCount: number;
  subscribedOttCount: number;
  coldStartVersion: "v1" | "v2";
} {
  // 2026-05-22 — flag 분기 제거 (default ON). prefs 값 직접 사용.
  // tasteGenres/subscribedOtt 가 비어 있으면 v1, 하나라도 있으면 v2.
  const prefs = getAccountPrefs();
  const tasteGenres = prefs.tasteGenres;
  const subscribedOtt = prefs.subscribedOtt;
  const body: { tasteGenres?: string[]; subscribedOtt?: number[] } = {};
  if (tasteGenres.length > 0) body.tasteGenres = tasteGenres;
  if (subscribedOtt.length > 0) body.subscribedOtt = subscribedOtt;
  const coldStartVersion: "v1" | "v2" =
    tasteGenres.length > 0 || subscribedOtt.length > 0 ? "v2" : "v1";
  return {
    body,
    tasteGenresCount: tasteGenres.length,
    subscribedOttCount: subscribedOtt.length,
    coldStartVersion,
  };
}

/** /api/recommend 응답 body의 timings → PostHog 프로퍼티 (srv_<step>_ms) */
function timingsToProps(timings: unknown): Record<string, number> {
  if (!timings || typeof timings !== "object") return {};
  const out: Record<string, number> = {};
  for (const [key, ms] of Object.entries(timings as Record<string, unknown>)) {
    if (typeof ms === "number" && !Number.isNaN(ms)) {
      out[`srv_${key}_ms`] = Math.round(ms);
    }
  }
  return out;
}

/** /api/recommend 응답 body의 usage → PostHog 프로퍼티 (srv_<field>) */
function usageToProps(usage: unknown): Record<string, number> {
  if (!usage || typeof usage !== "object") return {};
  const u = usage as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const k of ["prompt_tokens", "completion_tokens", "cached_tokens"] as const) {
    const v = u[k];
    if (typeof v === "number" && !Number.isNaN(v)) {
      out[`srv_${k}`] = v;
    }
  }
  return out;
}

/**
 * Phase A-4 (2026-06-06) — /api/recommend 응답 body 의 meta (CurationMeta) →
 * PostHog 프로퍼티. baseline `srv_*` prefix 패턴 ([[feedback_posthog_property_keys]])
 * 따름.
 *  - srv_diversity_axis (string)  — Phase A-3
 *  - srv_temperature    (number)  — Phase A-1 (dynamicTemperature 실측치)
 *  - srv_seed           (number)  — Phase A-2 (OpenAI seed)
 *
 * cold-start 경로는 meta 미존재 → 빈 객체 반환 (event prop 누락 정상).
 */
function metaToProps(meta: unknown): Record<string, string | number> {
  if (!meta || typeof meta !== "object") return {};
  const m = meta as Record<string, unknown>;
  const out: Record<string, string | number> = {};
  if (typeof m.diversity_axis === "string") {
    out.srv_diversity_axis = m.diversity_axis;
  }
  if (typeof m.temperature === "number" && !Number.isNaN(m.temperature)) {
    out.srv_temperature = m.temperature;
  }
  if (typeof m.seed === "number" && !Number.isNaN(m.seed)) {
    out.srv_seed = m.seed;
  }
  return out;
}


/** 세션 스토리지에서 온보딩 완료 시각을 1회성으로 꺼냄 */
function consumeOnboardingTimestamp(): number | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const ts = sessionStorage.getItem("neq_onb_completed_ts");
    if (!ts) return undefined;
    sessionStorage.removeItem("neq_onb_completed_ts");
    const parsed = parseInt(ts, 10);
    if (Number.isNaN(parsed)) return undefined;
    return Date.now() - parsed;
  } catch {
    return undefined;
  }
}

const PREFETCH_TTL_MS = 60_000;

/** Bridge screen이 미리 받아 놓은 추천 결과 1회성 소비. 없거나 만료/필터 불일치면 null */
function consumePrefetchedRecs(ft: string, fo: string):
  | { recs: unknown[]; timings: unknown; usage: unknown }
  | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem("neq_prefetched_recs");
    if (!raw) return null;
    sessionStorage.removeItem("neq_prefetched_recs");
    const parsed = JSON.parse(raw) as {
      recs: unknown[];
      timings?: unknown;
      usage?: unknown;
      ts: number;
      filter: { type: string; origin: string };
    };
    if (Date.now() - parsed.ts > PREFETCH_TTL_MS) return null;
    if (parsed.filter.type !== ft || parsed.filter.origin !== fo) return null;
    if (!Array.isArray(parsed.recs) || parsed.recs.length === 0) return null;
    return { recs: parsed.recs, timings: parsed.timings, usage: parsed.usage };
  } catch {
    return null;
  }
}

export function useRecommendations() {
  const [recs, _setRecs] = useState<Recommendation[]>([]);
  const recsRef = useRef<Recommendation[]>([]); // stale closure 방지
  const setRecs = (v: Recommendation[] | ((prev: Recommendation[]) => Recommendation[])) => {
    _setRecs((prev) => {
      const next = typeof v === "function" ? v(prev) : v;
      recsRef.current = next;
      return next;
    });
  };
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [prefetching, setPrefetching] = useState(false);
  const prefetchingRef = useRef(false); // ref 기반 가드 (state보다 즉시 반영)
  const firstEntryRef = useRef(true); // 세션 내 첫 loadRecs 호출 여부
  // 2026-05-10 — 사용자 보고: 어느 시점 이후 추가 로드 안 됨.
  // 원인: prefetch 가 빈 응답 (unique=0) 받아도 lock 안 해 매번 빈 호출 반복.
  // exclude 누적으로 LLM candidate pool 고갈된 상태에서 무한 시도.
  // → unique=0 detect 시 exhausted=true 로 lock. refresh / filter 변경 / loadRecs 시 reset.
  const [exhausted, setExhausted] = useState(false);
  const exhaustedRef = useRef(false);
  const [filterType, setFilterType] = useState<FilterType>(() => {
    if (typeof window === "undefined") return "all";
    return (sessionStorage.getItem("neq_filter_type") as FilterType) || "all";
  });
  const [filterOrigin, setFilterOrigin] = useState<FilterOrigin>(() => {
    if (typeof window === "undefined") return "all";
    return (sessionStorage.getItem("neq_filter_origin") as FilterOrigin) || "all";
  });
  const [filterYear, setFilterYear] = useState<FilterYear>(() => {
    if (typeof window === "undefined") return "all";
    return (sessionStorage.getItem("neq_filter_year") as FilterYear) || "all";
  });
  const [filterRating, setFilterRating] = useState<FilterRating>(() => {
    if (typeof window === "undefined") return "all";
    return (sessionStorage.getItem("neq_filter_rating") as FilterRating) || "all";
  });
  const [filterOTTs, setFilterOTTs] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = sessionStorage.getItem("neq_filter_otts");
      if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch { /* ignore */ }
    return new Set();
  });
  const abortRef = useRef<AbortController | null>(null);

  const loadRecs = async (ft: FilterType, fo: FilterOrigin, fy: FilterYear = "all", otts?: Set<string>) => {
    // 새 로드 시점 = candidate pool 재시도 가능. exhausted 해제.
    exhaustedRef.current = false;
    setExhausted(false);
    const effectiveOTTs = otts ?? filterOTTs;
    // 새 세션 감지 — lastLoadedAt timestamp + navigation type 조합.
    // 2026-05-11 — 사용자 보고: 앱 재접속 시 이전 1번 카드 그대로. 원인:
    // recCache 가 localStorage (persona) 에 영구 저장. sessionStorage flag 만으로는
    // PWA suspend/resume 시 sessionStorage 도 유지되어 fresh 감지 실패.
    //
    // 휴리스틱:
    //   - localStorage 'neq_recs_loaded_at' 갱신 (성공 fetch 시점)
    //   - navType === "back_forward": 캐시 유지 (history nav 자연스러움)
    //   - navType === "reload": fresh (사용자 명시 새로고침)
    //   - navType === "navigate" + 30분+ 경과 또는 첫 진입: fresh
    //   - 그 외 (30분 이내 navigate): 캐시 (Saved 왕복 등 짧은 이동)
    const FRESH_TTL_MS = 30 * 60 * 1000;
    let isFreshSession = false;
    if (typeof window !== "undefined") {
      const navEntries = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
      const navType = navEntries[0]?.type;
      const lastLoadedAt = Number(localStorage.getItem("neq_recs_loaded_at") ?? "0");
      const elapsed = Date.now() - lastLoadedAt;
      if (navType === "back_forward") {
        isFreshSession = false;
      } else if (navType === "reload") {
        isFreshSession = true;
      } else {
        // navigate (link / PWA start / address bar)
        isFreshSession = !lastLoadedAt || elapsed > FRESH_TTL_MS;
      }
    }
    // 년도 필터 없을 때만 캐시 사용 (년도 필터는 서버에서 보충이 필요하므로).
    // 새 세션 첫 진입 시에는 캐시 무시 — 새 작품 표시.
    if (fy === "all" && !isFreshSession) {
      const cached = getRecommendations(ft, fo);
      if (cached.length >= 5) {
        // 캐시에 중복이 있을 수 있으므로 tmdbId 기반 dedup
        const seen = new Set<number>();
        const deduped = cached.filter((r) => {
          if (seen.has(r.tmdbId)) return false;
          seen.add(r.tmdbId);
          return true;
        });
        if (deduped.length >= 5) {
          setRecs(deduped);
          setLoading(false);
          setLoadError(null);
          return;
        }
        // 캐시가 너무 적으면 서버에서 새로 로드
      }
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setLoadError(null);
    const t0 = performance.now();
    const isFirstEntry = firstEntryRef.current;
    firstEntryRef.current = false;

    // Bridge screen에서 prefetch된 결과가 있으면 네트워크 스킵
    if (isFirstEntry) {
      const prefetched = consumePrefetchedRecs(ft, fo);
      if (prefetched) {
        const prefRecs = prefetched.recs as Recommendation[];
        const seen = new Set<number>();
        const deduped = prefRecs.filter((r) => {
          if (seen.has(r.tmdbId)) return false;
          seen.add(r.tmdbId);
          return true;
        });
        setRecommendations(deduped, ft, fo);
        setRecs(deduped);
        setLoading(false);
        if (deduped.length > 0) {
          const duration_ms = Math.round(performance.now() - t0);
          const time_from_onboarding_ms = consumeOnboardingTimestamp();
          // prefetched는 Bridge에서 미리 받았으므로 V2 입력 여부는 그 시점 상태가 정답.
          // 여기서는 현재 시점 prefs 기준으로 PostHog 속성만 채운다 (인스트루먼트 일관성 우선).
          const v2Pref = readV2Inputs();
          track("recommendation_loaded", {
            count: deduped.length,
            filter_type: ft,
            filter_origin: fo,
            duration_ms,
            cold_start: false,
            first_entry: true,
            has_feedback: false,
            favorites_count: getFavorites().length,
            prefetched: true,
            taste_genres_count: v2Pref.tasteGenresCount,
            subscribed_ott_count: v2Pref.subscribedOttCount,
            cold_start_version: v2Pref.coldStartVersion,
            ...(time_from_onboarding_ms !== undefined ? { time_from_onboarding_ms } : {}),
            ...timingsToProps(prefetched.timings),
            ...usageToProps(prefetched.usage),
          });
          addRecHistory(
            deduped.map((r) => ({
              title: r.title,
              tmdbId: r.tmdbId,
              posterUrl: r.posterUrl,
              type: r.type,
            })),
          );
        }
        return;
      }
    }
    const filter: Record<string, string | string[]> = {};
    if (ft !== "all") filter.type = ft;
    if (fo !== "all") filter.origin = fo;
    if (fy !== "all") filter.year = fy;
    if (effectiveOTTs.size > 0) filter.ott = [...effectiveOTTs];
    const reports = getWatchReports();
    const savedItems = getSaved();
    const feedback: Record<string, string[]> = {
      loved: [],
      good: [],
      meh: [],
      dropped: [],
    };
    for (const r of reports) {
      const item = savedItems.find(
        (s) => s.recommendation.tmdbId === r.tmdbId,
      );
      if (!item) continue;
      feedback[r.reaction]?.push(item.recommendation.title);
    }
    const hasFeedback = Object.values(feedback).some((a) => a.length > 0);
    const onboardingPicks = getFavorites();
    const lovedGood = [...(feedback.loved ?? []), ...(feedback.good ?? [])]
      .filter((t) => !onboardingPicks.includes(t));
    const favorites = [...onboardingPicks, ...lovedGood].slice(0, 20);
    const seenTitles = getSeenTitles();
    const savedTitles = savedItems.map((s) => s.recommendation.title);
    const exclude = [...new Set([...seenTitles, ...savedTitles])].slice(0, 150);
    const v2 = readV2Inputs();
    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-neko-streaming": "1",
        },
        body: JSON.stringify({
          favorites,
          filter,
          savedCount: savedItems.length,
          onboardingCount: onboardingPicks.length,
          ...(hasFeedback ? { feedback } : {}),
          ...(exclude.length > 0 ? { exclude } : {}),
          ...v2.body,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setLoadError(
          err?.error ?? "추천을 불러오지 못했어요. 잠시 후 다시 시도해주세요.",
        );
        setLoading(false);
        track("recommendation_failed", { reason: "http_error" });
        return;
      }
      const isStream = res.headers.get("content-type")?.includes("application/x-ndjson") ?? false;
      const seenIds = new Set<number>();
      const collected: Recommendation[] = [];
      let firstCardAt: number | null = null;
      let timingsMeta: unknown;
      let usageMeta: unknown;
      // Phase A-4 (2026-06-06) — LLM meta (diversity_axis / temperature / seed)
      let llmMeta: unknown;

      const acceptCard = (rec: Recommendation) => {
        if (seenIds.has(rec.tmdbId)) return;
        seenIds.add(rec.tmdbId);
        collected.push(rec);
        if (firstCardAt === null) {
          firstCardAt = performance.now();
          setLoading(false);  // 첫 카드 도착 즉시 spinner 종료
        }
        // 점진 추가 (streaming) 또는 일괄 (non-streaming은 끝에 한 번)
        if (isStream) setRecs((prev) => [...prev, rec]);
      };

      if (isStream) {
        await consumeStreamingNDJSON(res, {
          onCard: acceptCard,
          onTimings: (t) => { timingsMeta = t; },
          onUsage: (u) => { usageMeta = u; },
          onMeta: (m) => { llmMeta = m; },
          onError: (msg) => { setLoadError(msg); },
        }, controller.signal);
      } else {
        // fallback: 비-stream 응답 (서버가 streaming 미지원이거나 분기 OFF인 경우)
        const data = await res.json();
        timingsMeta = data.timings;
        usageMeta = data.usage;
        llmMeta = data.meta;
        const rawRecs: Recommendation[] = data.recommendations ?? [];
        for (const r of rawRecs) acceptCard(r);
        setRecs(collected);  // non-stream은 최종 한 번
      }

      setRecommendations(collected, ft, fo);
      setLoading(false);  // stream 미발현(빈 응답) 보호
      if (collected.length > 0) {
        // 새 세션 감지용 timestamp 갱신 — 다음 진입에서 30분 TTL 비교.
        if (typeof window !== "undefined") {
          localStorage.setItem("neq_recs_loaded_at", String(Date.now()));
        }
        const duration_ms = Math.round(performance.now() - t0);
        const time_from_onboarding_ms = isFirstEntry
          ? consumeOnboardingTimestamp()
          : undefined;
        const first_card_ms = firstCardAt !== null ? Math.round(firstCardAt - t0) : undefined;
        track("recommendation_loaded", {
          count: collected.length,
          filter_type: ft,
          filter_origin: fo,
          duration_ms,
          cold_start: favorites.length === 0,
          first_entry: isFirstEntry,
          has_feedback: hasFeedback,
          favorites_count: favorites.length,
          streamed: isStream,
          taste_genres_count: v2.tasteGenresCount,
          subscribed_ott_count: v2.subscribedOttCount,
          cold_start_version: v2.coldStartVersion,
          ...(time_from_onboarding_ms !== undefined ? { time_from_onboarding_ms } : {}),
          ...(first_card_ms !== undefined ? { srv_first_card_ms: first_card_ms } : {}),
          ...timingsToProps(timingsMeta),
          ...usageToProps(usageMeta),
          ...metaToProps(llmMeta),
        });
        // V2 분기 진입 시 별도 이벤트 1건 (스펙 §8.3 cold_start_v2)
        if (v2.coldStartVersion === "v2") {
          track("cold_start_v2", {
            taste_genres_count: v2.tasteGenresCount,
            subscribed_ott_count: v2.subscribedOttCount,
            favorites_count: favorites.length,
          });
        }
        addRecHistory(
          collected.map((r: Recommendation) => ({
            title: r.title,
            tmdbId: r.tmdbId,
            posterUrl: r.posterUrl,
            type: r.type,
          })),
        );
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      // 오프라인 폴백: 캐시된 데이터가 있으면 사용
      const offlineCached = getRecommendations(ft, fo);
      if (offlineCached.length > 0) {
        setRecs(offlineCached);
        setLoadError(null);
        setLoading(false);
        return;
      }
      setLoadError("네트워크 연결을 확인해주세요.");
      setLoading(false);
      track("recommendation_failed", { reason: "network_error" });
    }
  };

  const handleFilterChange = (t: FilterType, o: FilterOrigin) => {
    setFilterType(t);
    setFilterOrigin(o);
    sessionStorage.setItem("neq_filter_type", t);
    sessionStorage.setItem("neq_filter_origin", o);
    loadRecs(t, o);
  };

  const handleOTTChange = (otts: Set<string>) => {
    setFilterOTTs(otts);
    try {
      sessionStorage.setItem("neq_filter_otts", JSON.stringify([...otts]));
    } catch { /* ignore */ }
    // OTT 필터 변경 시 서버 재조회 — 캐시 50개 밖의 작품도 가져오도록
    // (예: 국내 + Netflix 조합처럼 좁은 필터에서 빈 결과 방지)
    loadRecs(filterType, filterOrigin, filterYear, otts);
  };

  const refreshRecommendations = async () => {
    // localStorage 캐시 + React state 둘 다 비워야 새 추천이 깨끗하게 노출됨.
    // setRecs([]) 누락 시 streaming append 가 기존 recs 뒤로 붙어 setTopIdx(0)
    // 시점에 옛 첫 카드가 그대로 보임 (B1: 새로고침 무반응 / B3: 끝 도달 시 회귀).
    //
    // prev recs 를 exclude 로 보내는 건 candidates pool 이 좁은 favorites 조합
    // (예: 한국 OTT 가용 작품이 2~3개) 에서 0 결과 → ErrorScreen 회귀 발생 →
    // 미적용. 같은 카드 반복 문제는 server-side supplement (TMDB discover)
    // 또는 cache-buster 로 별도 해결 필요.
    setRecommendations([], filterType, filterOrigin);
    setRecs([]);
    await loadRecs(filterType, filterOrigin, filterYear, filterOTTs);
  };

  /** 다음 배치를 백그라운드로 프리페치 — 현재 recs 뒤에 추가 */
  const prefetchAbortRef = useRef<AbortController | null>(null);
  const prefetchNextBatch = async () => {
    // 직전 prefetch 가 빈 응답 (unique=0) 이었으면 candidate pool 고갈 추정 → lock.
    // refresh / filter 변경 / loadRecs 로만 해제.
    if (exhaustedRef.current) return;
    if (prefetchingRef.current || loading) return;
    prefetchingRef.current = true;
    setPrefetching(true);
    // 이전 prefetch 취소
    prefetchAbortRef.current?.abort();
    const controller = new AbortController();
    prefetchAbortRef.current = controller;
    const t0 = performance.now();
    try {
      const filter: Record<string, string | string[]> = {};
      if (filterType !== "all") filter.type = filterType;
      if (filterOrigin !== "all") filter.origin = filterOrigin;
      if (filterYear !== "all") filter.year = filterYear;
      if (filterOTTs.size > 0) filter.ott = [...filterOTTs];
      const savedItems = getSaved();
      const reports = getWatchReports();
      const onboardingPicks = getFavorites();
      const lovedGoodTitles: string[] = [];
      for (const r of reports) {
        if (r.reaction !== "loved" && r.reaction !== "good") continue;
        const item = savedItems.find((s) => s.recommendation.tmdbId === r.tmdbId);
        if (item) lovedGoodTitles.push(item.recommendation.title);
      }
      const favorites = [...onboardingPicks, ...lovedGoodTitles.filter((t) => !onboardingPicks.includes(t))].slice(0, 20);
      const currentRecs = recsRef.current;
      const currentTitles = currentRecs.map((r) => r.title);
      const currentIds = currentRecs.map((r) => r.tmdbId);
      const exclude = [
        ...new Set([...getSeenTitles(), ...savedItems.map((s) => s.recommendation.title), ...currentTitles]),
      ].slice(0, 200);
      const excludeIds = [...new Set([...currentIds, ...getSaved().map((s) => s.recommendation.tmdbId)])];
      const v2Pref = readV2Inputs();
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-neko-streaming": "1",
        },
        body: JSON.stringify({ favorites, filter, exclude, excludeIds, ...v2Pref.body }),
        signal: controller.signal,
      });
      if (!res.ok) { prefetchingRef.current = false; setPrefetching(false); return; }

      const isStream = res.headers.get("content-type")?.includes("application/x-ndjson") ?? false;
      const collected: Recommendation[] = [];
      let timingsMeta: unknown;
      let usageMeta: unknown;
      // Phase A-4 (2026-06-06) — LLM meta (diversity_axis / temperature / seed)
      let llmMeta: unknown;

      if (isStream) {
        // 백그라운드 prefetch는 점진 추가 의미 적음 — 모은 뒤 한 번에 stack에 추가
        await consumeStreamingNDJSON(res, {
          onCard: (rec) => collected.push(rec),
          onTimings: (t) => { timingsMeta = t; },
          onUsage: (u) => { usageMeta = u; },
          onMeta: (m) => { llmMeta = m; },
          onError: () => { /* 백그라운드 silent */ },
        }, controller.signal);
      } else {
        const data = await res.json();
        timingsMeta = data.timings;
        usageMeta = data.usage;
        llmMeta = data.meta;
        collected.push(...((data.recommendations ?? []) as Recommendation[]));
      }
      const serverTimings = timingsToProps(timingsMeta);
      const serverUsage = usageToProps(usageMeta);
      const serverLlmMeta = metaToProps(llmMeta);
      const newRecs = collected;
      // unique=0 감지 — candidate pool 고갈 추정. exhausted lock 으로 무한 호출 차단.
      let appendedUnique = 0;
      if (newRecs.length > 0) {
        setRecs((prev) => {
          const existingIds = new Set(prev.map((r) => r.tmdbId));
          const unique = newRecs.filter((r) => !existingIds.has(r.tmdbId));
          if (unique.length === 0) return prev;
          appendedUnique = unique.length;
          const merged = [...prev, ...unique];
          setRecommendations(merged, filterType, filterOrigin);
          // prefetch 도 신선 fetch — 다음 진입의 TTL 기준 갱신
          if (typeof window !== "undefined") {
            localStorage.setItem("neq_recs_loaded_at", String(Date.now()));
          }
          const duration_ms = Math.round(performance.now() - t0);
          track("recommendation_load_more", {
            count: unique.length,
            duration_ms,
            favorites_count: favorites.length,
            streamed: isStream,
            ...serverTimings,
            ...serverUsage,
            ...serverLlmMeta,
          });
          return merged;
        });
      }
      if (appendedUnique === 0) {
        exhaustedRef.current = true;
        setExhausted(true);
        track("recommendation_load_more", {
          count: 0,
          exhausted: true,
          favorites_count: favorites.length,
          ...serverTimings,
          ...serverLlmMeta,
        });
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      /* silent */
    } finally {
      prefetchingRef.current = false;
      setPrefetching(false);
    }
  };

  const abortLoading = () => {
    abortRef.current?.abort();
    prefetchAbortRef.current?.abort();
  };

  return {
    recs,
    loading,
    loadError,
    prefetching,
    exhausted,
    filterType,
    filterOrigin,
    filterYear,
    setFilterYear,
    filterRating,
    setFilterRating,
    filterOTTs,
    setFilterOTTs,
    handleOTTChange,
    loadRecs,
    handleFilterChange,
    refreshRecommendations,
    prefetchNextBatch,
    abortLoading,
  };
}

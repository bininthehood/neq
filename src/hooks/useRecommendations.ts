"use client";

import { useState, useRef, useCallback } from "react";
import {
  getRecommendations,
  setRecommendations,
  getWatchReports,
  getSaved,
  getSeenTitles,
  addRecHistory,
} from "@/lib/store";
import type { Recommendation } from "@/lib/types";
import type { FilterType, FilterOrigin, FilterYear } from "@/lib/discover-types";
import { track } from "@/lib/analytics";

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
    const effectiveOTTs = otts ?? filterOTTs;
    // 년도 필터 없을 때만 캐시 사용 (년도 필터는 서버에서 보충이 필요하므로)
    if (fy === "all") {
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
    // 취향 시드: loved/good 작품 우선, 나머지 saved도 포함
    const lovedGood = [...(feedback.loved ?? []), ...(feedback.good ?? [])];
    const otherSaved = savedItems
      .map((s) => s.recommendation.title)
      .filter((t) => !lovedGood.includes(t));
    const favorites = [...lovedGood, ...otherSaved].slice(0, 20);
    const seenTitles = getSeenTitles();
    const savedTitles = savedItems.map((s) => s.recommendation.title);
    const exclude = [...new Set([...seenTitles, ...savedTitles])].slice(0, 150);
    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          favorites,
          filter,
          ...(hasFeedback ? { feedback } : {}),
          ...(exclude.length > 0 ? { exclude } : {}),
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
      const data = await res.json();
      const rawRecs: Recommendation[] = data.recommendations ?? [];
      // 서버 응답에서도 중복 방어 (tmdbId 기준)
      const seenIds = new Set<number>();
      const newRecs = rawRecs.filter((r) => {
        if (seenIds.has(r.tmdbId)) return false;
        seenIds.add(r.tmdbId);
        return true;
      });
      setRecommendations(newRecs, ft, fo);
      setRecs(newRecs);
      setLoading(false);
      if (newRecs.length > 0) {
        track("recommendation_loaded", {
          count: newRecs.length,
          filter_type: ft,
          filter_origin: fo,
        });
        addRecHistory(
          newRecs.map((r: Recommendation) => ({
            title: r.title,
            tmdbId: r.tmdbId,
            posterUrl: r.posterUrl,
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
  };

  const refreshRecommendations = async () => {
    setRecommendations([], filterType, filterOrigin);
    await loadRecs(filterType, filterOrigin, filterYear, filterOTTs);
  };

  /** 다음 배치를 백그라운드로 프리페치 — 현재 recs 뒤에 추가 */
  const prefetchAbortRef = useRef<AbortController | null>(null);
  const prefetchNextBatch = async () => {
    if (prefetchingRef.current || loading) return;
    prefetchingRef.current = true;
    setPrefetching(true);
    // 이전 prefetch 취소
    prefetchAbortRef.current?.abort();
    const controller = new AbortController();
    prefetchAbortRef.current = controller;
    try {
      const filter: Record<string, string | string[]> = {};
      if (filterType !== "all") filter.type = filterType;
      if (filterOrigin !== "all") filter.origin = filterOrigin;
      if (filterYear !== "all") filter.year = filterYear;
      if (filterOTTs.size > 0) filter.ott = [...filterOTTs];
      // 취향 시드: saved + watchReport 기반
      const savedItems = getSaved();
      const reports = getWatchReports();
      const lovedGoodTitles: string[] = [];
      for (const r of reports) {
        if (r.reaction !== "loved" && r.reaction !== "good") continue;
        const item = savedItems.find((s) => s.recommendation.tmdbId === r.tmdbId);
        if (item) lovedGoodTitles.push(item.recommendation.title);
      }
      const otherSavedTitles = savedItems
        .map((s) => s.recommendation.title)
        .filter((t) => !lovedGoodTitles.includes(t));
      const favorites = [...lovedGoodTitles, ...otherSavedTitles].slice(0, 20);
      const currentRecs = recsRef.current;
      const currentTitles = currentRecs.map((r) => r.title);
      const currentIds = currentRecs.map((r) => r.tmdbId);
      const exclude = [
        ...new Set([...getSeenTitles(), ...savedItems.map((s) => s.recommendation.title), ...currentTitles]),
      ].slice(0, 200);
      const excludeIds = [...new Set([...currentIds, ...getSaved().map((s) => s.recommendation.tmdbId)])];
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorites, filter, exclude, excludeIds }),
        signal: controller.signal,
      });
      if (!res.ok) { prefetchingRef.current = false; setPrefetching(false); return; }
      const data = await res.json();
      const newRecs: Recommendation[] = data.recommendations ?? [];
      if (newRecs.length > 0) {
        setRecs((prev) => {
          const existingIds = new Set(prev.map((r) => r.tmdbId));
          const unique = newRecs.filter((r) => !existingIds.has(r.tmdbId));
          if (unique.length === 0) return prev;
          const merged = [...prev, ...unique];
          setRecommendations(merged, filterType, filterOrigin);
          track("recommendation_load_more", { count: unique.length });
          return merged;
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
    filterType,
    filterOrigin,
    filterYear,
    setFilterYear,
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

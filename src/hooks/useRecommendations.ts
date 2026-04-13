"use client";

import { useState, useRef } from "react";
import {
  getFavorites,
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
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false); // 추천 풀 소진 여부
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [filterOrigin, setFilterOrigin] = useState<FilterOrigin>("all");
  const [filterYear, setFilterYear] = useState<FilterYear>("all");
  const [filterOTTs, setFilterOTTs] = useState<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);

  const loadRecs = async (ft: FilterType, fo: FilterOrigin, fy: FilterYear = "all") => {
    // 년도 필터 없을 때만 캐시 사용 (년도 필터는 서버에서 보충이 필요하므로)
    if (fy === "all") {
      const cached = getRecommendations(ft, fo);
      if (cached.length > 0) {
        // 캐시에 중복이 있을 수 있으므로 tmdbId 기반 dedup
        const seen = new Set<number>();
        const deduped = cached.filter((r) => {
          if (seen.has(r.tmdbId)) return false;
          seen.add(r.tmdbId);
          return true;
        });
        setRecs(deduped);
        setLoading(false);
        setLoadError(null);
        return;
      }
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setLoadError(null);
    const favorites = getFavorites();
    const filter: Record<string, string> = {};
    if (ft !== "all") filter.type = ft;
    if (fo !== "all") filter.origin = fo;
    if (fy !== "all") filter.year = fy;
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
    setExhausted(false); // 새 필터 = 새 추천 풀
    loadRecs(t, o);
  };

  const refreshRecommendations = async () => {
    setExhausted(false); // 새로고침 = 풀 리셋
    setRecommendations([], filterType, filterOrigin);
    await loadRecs(filterType, filterOrigin);
  };

  const loadMoreRecs = async () => {
    if (loadingMore || exhausted) return; // 소진됐으면 더 이상 호출 안 함
    setLoadingMore(true);
    const favorites = getFavorites();
    const filter: Record<string, string> = {};
    if (filterType !== "all") filter.type = filterType;
    if (filterOrigin !== "all") filter.origin = filterOrigin;
    if (filterYear !== "all") filter.year = filterYear;
    const currentTitles = recs.map((r) => r.title);
    const currentIds = recs.map((r) => r.tmdbId);
    const seenTitles = getSeenTitles();
    const savedTitles = getSaved().map((s) => s.recommendation.title);
    const savedIds = getSaved().map((s) => s.recommendation.tmdbId);
    const exclude = [
      ...new Set([...seenTitles, ...savedTitles, ...currentTitles]),
    ].slice(0, 150);
    const excludeIds = [...new Set([...currentIds, ...savedIds])];
    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorites, filter, exclude, excludeIds }),
      });
      if (!res.ok) {
        setLoadingMore(false);
        return;
      }
      const data = await res.json();
      const rawRecs: Recommendation[] = data.recommendations ?? [];
      // 서버 응답 자체 dedup
      const seenNew = new Set<number>();
      const newRecs = rawRecs.filter((r) => {
        if (seenNew.has(r.tmdbId)) return false;
        seenNew.add(r.tmdbId);
        return true;
      });

      if (newRecs.length === 0) {
        // 서버가 빈 배열 → 추천 풀 소진
        setExhausted(true);
      } else {
        let addedCount = 0;
        setRecs((prev) => {
          const existingIds = new Set(prev.map((r) => r.tmdbId));
          const unique = newRecs.filter((r) => !existingIds.has(r.tmdbId));
          addedCount = unique.length;
          if (unique.length === 0) return prev;
          const merged = [...prev, ...unique];
          setRecommendations(merged, filterType, filterOrigin);
          return merged;
        });
        // 전부 중복이었으면 소진으로 판단
        if (addedCount === 0) {
          setExhausted(true);
        } else {
          track("recommendation_load_more", { count: addedCount });
          addRecHistory(
            newRecs.map((r) => ({
              title: r.title,
              tmdbId: r.tmdbId,
              posterUrl: r.posterUrl,
            })),
          );
        }
      }
    } catch {
      // silent fail for load-more
    }
    setLoadingMore(false);
  };

  const abortLoading = () => {
    abortRef.current?.abort();
  };

  return {
    recs,
    loading,
    loadError,
    loadingMore,
    filterType,
    filterOrigin,
    filterYear,
    setFilterYear,
    filterOTTs,
    setFilterOTTs,
    loadRecs,
    exhausted,
    handleFilterChange,
    refreshRecommendations,
    loadMoreRecs,
    abortLoading,
  };
}

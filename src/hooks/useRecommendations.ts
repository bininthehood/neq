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
import type { FilterType, FilterOrigin } from "@/lib/discover-types";

export function useRecommendations() {
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [filterOrigin, setFilterOrigin] = useState<FilterOrigin>("all");
  const [filterOTTs, setFilterOTTs] = useState<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);

  const loadRecs = async (ft: FilterType, fo: FilterOrigin) => {
    const cached = getRecommendations(ft, fo);
    if (cached.length > 0) {
      setRecs(cached);
      setLoading(false);
      setLoadError(null);
      return;
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
    const exclude = [...new Set([...seenTitles, ...savedTitles])].slice(0, 50);
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
          err?.error ?? "추천을 못 가져왔어. 잠시 후 다시 해볼게.",
        );
        setLoading(false);
        return;
      }
      const data = await res.json();
      const newRecs = data.recommendations ?? [];
      setRecommendations(newRecs, ft, fo);
      setRecs(newRecs);
      setLoading(false);
      if (newRecs.length > 0)
        addRecHistory(
          newRecs.map((r: Recommendation) => ({
            title: r.title,
            tmdbId: r.tmdbId,
            posterUrl: r.posterUrl,
          })),
        );
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
      setLoadError("인터넷 연결 좀 확인해줘.");
      setLoading(false);
    }
  };

  const handleFilterChange = (t: FilterType, o: FilterOrigin) => {
    setFilterType(t);
    setFilterOrigin(o);
    setFilterOTTs(new Set());
    loadRecs(t, o);
  };

  const refreshRecommendations = async () => {
    setRecommendations([], filterType, filterOrigin);
    await loadRecs(filterType, filterOrigin);
  };

  const loadMoreRecs = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    const favorites = getFavorites();
    const filter: Record<string, string> = {};
    if (filterType !== "all") filter.type = filterType;
    if (filterOrigin !== "all") filter.origin = filterOrigin;
    const currentTitles = recs.map((r) => r.title);
    const seenTitles = getSeenTitles();
    const savedTitles = getSaved().map((s) => s.recommendation.title);
    const exclude = [
      ...new Set([...seenTitles, ...savedTitles, ...currentTitles]),
    ].slice(0, 80);
    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorites, filter, exclude }),
      });
      if (!res.ok) {
        setLoadingMore(false);
        return;
      }
      const data = await res.json();
      const newRecs: Recommendation[] = data.recommendations ?? [];
      if (newRecs.length > 0) {
        setRecs((prev) => [...prev, ...newRecs]);
        const all = [...recs, ...newRecs];
        setRecommendations(all, filterType, filterOrigin);
        addRecHistory(
          newRecs.map((r) => ({
            title: r.title,
            tmdbId: r.tmdbId,
            posterUrl: r.posterUrl,
          })),
        );
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
    filterOTTs,
    setFilterOTTs,
    loadRecs,
    handleFilterChange,
    refreshRecommendations,
    loadMoreRecs,
    abortLoading,
  };
}

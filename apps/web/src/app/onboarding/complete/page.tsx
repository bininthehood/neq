"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  getFavoritesMeta,
  getFavorites,
  getSaved,
  getWatchReports,
  getSeenTitles,
} from "@/lib/store";
import { track } from "@/lib/analytics";

const MIN_DISPLAY_MS = 1500;
// prod /api/recommend cold start이 ~20s까지 걸려 prefetch가 abort되면 discover에서 재요청 → 누적 ~21s 대기
const TIMEOUT_MS = 30000;
const SLOW_COPY_THRESHOLD_MS = 5000;

type Metas = ReturnType<typeof getFavoritesMeta>;

export default function OnboardingCompletePage() {
  const router = useRouter();
  const [metas, setMetas] = useState<Metas>([]);
  const [slowCopy, setSlowCopy] = useState(false);
  const mountedAtRef = useRef<number>(Date.now());
  const navigatedRef = useRef(false);
  const shownTrackedRef = useRef(false);

  useEffect(() => {
    setMetas(getFavoritesMeta().slice(0, 5));
    mountedAtRef.current = Date.now();

    if (!shownTrackedRef.current) {
      shownTrackedRef.current = true;
      track("bridge_shown");
    }

    const navigate = (prefetchCompleted: boolean) => {
      if (navigatedRef.current) return;
      navigatedRef.current = true;
      const waitedMs = Date.now() - mountedAtRef.current;
      const remaining = Math.max(0, MIN_DISPLAY_MS - waitedMs);
      setTimeout(() => {
        track("bridge_completed", {
          wait_duration_ms: Date.now() - mountedAtRef.current,
          prefetch_completed: prefetchCompleted,
        });
        router.replace("/discover");
      }, remaining);
    };

    // 추천 prefetch — 성공 시 sessionStorage에 저장 (TTL 60초, filter all/all)
    const controller = new AbortController();
    const slowTimer = setTimeout(() => setSlowCopy(true), SLOW_COPY_THRESHOLD_MS);
    const timeoutTimer = setTimeout(() => {
      controller.abort();
      navigate(false);
    }, TIMEOUT_MS);

    const run = async () => {
      try {
        const favorites = getFavorites().slice(0, 20);
        const saved = getSaved();
        const reports = getWatchReports();
        const feedback: Record<string, string[]> = {
          loved: [], good: [], meh: [], dropped: [],
        };
        for (const r of reports) {
          const item = saved.find((s) => s.recommendation.tmdbId === r.tmdbId);
          if (!item) continue;
          feedback[r.reaction]?.push(item.recommendation.title);
        }
        const hasFeedback = Object.values(feedback).some((a) => a.length > 0);
        const seenTitles = getSeenTitles();
        const savedTitles = saved.map((s) => s.recommendation.title);
        const exclude = [...new Set([...seenTitles, ...savedTitles])].slice(0, 150);

        const res = await fetch("/api/recommend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            favorites,
            filter: {},
            savedCount: saved.length,
            onboardingCount: favorites.length,
            ...(hasFeedback ? { feedback } : {}),
            ...(exclude.length > 0 ? { exclude } : {}),
          }),
          signal: controller.signal,
        });
        if (!res.ok) { navigate(false); return; }
        const data = await res.json();
        const recs = Array.isArray(data.recommendations) ? data.recommendations : [];
        if (recs.length > 0) {
          try {
            sessionStorage.setItem(
              "neq_prefetched_recs",
              JSON.stringify({
                recs,
                timings: data.timings,
                ts: Date.now(),
                filter: { type: "all", origin: "all" },
              }),
            );
          } catch { /* quota: 그냥 스킵 */ }
        }
        navigate(recs.length > 0);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        navigate(false);
      }
    };

    run();

    return () => {
      controller.abort();
      clearTimeout(slowTimer);
      clearTimeout(timeoutTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="h-dvh w-full overflow-hidden flex flex-col items-center justify-center px-6 relative">
      {/* 포스터 orbit/converge 영역 */}
      <div className="relative w-72 h-72 flex items-center justify-center">
        {/* 중앙 glow */}
        <div
          className="absolute w-24 h-24 rounded-full"
          style={{
            background: "radial-gradient(circle, var(--accent-dim) 0%, transparent 70%)",
            animation: "bridge-pulse-glow 2.4s ease-in-out infinite",
          }}
          aria-hidden="true"
        />
        {metas.length === 0 ? null : metas.map((m, i) => {
          const n = metas.length;
          const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
          const radius = 100;
          const txStart = Math.cos(angle) * radius;
          const tyStart = Math.sin(angle) * radius;
          const rotStart = (i % 2 === 0 ? 1 : -1) * (6 + i * 2);
          const delay = i * 160;
          return (
            <div
              key={m.id}
              className="absolute w-16 h-24 rounded-md overflow-hidden"
              style={{
                // 포스터를 초기 위치로 즉시 배치(키프레임 0% 값과 동일), 그 다음 converge 시작
                transform: `translate(${txStart}px, ${tyStart}px) rotate(${rotStart}deg)`,
                animation: `bridge-orbit 3.6s cubic-bezier(0.34, 1.3, 0.64, 1) ${delay}ms infinite`,
                // @ts-expect-error — CSS custom properties
                "--tx-start": `${txStart}px`,
                "--ty-start": `${tyStart}px`,
                "--rot-start": `${rotStart}deg`,
                boxShadow: "var(--shadow-md)",
              }}
            >
              {m.posterUrl ? (
                <Image
                  src={m.posterUrl}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="64px"
                  unoptimized
                />
              ) : (
                <div className="w-full h-full bg-surface" />
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-12 text-center">
        <p
          className="font-display italic text-xl"
          style={{ color: "var(--text-primary)" }}
        >
          취향을 모아 추천을 짜고 있어요
        </p>
        <p
          className="text-sm mt-2 transition-opacity duration-500"
          style={{
            color: "var(--text-muted)",
            opacity: slowCopy ? 1 : 0,
          }}
          aria-live="polite"
        >
          거의 다 됐어요
        </p>
      </div>
    </div>
  );
}

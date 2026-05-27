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
import { consumeStreamingNDJSON } from "@/lib/recommend-stream";
import type { Recommendation } from "@/lib/types";

const MIN_DISPLAY_MS = 1500;
// prod /api/recommend cold start이 ~20s까지 걸려 prefetch가 abort되면 discover에서 재요청 → 누적 ~21s 대기
const TIMEOUT_MS = 30000;
const SLOW_COPY_THRESHOLD_MS = 5000;

type Metas = ReturnType<typeof getFavoritesMeta>;

export default function OnboardingCompletePage() {
  const router = useRouter();
  const [metas, setMetas] = useState<Metas>([]);
  const [slowCopy, setSlowCopy] = useState(false);
  // line 34 effect 에서 즉시 덮어쓰므로 init 값 불필요 (R19 purity 회피).
  const mountedAtRef = useRef<number>(0);
  const navigatedRef = useRef(false);
  const shownTrackedRef = useRef(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect --
       mount-only localStorage 읽기 (getFavoritesMeta). 정통 mount-effect 패턴. */
    setMetas(getFavoritesMeta().slice(0, 5));
    /* eslint-enable react-hooks/set-state-in-effect */
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
          headers: {
            "Content-Type": "application/json",
            // 2026-05-10 — non-streaming 경로의 보충 enrich 분기 (recommend.ts:286/339)
            // 누적이 enrich 6238ms outlier (5월 9일 PostHog) 의 의심 원인. streaming 경로는
            // 보충 분기 미구현이라 enrich 1회. prefetch 도 동일 latency 안전성 적용.
            "x-neko-streaming": "1",
          },
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
        const isStream = res.headers.get("content-type")?.includes("application/x-ndjson") ?? false;

        const collected: Recommendation[] = [];
        let timingsMeta: unknown;
        let usageMeta: unknown;

        if (isStream) {
          await consumeStreamingNDJSON(res, {
            onCard: (rec) => collected.push(rec),
            onTimings: (t) => { timingsMeta = t; },
            onUsage: (u) => { usageMeta = u; },
            onError: () => { /* prefetch — 부분 수집된 카드라도 저장 */ },
          }, controller.signal);
        } else {
          // fallback: 서버가 streaming 미지원이거나 분기 OFF인 경우
          const data = await res.json();
          timingsMeta = data.timings;
          usageMeta = data.usage;
          if (Array.isArray(data.recommendations)) collected.push(...data.recommendations);
        }

        if (collected.length > 0) {
          try {
            sessionStorage.setItem(
              "neq_prefetched_recs",
              JSON.stringify({
                recs: collected,
                timings: timingsMeta,
                usage: usageMeta,
                ts: Date.now(),
                filter: { type: "all", origin: "all" },
              }),
            );
          } catch { /* quota: 그냥 스킵 */ }
        }
        navigate(collected.length > 0);
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

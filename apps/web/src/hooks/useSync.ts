"use client";

import { useEffect, useRef } from "react";
import * as Sentry from "@sentry/nextjs";
import { syncAll, shouldSync, setLastSyncTime, pushToServer } from "@/lib/sync";

/**
 * 앱 진입 시 Supabase 동기화.
 * - 마운트 시: 5분 이상 지났으면 자동 동기화
 * - 앱 포커스 복귀 시: 동기화
 * - 앱 백그라운드 전환 / 페이지 숨김 시: push (keepalive 보장용 중복 트리거)
 */
export function useSync() {
  const syncing = useRef(false);
  const pushingOnHide = useRef(false);

  const doSync = async () => {
    if (syncing.current) return;
    if (!shouldSync(5)) return;

    syncing.current = true;
    try {
      const result = await syncAll();
      if (result.success) {
        setLastSyncTime();
        if (result.pulled > 0 || result.pushed > 0) {
          console.log(`[useSync] synced: pulled ${result.pulled}, pushed ${result.pushed}`);
        }
      } else {
        Sentry.captureMessage("[useSync] syncAll returned failure", { level: "warning" });
      }
    } catch (err) {
      console.error("[useSync] sync error:", err);
      Sentry.captureException(err, { tags: { origin: "useSync.doSync" } });
    } finally {
      syncing.current = false;
    }
  };

  useEffect(() => {
    doSync();

    const onFocus = () => doSync();
    window.addEventListener("focus", onFocus);

    // iOS Safari에서 visibilitychange보다 먼저/확실하게 발사되는 pagehide도 같이 바인딩
    const onHide = () => {
      if (pushingOnHide.current) return;
      pushingOnHide.current = true;
      pushToServer()
        .then((r) => {
          if (r.success) setLastSyncTime();
          else Sentry.captureMessage("[useSync] pushToServer failure on hide", { level: "warning" });
        })
        .catch((err) => {
          console.error("[useSync] push on hide failed:", err);
          Sentry.captureException(err, { tags: { origin: "useSync.onHide" } });
        })
        .finally(() => {
          pushingOnHide.current = false;
        });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") onHide();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onHide);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onHide);
    };
  }, []);
}

"use client";

import { useEffect, useRef } from "react";
import { syncAll, shouldSync, setLastSyncTime } from "@/lib/sync";

/**
 * 앱 진입 시 Supabase 동기화.
 * - 마운트 시: 5분 이상 지났으면 자동 동기화
 * - 앱 포커스 복귀 시: 동기화
 * - 앱 백그라운드 전환 시: push
 */
export function useSync() {
  const syncing = useRef(false);

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
      }
    } catch (err) {
      console.error("[useSync] sync error:", err);
    } finally {
      syncing.current = false;
    }
  };

  useEffect(() => {
    // 마운트 시 동기화
    doSync();

    // 앱 포커스 복귀 시 동기화
    const onFocus = () => doSync();
    window.addEventListener("focus", onFocus);

    // 앱 백그라운드 전환 시 push
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        // 백그라운드로 가면 로컬 변경분 push
        import("@/lib/sync").then(({ pushToServer, setLastSyncTime: setSync }) => {
          pushToServer().then((r) => {
            if (r.success) setSync();
          });
        });
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

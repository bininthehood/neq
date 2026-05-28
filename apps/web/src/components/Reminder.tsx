"use client";

import {
  createLocalStorageHook,
  setLocalStorageItem,
} from "@/hooks/useLocalStorageValue";
import { useSaved, useWatchReports } from "@/hooks/use-store-value";
import { IconClose } from "./Icons";

const REMINDER_KEY = "neq_last_reminder";
const ONE_DAY = 24 * 60 * 60 * 1000;

const useLastReminderShown = createLocalStorageHook(
  REMINDER_KEY,
  (raw) => Number(raw ?? "0"),
  0,
);

export default function Reminder() {
  // R19: 모두 useSyncExternalStore 기반 reactive read.
  // 기존 useState + useEffect (set-state-in-effect) → 단순 derive.
  // dismiss 시 setLocalStorageItem → useLastReminderShown 자동 갱신 → show false.
  const lastShown = useLastReminderShown();
  const saved = useSaved();
  const reports = useWatchReports();

  const showCount = computeReminderCount(lastShown, saved, reports);

  if (showCount === 0) return null;

  const dismiss = () => {
    setLocalStorageItem(REMINDER_KEY, String(Date.now()));
  };

  return (
    <div
      className="fixed top-0 left-0 right-0 z-40 px-4 pt-3 animate-fade-in"
      style={{ paddingTop: "env(safe-area-inset-top, 12px)" }}
    >
      <div
        className="max-w-lg mx-auto flex items-center gap-3 px-4 py-3 bg-surface border border-border rounded-lg"
        style={{
          boxShadow: "var(--shadow-md)",
        }}
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">저장한 작품 {showCount}편, 봤어요?</p>
          <p className="text-xs mt-0.5 text-muted">
            시청 기록을 남기면 추천이 더 정확해져요
          </p>
        </div>
        <button
          onClick={dismiss}
          className="w-11 h-11 flex items-center justify-center flex-shrink-0 rounded-full"
        >
          <IconClose size={14} color="var(--text-muted)" />
        </button>
      </div>
    </div>
  );
}

function computeReminderCount(
  lastShown: number,
  saved: ReturnType<typeof useSaved>,
  reports: ReturnType<typeof useWatchReports>,
): number {
  if (Date.now() - lastShown < ONE_DAY) return 0;
  const reportedIds = new Set(reports.map((r) => r.tmdbId));
  const unwatched = saved.filter(
    (s) => !reportedIds.has(s.recommendation.tmdbId),
  );
  return unwatched.length > 0 && saved.length >= 3 ? unwatched.length : 0;
}

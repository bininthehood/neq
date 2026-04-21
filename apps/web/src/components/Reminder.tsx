"use client";

import { useState, useMemo, useCallback } from "react";
import { getSaved, getWatchReports } from "@/lib/store";
import { IconClose } from "./Icons";

const REMINDER_KEY = "neq_last_reminder";
const ONE_DAY = 24 * 60 * 60 * 1000;

function computeReminder(): { show: boolean; count: number } {
  if (typeof window === "undefined") return { show: false, count: 0 };
  const lastShown = Number(localStorage.getItem(REMINDER_KEY) ?? "0");
  if (Date.now() - lastShown < ONE_DAY) return { show: false, count: 0 };
  const saved = getSaved();
  const reports = getWatchReports();
  const reportedIds = new Set(reports.map((r) => r.tmdbId));
  const unwatched = saved.filter((s) => !reportedIds.has(s.recommendation.tmdbId));
  return unwatched.length > 0 && saved.length >= 3
    ? { show: true, count: unwatched.length }
    : { show: false, count: 0 };
}

export default function Reminder() {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initial = useMemo(() => computeReminder(), []);
  const [show, setShow] = useState(initial.show);
  const unwatchedCount = initial.count;

  const dismiss = () => {
    setShow(false);
    localStorage.setItem(REMINDER_KEY, String(Date.now()));
  };

  if (!show) return null;

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
          <p className="text-sm font-medium">저장한 작품 {unwatchedCount}편, 봤어요?</p>
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

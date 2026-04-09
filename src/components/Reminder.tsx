"use client";

import { useState, useEffect } from "react";
import { getSaved, getWatchReports } from "@/lib/store";
import { IconClose } from "./Icons";

const REMINDER_KEY = "neko_last_reminder";
const ONE_DAY = 24 * 60 * 60 * 1000;

export default function Reminder() {
  const [show, setShow] = useState(false);
  const [unwatchedCount, setUnwatchedCount] = useState(0);

  useEffect(() => {
    const lastShown = Number(localStorage.getItem(REMINDER_KEY) ?? "0");
    const now = Date.now();
    if (now - lastShown < ONE_DAY) return;

    const saved = getSaved();
    const reports = getWatchReports();
    const reportedIds = new Set(reports.map((r) => r.tmdbId));
    const unwatched = saved.filter((s) => !reportedIds.has(s.recommendation.tmdbId));

    if (unwatched.length > 0 && saved.length >= 3) {
      setUnwatchedCount(unwatched.length);
      setShow(true);
    }
  }, []);

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
        className="max-w-lg mx-auto flex items-center gap-3 px-4 py-3"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
        }}
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">저장한 작품 {unwatchedCount}편, 봤어요?</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            시청 기록을 남기면 추천이 더 정확해져요
          </p>
        </div>
        <button
          onClick={dismiss}
          className="w-8 h-8 flex items-center justify-center flex-shrink-0"
          style={{ borderRadius: "var(--radius-full)" }}
        >
          <IconClose size={14} color="var(--text-muted)" />
        </button>
      </div>
    </div>
  );
}

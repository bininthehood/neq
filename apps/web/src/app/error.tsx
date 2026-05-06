"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { IconFilm } from "@/components/Icons";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  // D7 / Round 3 v2 — 글로벌 에러도 N-03/N-04 톤 적용
  return (
    <div className="h-dvh flex flex-col items-center justify-center px-8 gap-4">
      <div
        className="font-data text-[10px] uppercase"
        style={{
          color: "var(--text-muted)",
          letterSpacing: "0.18em",
        }}
      >
        System · 잠시만
      </div>
      <IconFilm size={48} color="var(--danger)" />
      <h1
        className="font-display text-2xl"
        style={{
          fontStyle: "italic",
          fontWeight: 400,
          letterSpacing: "-0.015em",
          lineHeight: 1.15,
        }}
      >
        신호가 흐릿해요.
      </h1>
      <p className="text-sm mt-1 text-center leading-relaxed text-secondary">
        잠시 숨 고르고 다시 와 주세요.
        <br />
        대부분 그새 풀려 있어요.
      </p>
      <button
        onClick={reset}
        className="mt-2 px-6 py-3 text-sm font-semibold active:scale-95 transition-transform bg-accent text-background rounded-full"
      >
        다시 시도
      </button>
      <p
        className="font-data text-[9px] uppercase mt-1"
        style={{
          color: "var(--text-muted)",
          letterSpacing: "0.15em",
        }}
      >
        err · {error.digest?.slice(0, 8) ?? "runtime"}
      </p>
      {error.digest && (
        <span className="block text-[10px] text-muted">{error.digest}</span>
      )}
    </div>
  );
}

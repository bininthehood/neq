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
  return (
    <div className="h-dvh flex flex-col items-center justify-center px-8">
      <IconFilm size={48} color="var(--danger)" />
      <h1 className="font-display text-xl font-bold mt-5">
        앗, 뭔가 잘못됐어요
      </h1>
      <p className="text-sm mt-2 text-center text-secondary">
        예상치 못한 문제가 생겼어요.
        {error.digest && (
          <span className="block text-xs mt-1 text-muted">
            {error.digest}
          </span>
        )}
      </p>
      <button
        onClick={reset}
        className="mt-6 px-6 py-3 text-sm font-semibold active:scale-95 transition-transform bg-accent text-background rounded-full"
      >
        다시 시도
      </button>
    </div>
  );
}

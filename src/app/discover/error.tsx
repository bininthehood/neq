"use client";

import { IconFilm } from "@/components/Icons";

export default function DiscoverError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8">
      <IconFilm size={40} color="var(--danger)" />
      <h1 className="font-display text-lg font-bold mt-4">
        추천을 불러오다 문제가 생겼어
      </h1>
      <p className="text-sm mt-2 text-center text-secondary">
        네트워크 상태를 확인하고 다시 시도해봐.
        {error.digest && (
          <span className="block text-xs mt-1 text-muted">
            {error.digest}
          </span>
        )}
      </p>
      <button
        onClick={reset}
        className="mt-5 px-6 py-3 text-sm font-semibold active:scale-95 transition-transform bg-accent text-background rounded-full"
      >
        다시 시도
      </button>
    </div>
  );
}

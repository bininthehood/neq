export default function DiscoverLoading() {
  return (
    <div className="h-dvh flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 shrink-0">
        <span className="font-display text-lg text-accent">neq,</span>
        <div className="w-10 h-5 animate-pulse bg-surface-raised rounded-md" />
      </div>

      {/* Filter chips placeholder */}
      <div className="shrink-0 px-4 py-2 flex gap-2 overflow-hidden">
        <div className="h-9 w-16 animate-pulse bg-surface rounded-full" />
        <div className="h-9 w-20 animate-pulse bg-surface rounded-full" />
        <div className="h-9 w-18 animate-pulse bg-surface rounded-full" />
      </div>

      {/* Card skeleton */}
      <div className="flex-1 flex items-center justify-center px-3">
        <div className="relative w-full h-full max-h-[75dvh] animate-pulse rounded-xl bg-surface">
          {/* Top-left badge */}
          <div className="absolute top-4 left-4 w-14 h-6 bg-surface-raised rounded-md" />
          {/* Top-right badge */}
          <div className="absolute top-4 right-4 w-16 h-6 bg-surface-raised rounded-md" />
          {/* Bottom info area */}
          <div className="absolute bottom-0 left-0 right-0 p-5 space-y-2.5">
            <div className="h-6 w-3/5 bg-surface-raised rounded-md" />
            <div className="h-3 w-2/5 bg-surface-raised rounded-sm" />
            <div className="h-4 w-4/5 bg-surface-raised rounded-sm" />
            <div className="flex gap-1.5 pt-1">
              <div className="w-8 h-8 bg-surface-raised rounded-md" />
              <div className="w-8 h-8 bg-surface-raised rounded-md" />
            </div>
          </div>
        </div>
      </div>

      {/* Loading text */}
      <div className="px-4 pb-2 shrink-0">
        <p className="text-center text-xs py-2 text-muted">
          취향 파악 중, 잠깐만...
        </p>
      </div>

      {/* Bottom nav placeholder */}
      <nav
        className="flex pb-6 pt-2 shrink-0"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <div className="flex-1 flex flex-col items-center gap-1.5 py-2">
          <div className="w-5 h-5 animate-pulse bg-surface-raised rounded-sm" />
          <div className="w-12 h-3 animate-pulse bg-surface-raised rounded-sm" />
        </div>
        <div className="flex-1 flex flex-col items-center gap-1.5 py-2">
          <div className="w-5 h-5 animate-pulse bg-surface-raised rounded-sm" />
          <div className="w-10 h-3 animate-pulse bg-surface-raised rounded-sm" />
        </div>
      </nav>
    </div>
  );
}

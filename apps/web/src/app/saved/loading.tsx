export default function SavedLoading() {
  return (
    <div className="h-dvh flex flex-col" aria-busy="true" aria-label="저장 목록 불러오는 중">
      {/* Header — D5: ChapterMark eyebrow + Fraunces italic 패턴 placeholder */}
      <div className="px-5 pt-6 pb-2">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0 space-y-2">
            {/* eyebrow chaptermark placeholder (10px Geist Mono uppercase 톤) */}
            <div className="h-2.5 w-28 animate-pulse bg-surface-raised rounded-sm" />
            {/* Fraunces italic 3xl 헤딩 placeholder */}
            <div className="h-8 w-40 animate-pulse bg-surface-raised rounded-md" />
          </div>
          <div className="h-9 w-24 animate-pulse bg-surface rounded-full shrink-0" />
        </div>
        {/* Progress bar placeholder */}
        <div className="mt-2">
          <div className="flex items-center justify-between mb-1.5">
            <div className="h-3 w-24 animate-pulse bg-surface-raised rounded-sm" />
            <div className="h-3 w-16 animate-pulse bg-surface-raised rounded-sm" />
          </div>
          <div className="h-1 w-full animate-pulse bg-surface rounded-full" />
        </div>
      </div>

      {/* Filter tabs placeholder */}
      <div className="flex gap-2 px-5 mt-2 mb-1">
        <div className="h-9 w-14 animate-pulse bg-surface rounded-full" />
        <div className="h-9 w-20 animate-pulse bg-surface rounded-full" />
        <div className="h-9 w-20 animate-pulse bg-surface rounded-full" />
      </div>

      {/* 2-column asymmetric grid skeleton */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="grid grid-cols-2 gap-3 px-5 pb-4 pt-3 auto-rows-min">
          {[240, 200, 200, 240, 240, 200].map((h, i) => (
            <div
              key={i}
              className="animate-pulse bg-surface rounded-lg"
              style={{ height: `${h}px` }}
            >
              {/* Bottom info shimmer */}
              <div className="relative w-full h-full">
                <div className="absolute bottom-0 left-0 right-0 p-2 space-y-1.5">
                  <div className="h-3 w-4/5 bg-surface-raised rounded-sm" />
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 bg-surface-raised rounded-sm" />
                    <div className="h-2.5 w-8 bg-surface-raised rounded-sm" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
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

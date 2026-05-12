export default function ProfileLoading() {
  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden" aria-busy="true" aria-label="프로필 불러오는 중">
      {/* Header */}
      <div className="px-5 pt-6 pb-4 shrink-0">
        <div className="h-8 w-24 animate-pulse bg-surface-raised rounded-md" />
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {/* 내 취향 섹션 */}
        <section className="px-5 mb-6">
          <div className="flex items-center justify-between mb-2">
            <div className="h-3 w-14 animate-pulse bg-surface-raised rounded-sm" />
            <div className="h-3 w-10 animate-pulse bg-surface-raised rounded-sm" />
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="h-7 w-16 animate-pulse bg-surface rounded-lg" />
            <div className="h-7 w-20 animate-pulse bg-surface rounded-lg" />
            <div className="h-7 w-14 animate-pulse bg-surface rounded-lg" />
            <div className="h-7 w-24 animate-pulse bg-surface rounded-lg" />
            <div className="h-7 w-18 animate-pulse bg-surface rounded-lg" />
          </div>
        </section>

        {/* 시청 기록 섹션 */}
        <section className="px-5 mb-6">
          <div className="h-3 w-20 animate-pulse bg-surface-raised rounded-sm mb-3" />
          <div className="grid grid-cols-2 gap-3">
            <div
              className="p-4 bg-surface rounded-lg"
              style={{ boxShadow: "var(--shadow-sm)" }}
            >
              <div className="h-8 w-10 animate-pulse bg-surface-raised rounded-md" />
              <div className="h-3 w-16 animate-pulse bg-surface-raised rounded-sm mt-2" />
            </div>
            <div
              className="p-4 bg-surface rounded-lg"
              style={{ boxShadow: "var(--shadow-sm)" }}
            >
              <div className="h-8 w-10 animate-pulse bg-surface-raised rounded-md" />
              <div className="h-3 w-16 animate-pulse bg-surface-raised rounded-sm mt-2" />
            </div>
          </div>
        </section>

        {/* 설정 섹션 */}
        <section className="px-5 mb-6">
          <div className="h-3 w-10 animate-pulse bg-surface-raised rounded-sm mb-3" />
          <div
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg"
            style={{ background: "var(--surface)" }}
          >
            <div className="w-5 h-5 animate-pulse bg-surface-raised rounded-sm" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 w-32 animate-pulse bg-surface-raised rounded-sm" />
              <div className="h-3 w-48 animate-pulse bg-surface-raised rounded-sm" />
            </div>
          </div>
        </section>

        {/* 앱 정보 섹션 */}
        <section className="px-5 mb-8">
          <div className="h-3 w-12 animate-pulse bg-surface-raised rounded-sm mb-3" />
          <div className="space-y-2">
            <div className="flex justify-between">
              <div className="h-3 w-8 animate-pulse bg-surface-raised rounded-sm" />
              <div className="h-3 w-10 animate-pulse bg-surface-raised rounded-sm" />
            </div>
            <div className="flex justify-between">
              <div className="h-3 w-16 animate-pulse bg-surface-raised rounded-sm" />
              <div className="h-3 w-20 animate-pulse bg-surface-raised rounded-sm" />
            </div>
          </div>
        </section>
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
        <div className="flex-1 flex flex-col items-center gap-1.5 py-2">
          <div className="w-5 h-5 animate-pulse bg-surface-raised rounded-sm" />
          <div className="w-10 h-3 animate-pulse bg-surface-raised rounded-sm" />
        </div>
      </nav>
    </div>
  );
}

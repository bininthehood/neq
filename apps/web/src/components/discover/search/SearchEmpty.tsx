"use client";

/**
 * SearchEmpty — Idle / Loading / Empty / Error 4 상태 렌더.
 *
 * SearchSheet uiState 4분기를 한 모듈로 묶었다 (uiState=ok 만 SearchResults 가 처리).
 * 각 상태 컴포넌트는 named export — 부모가 uiState 따라 선택 호출.
 *
 * D10b — Idle 컨텐츠 (Recent / Trending / Voice listening)
 * 2026-05-02 사용자 직접 테스트 D-2 #2: Browse 카테고리(BROWSE_CATEGORIES) 영역 철회.
 * 디자인은 좋았으나 기능상 불필요하다는 사용자 피드백으로 제거.
 */

import { track } from "@/lib/analytics";
import { type RecentSearch } from "@/lib/recent-searches";
import { Illust, Button, NeqSpinner } from "@neq/design";

// idle 상태에서 호출되는 trending API 응답 (apps/web/src/app/api/trending/route.ts)
export interface TrendingItem {
  id: number;
  title: string;
  posterUrl: string | null;
  year: string;
}

// ─────────────────────────────────────────────────────
// IdleContent — query 비어있을 때 (Recent / Trending / Voice 안내)
// ─────────────────────────────────────────────────────

export function IdleContent({
  listening,
  recents,
  trending,
  onApplyQuery,
  onRemoveRecent,
}: {
  listening: boolean;
  recents: RecentSearch[];
  trending: TrendingItem[];
  onApplyQuery: (q: string) => void;
  onRemoveRecent: (q: string) => void;
}) {
  if (listening) return <VoiceListening />;

  return (
    <div className="pb-4">
      {recents.length > 0 && (
        <section aria-label="최근 검색어">
          <SectionHead label="Recent · 최근 검색" />
          <div className="px-5 flex flex-wrap gap-2">
            {recents.slice(0, 7).map((r) => (
              <RecentChip
                key={r.query}
                query={r.query}
                onApply={() => onApplyQuery(r.query)}
                onRemove={() => onRemoveRecent(r.query)}
              />
            ))}
          </div>
        </section>
      )}
      {trending.length > 0 && (
        <section aria-label="지금 떠오르는" className="mt-1">
          <SectionHead label="Trending · 지금 떠오르는" />
          <div className="px-5 flex flex-wrap gap-2">
            {trending.slice(0, 6).map((t) => (
              <TrendingChip
                key={t.id}
                label={t.title}
                onApply={() => {
                  onApplyQuery(t.title);
                  track("search_trending_clicked", {
                    tmdb_id: t.id,
                    title: t.title,
                  });
                }}
              />
            ))}
          </div>
        </section>
      )}

      {recents.length === 0 && trending.length === 0 && (
        <div className="px-5 pt-4 text-sm text-muted">
          작품, 감독, 배우 이름으로 검색해보세요
        </div>
      )}
    </div>
  );
}

function SectionHead({ label }: { label: string }) {
  // 2026-05-02 amber 누적 분배 정책: ChapterMark 첫 1개만 amber, 나머지는 primary.
  // SearchSheet TRENDING/RECENT 헤더는 보조 위계라 색→가중치(semibold)로 위계 표현.
  return (
    <div className="px-5 pt-4 pb-2">
      <h3
        className="text-xs font-data uppercase"
        style={{
          color: "var(--text-primary)",
          fontWeight: 600,
          letterSpacing: "0.12em",
        }}
      >
        {label}
      </h3>
    </div>
  );
}

function RecentChip({
  query,
  onApply,
  onRemove,
}: {
  query: string;
  onApply: () => void;
  onRemove: () => void;
}) {
  return (
    <span
      className="inline-flex items-center rounded-full"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
      }}
    >
      <button
        onClick={onApply}
        className="pl-3 pr-1.5 py-1.5 text-xs font-medium active:scale-[0.97] transition-transform focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none rounded-l-full"
        style={{ color: "var(--text-primary)" }}
        aria-label={`${query} 다시 검색`}
      >
        <span aria-hidden="true" style={{ color: "var(--text-muted)" }}>
          ↺{" "}
        </span>
        {query}
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        aria-label={`${query} 검색 기록에서 제거`}
        className="pr-2.5 pl-1 py-1.5 active:scale-90 transition-transform focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none rounded-r-full"
        style={{ color: "var(--text-muted)" }}
      >
        <svg
          width={9}
          height={9}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="square"
        >
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="18" y1="6" x2="6" y2="18" />
        </svg>
      </button>
    </span>
  );
}

function TrendingChip({
  label,
  onApply,
}: {
  label: string;
  onApply: () => void;
}) {
  return (
    <button
      onClick={onApply}
      className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium active:scale-[0.97] transition-transform focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
      style={{
        background: "var(--accent-dim)",
        color: "var(--accent)",
        border: "1px solid var(--accent-dim)",
      }}
      aria-label={`${label} 검색`}
    >
      {label}
    </button>
  );
}

function VoiceListening() {
  return (
    <div
      className="flex flex-col items-center justify-center px-6 py-12 gap-3"
      style={{
        background:
          "radial-gradient(circle at center, rgba(196,163,90,0.12) 0%, transparent 70%)",
      }}
    >
      <div
        className="relative"
        style={{ width: 120, height: 120 }}
        aria-hidden="true"
      >
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className="absolute inset-0 rounded-full"
            style={{
              border: "1px solid var(--accent)",
              opacity: 0.4 / i,
              animation: `neq-voice-pulse 2s ${i * 0.4}s ease-out infinite`,
            }}
          />
        ))}
        <span
          className="absolute flex items-center justify-center rounded-full"
          style={{
            inset: 30,
            background: "var(--accent)",
            color: "var(--surface)",
          }}
        >
          <svg width="22" height="26" viewBox="0 0 22 26" fill="none">
            <rect
              x="6"
              y="1"
              width="10"
              height="14"
              rx="5"
              fill="currentColor"
            />
            <path
              d="M2 12C2 16.9706 6.02944 21 11 21V25M20 12C20 16.9706 15.9706 21 11 21"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </span>
      </div>
      <p
        className="font-display italic text-xl"
        style={{ color: "var(--text-primary)" }}
      >
        듣는 중…
      </p>
      <p
        className="text-xs text-center max-w-[220px] leading-relaxed"
        style={{ color: "var(--text-muted)" }}
      >
        &ldquo;토요일 느릿한 한국 영화&rdquo; 처럼 말해 보세요
      </p>
      <style>{`
        @keyframes neq-voice-pulse {
          0% { transform: scale(0.6); opacity: 0.6; }
          100% { transform: scale(1.4); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// LoadingState / ErrorState / EmptyState
// ─────────────────────────────────────────────────────

export function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <NeqSpinner size="md" label="검색 중" />
    </div>
  );
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-8 py-12 gap-4 text-center">
      <Illust
        name="error"
        style="editorial"
        size="lg"
        aria-label="검색 오류"
      />
      <p
        className="text-sm"
        style={{ color: "var(--text-secondary)" }}
      >
        검색 중 문제가 생겼어요
      </p>
      <Button variant="secondary" size="md" onClick={onRetry}>
        다시 시도
      </Button>
    </div>
  );
}

export function EmptyState({ query }: { query: string }) {
  // D7 / Round 3 v2 — SR-02 "맞는" → "겹치는", SR-03 행동 가이드 추가
  return (
    <div className="flex flex-col items-center justify-center px-8 py-12 gap-4 text-center">
      <Illust
        name="noResults"
        style="editorial"
        size="lg"
        aria-label="검색 결과 없음"
      />
      <div>
        <p className="font-display text-lg">
          &quot;{query.trim()}&quot;와 겹치는 게 없어요
        </p>
        <p
          className="text-sm mt-1.5 leading-relaxed"
          style={{ color: "var(--text-secondary)" }}
        >
          단어를 조금 바꿔 보세요.
          <br />
          <span style={{ color: "var(--accent)" }}>
            감독 이름이나 분위기
          </span>
          도 좋아요
        </p>
      </div>
    </div>
  );
}

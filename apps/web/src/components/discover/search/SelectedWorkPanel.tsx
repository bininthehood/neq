"use client";

/**
 * SelectedWorkPanel — 선택된 작품 상세 액션 panel.
 *
 * SearchSheet 내부에서 작품 카드 또는 인물 panel 안 작품 클릭 시 노출되는 floating panel.
 * 책임:
 *   - 시청 가능한 OTT provider 리스트 (deep link)
 *   - 저장 / 저장 해제 (toast undo 동선)
 *   - 상세 진입 (DetailSheet open)
 *
 * fetch 책임 X — 부모 (SearchSheet orchestrator) 가 providers / detailRec 을 props 로 내려줌.
 */

import Image from "next/image";
import { IconSave } from "@/components/Icons";
import { getOTTLink, getOTTIcon } from "@/lib/ott-links";
import { track } from "@/lib/analytics";
import type { Recommendation, SearchResult } from "@/lib/types";

export interface ProviderInfo {
  name: string;
  logoUrl: string | null;
}

export default function SelectedWorkPanel({
  item,
  providers,
  loadingProviders,
  loadingDetail,
  detailRec,
  isSaved,
  onSave,
  onOpenDetail,
}: {
  item: SearchResult;
  providers: ProviderInfo[];
  loadingProviders: boolean;
  loadingDetail: boolean;
  detailRec: Recommendation | null;
  isSaved: boolean;
  onSave: () => void;
  onOpenDetail: () => void;
}) {
  return (
    // 2026-05-02 사용자 직접 테스트 D-2 #3: mx-5 → mx-6 — 카로셀 px-6 와 정합
    // 위임 S 옵션 B-1: 카드 ↔ panel 시각 연결 단서.
    //   - border-top: 1px var(--accent-border-light) → 선택 카드의 amber 1.5px 보더 색 계열과 동기.
    //     선택 카드 외곽선이 amber → 그 아래 panel 상단도 같은 계열의 hairline → "이 카드 → 이 정보" 인지.
    //   - 나머지 3면은 var(--border) 로 유지 (subtle, 시각 무게중심을 상단으로).
    //   - DESIGN.md anti-slop 정책: borderLeft accent 인용 패턴 외 신규 X. border-top 은 hairline 1px
    //     으로 장식이 아닌 연결 단서. amber-border-light(15% alpha) 라 강한 amber 면적 누적 X.
    <div
      className="mx-6 mt-2 p-4 rounded-lg space-y-3"
      style={{
        background: "var(--surface)",
        borderTop: "1px solid var(--accent-border-light)",
        borderRight: "1px solid var(--border)",
        borderBottom: "1px solid var(--border)",
        borderLeft: "1px solid var(--border)",
      }}
      aria-label={`${item.title} 상세 액션`}
    >
      {loadingProviders ? (
        <div className="text-xs text-muted py-2">OTT 조회 중...</div>
      ) : providers.length > 0 ? (
        <div>
          <div className="text-xs text-muted mb-2">시청 가능한 OTT</div>
          <div className="flex flex-wrap gap-2">
            {providers.map((p) => {
              const link = getOTTLink(p.name, item.title);
              const icon = getOTTIcon(p.name) ?? p.logoUrl;
              return (
                <a
                  key={p.name}
                  href={link ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${p.name}에서 ${item.title} 보기 (새 탭)`}
                  onClick={() =>
                    track("search_ott_clicked", {
                      provider: p.name,
                      tmdb_id: item.id,
                    })
                  }
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg active:scale-95 transition-transform min-h-[44px] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
                  style={{
                    background: "var(--surface-raised)",
                    color: "var(--text-primary)",
                  }}
                >
                  {icon && (
                    <Image
                      src={icon}
                      alt={p.name}
                      width={20}
                      height={20}
                      className="object-contain rounded-sm"
                      unoptimized
                    />
                  )}
                  {p.name}
                </a>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="text-xs text-muted py-1">
          한국에서 이용 가능한 OTT가 없어요
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={onSave}
          aria-label={isSaved ? `${item.title} 저장 해제` : `${item.title} 저장하기`}
          aria-pressed={isSaved}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg active:scale-[0.98] transition-all min-h-[44px] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
          style={
            // DetailSheet save 버튼과 동일 패턴 — 시각·동작 일관.
            isSaved
              ? {
                  background: "var(--surface-raised)",
                  border: "1px solid var(--accent-border)",
                  color: "var(--accent)",
                }
              : {
                  background: "var(--accent)",
                  border: "1px solid var(--accent)",
                  color: "var(--bg)",
                }
          }
        >
          <IconSave
            size={16}
            color={isSaved ? "var(--accent)" : "var(--bg)"}
            filled={isSaved}
          />
          {isSaved ? "저장됨" : "저장하기"}
        </button>
        <button
          onClick={onOpenDetail}
          disabled={loadingDetail || !detailRec}
          aria-label={`${item.title} 상세보기`}
          className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-lg active:scale-[0.98] transition-all min-h-[44px] disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
          style={{
            background: "var(--surface-raised)",
            color: "var(--text-secondary)",
          }}
        >
          상세
          <svg
            width={12}
            height={12}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="square"
          >
            <polyline points="9 6 15 12 9 18" />
          </svg>
        </button>
      </div>
    </div>
  );
}

"use client";

/**
 * SelectedPersonPanel — 선택된 인물의 작품 리스트 (위임 J #2).
 *
 * 구조: 인물 이름/역할(감독·배우) + 작품 그리드 (3열, 포스터 + title + year).
 * 작품 카드 클릭 → 호출처가 handleSelectWork 로 전이 (그 작품 상세 패널 띄움).
 *
 * 안티-슬랍 #3 균일 그리드 우려: 3열 grid 사용하지만 SearchSheet 내부 보조 패널이라
 * 화면 전체 비율로 보면 비대칭 (위 카로셀, 아래 그리드). 이 정도는 수용.
 */

import { Fragment } from "react";
import Image from "next/image";
import PosterFallback from "@/components/PosterFallback";
import { track } from "@/lib/analytics";
import { NeqSpinner } from "@neq/design";
import type { PersonResult, SearchResult } from "@/lib/types";

export default function SelectedPersonPanel({
  person,
  works,
  loading,
  error,
  selectedWorkId,
  onSelectWork,
  nestedWorkPanel,
}: {
  person: PersonResult;
  works: SearchResult[];
  loading: boolean;
  error: boolean;
  /** 현재 선택된 작품 id — 카드에 amber border highlight 로 표시. */
  selectedWorkId?: number | null;
  onSelectWork: (item: SearchResult) => void;
  /** 선택된 작품의 SelectedWorkPanel — 작품 그리드 아래 nested 렌더. 호출처가 인스턴스 생성. */
  nestedWorkPanel?: React.ReactNode;
}) {
  const roleLabel =
    person.knownForDept === "Directing" ? "감독" : "배우";
  return (
    // 위임 S 옵션 B-1: SelectedWorkPanel 와 동일한 시각 연결 단서.
    // border-top amber-border-light → 선택 인물 카드의 amber 1.5px 외곽선과 색 계열 동기.
    <div
      className="mx-6 mt-2 p-4 rounded-lg space-y-3"
      style={{
        background: "var(--surface)",
        borderTop: "1px solid var(--accent-border-light)",
        borderRight: "1px solid var(--border)",
        borderBottom: "1px solid var(--border)",
        borderLeft: "1px solid var(--border)",
      }}
      aria-label={`${person.name} ${roleLabel} 작품 목록`}
    >
      <div className="flex items-baseline justify-between">
        <div>
          <div
            className="text-[11px] font-data uppercase"
            style={{
              color: "var(--text-muted)",
              letterSpacing: "0.12em",
            }}
          >
            {roleLabel}
          </div>
          <div
            className="text-base font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            {person.name}
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <NeqSpinner size="sm" label="작품 불러오는 중" />
        </div>
      )}

      {!loading && error && (
        <div
          className="text-xs py-3"
          style={{ color: "var(--text-secondary)" }}
        >
          작품 정보를 불러오지 못했어요
        </div>
      )}

      {!loading && !error && works.length === 0 && (
        <div
          className="text-xs py-3"
          style={{ color: "var(--text-muted)" }}
        >
          공개된 작품이 없어요
        </div>
      )}

      {!loading && !error && works.length > 0 && (() => {
        // works 를 3개씩 row 로 분할 → 선택 작품이 속한 row 바로 다음에 nestedWorkPanel 을
        // grid-column: 1 / -1 (full row span) 으로 끼워 넣음.
        // 의도: WorksCarousel 처럼 "선택한 카드 바로 아래" 시각 인접성. 그리드 끝에 떨어지지 않음.
        const ROW_SIZE = 3;
        const selectedIdx = selectedWorkId
          ? works.findIndex((w) => w.id === selectedWorkId)
          : -1;
        const selectedRowIdx = selectedIdx >= 0 ? Math.floor(selectedIdx / ROW_SIZE) : -1;
        const rows: SearchResult[][] = [];
        for (let i = 0; i < works.length; i += ROW_SIZE) {
          rows.push(works.slice(i, i + ROW_SIZE));
        }
        return (
          <div className="grid grid-cols-3 gap-2.5">
            {rows.map((row, rowIdx) => (
              <Fragment key={`row-${rowIdx}`}>
                {row.map((w) => {
                  const isSelected = selectedWorkId === w.id;
                  return (
                    <button
                      key={`${w.id}-${w.mediaType}`}
                      type="button"
                      onClick={() => {
                        track("search_person_work_clicked", {
                          person_id: person.id,
                          tmdb_id: w.id,
                        });
                        onSelectWork(w);
                      }}
                      aria-label={`${w.title} 상세 보기${isSelected ? " (선택됨)" : ""}`}
                      aria-current={isSelected ? "true" : undefined}
                      className="text-left active:scale-[0.97] transition-transform focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none rounded-md"
                      style={{
                        // 선택 작품 있을 때 비선택 카드 dim → 검색 시 dim overlay 와 동일 시각 위계.
                        // 선택 + panel 의 시각 무게 살리고, 비선택 클릭은 그대로 가능 (갈아탐).
                        opacity: selectedWorkId && !isSelected ? 0.35 : 1,
                        transition: "opacity 180ms var(--ease-detail-morph)",
                      }}
                    >
                      <div
                        className="relative rounded-md overflow-hidden"
                        style={{
                          aspectRatio: "2 / 3",
                          background: "var(--surface-raised)",
                          // 선택 작품: amber 1.5px border + 약한 amber-dim 외곽 → "이 작품의 카드가 아래 떠있음" 단서.
                          border: isSelected
                            ? "1.5px solid var(--accent)"
                            : "1px solid var(--border)",
                          boxShadow: isSelected
                            ? "0 0 0 3px var(--accent-dim)"
                            : "none",
                          transition:
                            "border-color 180ms var(--ease-detail-morph), box-shadow 180ms var(--ease-detail-morph)",
                        }}
                      >
                        {w.posterUrl ? (
                          <Image
                            src={w.posterUrl}
                            alt={w.title}
                            fill
                            sizes="100px"
                            className="object-cover"
                          />
                        ) : (
                          <PosterFallback title={w.title} size="sm" />
                        )}
                      </div>
                      <div
                        className="mt-1 text-[11px] font-medium leading-tight line-clamp-2"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {w.title}
                      </div>
                      {w.year && (
                        <div
                          className="font-data text-[10px] mt-0.5"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {w.year}
                        </div>
                      )}
                    </button>
                  );
                })}
                {/* 선택 작품의 row 바로 뒤에 nestedWorkPanel 을 full-row 로 끼움.
                    -mx-4 로 인물 panel 의 p-4 padding 까지 확장 → panel 자체가 인물 panel edge 까지 차지. */}
                {rowIdx === selectedRowIdx && nestedWorkPanel && (
                  <div style={{ gridColumn: "1 / -1" }} className="-mx-4">
                    {nestedWorkPanel}
                  </div>
                )}
              </Fragment>
            ))}
          </div>
        );
      })()}
    </div>
  );
}

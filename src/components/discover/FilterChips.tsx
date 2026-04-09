"use client";

import { useState } from "react";
import NextImage from "next/image";
import { getOTTIcon } from "@/lib/ott-links";
import type { Recommendation } from "@/lib/types";
import type { FilterType, FilterOrigin } from "@/lib/discover-types";
import {
  OTT_OPTIONS,
  TYPE_LABELS,
  ORIGIN_LABELS,
} from "@/lib/discover-types";

interface FilterChipsProps {
  filterType: FilterType;
  filterOrigin: FilterOrigin;
  filterOTTs: Set<string>;
  recs: Recommendation[];
  loading: boolean;
  onFilterChange: (t: FilterType, o: FilterOrigin) => void;
  onOTTChange: (otts: Set<string>) => void;
  onResetTopIdx: () => void;
}

export default function FilterChips({
  filterType,
  filterOrigin,
  filterOTTs,
  recs,
  loading,
  onFilterChange,
  onOTTChange,
  onResetTopIdx,
}: FilterChipsProps) {
  const [openDropdown, setOpenDropdown] = useState<
    "type" | "origin" | "ott" | null
  >(null);

  const availableOTTs = OTT_OPTIONS.filter((ott) =>
    recs.some((r) => r.providers.some((p) => p.name === ott)),
  );
  const ottLabel =
    filterOTTs.size === 0
      ? "OTT"
      : filterOTTs.size === 1
        ? [...filterOTTs][0]
        : `OTT ${filterOTTs.size}개`;

  const chipStyle = (active: boolean, isOpen?: boolean) => ({
    background: active ? "var(--accent)" : "var(--surface)",
    color: active ? "var(--bg)" : "var(--text-secondary)",
    borderRadius: "var(--radius-full)",
    border: active
      ? "1px solid var(--accent)"
      : "1px solid var(--border)",
    transform: isOpen ? "scale(1.05)" : "scale(1)",
  });

  return (
    <div className="shrink-0 relative">
      {/* chip row */}
      <div className="flex gap-2 px-4 pb-2">
        <button
          onClick={() =>
            setOpenDropdown(openDropdown === "type" ? null : "type")
          }
          disabled={loading}
          className="px-3 py-2.5 min-h-[44px] text-xs whitespace-nowrap transition-all duration-200 disabled:opacity-50 flex items-center gap-1 active:scale-95"
          style={chipStyle(filterType !== "all", openDropdown === "type")}
        >
          {TYPE_LABELS[filterType]}{" "}
          <span style={{ fontSize: 11, opacity: 0.6 }}>&#9662;</span>
        </button>
        <button
          onClick={() =>
            setOpenDropdown(openDropdown === "origin" ? null : "origin")
          }
          disabled={loading}
          className="px-3 py-2.5 min-h-[44px] text-xs whitespace-nowrap transition-all duration-200 disabled:opacity-50 flex items-center gap-1 active:scale-95"
          style={chipStyle(
            filterOrigin !== "all",
            openDropdown === "origin",
          )}
        >
          {ORIGIN_LABELS[filterOrigin]}{" "}
          <span style={{ fontSize: 11, opacity: 0.6 }}>&#9662;</span>
        </button>
        {availableOTTs.length > 0 && (
          <button
            onClick={() =>
              setOpenDropdown(openDropdown === "ott" ? null : "ott")
            }
            className="px-3 py-2.5 min-h-[44px] text-xs whitespace-nowrap transition-all duration-200 flex items-center gap-1 active:scale-95"
            style={chipStyle(
              filterOTTs.size > 0,
              openDropdown === "ott",
            )}
          >
            {ottLabel}{" "}
            <span style={{ fontSize: 11, opacity: 0.6 }}>&#9662;</span>
          </button>
        )}
      </div>

      {/* dropdown panel */}
      {openDropdown && (
        <>
          <div
            className="fixed inset-0 z-20"
            onClick={() => setOpenDropdown(null)}
          />
          <div
            className="absolute left-4 right-4 z-30 p-2 flex flex-wrap gap-1.5 animate-fade-in bg-surface rounded-lg border border-border"
            style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}
          >
            {openDropdown === "type" &&
              (["all", "movie", "series"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    onFilterChange(t, filterOrigin);
                    setOpenDropdown(null);
                  }}
                  className="px-3 py-2 text-xs whitespace-nowrap transition-all duration-200 active:scale-95"
                  style={chipStyle(filterType === t)}
                >
                  {t === "all" ? "전체" : TYPE_LABELS[t]}
                </button>
              ))}
            {openDropdown === "origin" &&
              (["all", "kr", "foreign"] as const).map((o) => (
                <button
                  key={o}
                  onClick={() => {
                    onFilterChange(filterType, o);
                    setOpenDropdown(null);
                  }}
                  className="px-3 py-2 text-xs whitespace-nowrap transition-all duration-200 active:scale-95"
                  style={chipStyle(filterOrigin === o)}
                >
                  {o === "all" ? "전체" : ORIGIN_LABELS[o]}
                </button>
              ))}
            {openDropdown === "ott" && (
              <>
                <button
                  onClick={() => {
                    onOTTChange(new Set());
                    onResetTopIdx();
                    setOpenDropdown(null);
                  }}
                  className="px-3 py-2 text-xs whitespace-nowrap transition-all duration-200 active:scale-95"
                  style={chipStyle(filterOTTs.size === 0)}
                >
                  모든 OTT
                </button>
                {availableOTTs.map((ott) => {
                  const selected = filterOTTs.has(ott);
                  return (
                    <button
                      key={ott}
                      onClick={() => {
                        const next = new Set(filterOTTs);
                        if (selected) next.delete(ott);
                        else next.add(ott);
                        onOTTChange(next);
                        onResetTopIdx();
                      }}
                      className="px-3 py-2 text-xs whitespace-nowrap transition-all duration-200 flex items-center gap-1.5 active:scale-95"
                      style={chipStyle(selected)}
                    >
                      {getOTTIcon(ott) && (
                        <NextImage
                          src={getOTTIcon(ott)!}
                          alt={ott}
                          width={16}
                          height={16}
                          className="object-contain rounded-sm"
                          unoptimized
                        />
                      )}
                      {ott}
                    </button>
                  );
                })}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

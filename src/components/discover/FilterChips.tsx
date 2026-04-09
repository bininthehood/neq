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
    background: "transparent",
    color: active ? "var(--text-primary)" : "var(--text-secondary)",
    borderRadius: 0,
    border: "none",
    borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
    fontWeight: active ? 600 : 400,
    transform: isOpen ? "scale(1.02)" : "scale(1)",
    paddingBottom: "6px",
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
          <span style={{ fontSize: 10, opacity: 0.3 }}>&#9662;</span>
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
          <span style={{ fontSize: 10, opacity: 0.3 }}>&#9662;</span>
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
            <span style={{ fontSize: 10, opacity: 0.3 }}>&#9662;</span>
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
            className="absolute left-4 right-4 z-30 p-3 flex flex-wrap gap-2 animate-fade-in bg-surface-raised rounded-lg"
            style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.5)" }}
          >
            {openDropdown === "type" &&
              (["all", "movie", "series"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    onFilterChange(t, filterOrigin);
                    setOpenDropdown(null);
                  }}
                  className="px-3 py-2 text-xs whitespace-nowrap transition-all duration-200 active:scale-95 rounded-lg"
                  style={{
                    background: filterType === t ? "var(--accent-dim)" : "transparent",
                    color: filterType === t ? "var(--accent)" : "var(--text-secondary)",
                    fontWeight: filterType === t ? 600 : 400,
                  }}
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
                  className="px-3 py-2 text-xs whitespace-nowrap transition-all duration-200 active:scale-95 rounded-lg"
                  style={{
                    background: filterOrigin === o ? "var(--accent-dim)" : "transparent",
                    color: filterOrigin === o ? "var(--accent)" : "var(--text-secondary)",
                    fontWeight: filterOrigin === o ? 600 : 400,
                  }}
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
                  className="px-3 py-2 text-xs whitespace-nowrap transition-all duration-200 active:scale-95 rounded-lg"
                  style={{
                    background: filterOTTs.size === 0 ? "var(--accent-dim)" : "transparent",
                    color: filterOTTs.size === 0 ? "var(--accent)" : "var(--text-secondary)",
                    fontWeight: filterOTTs.size === 0 ? 600 : 400,
                  }}
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
                      className="px-3 py-2 text-xs whitespace-nowrap transition-all duration-200 flex items-center gap-1.5 active:scale-95 rounded-lg"
                      style={{
                        background: selected ? "var(--accent-dim)" : "transparent",
                        color: selected ? "var(--accent)" : "var(--text-secondary)",
                        fontWeight: selected ? 600 : 400,
                      }}
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

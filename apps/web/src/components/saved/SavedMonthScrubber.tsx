"use client";

import type { SavedItem } from "@/lib/types";
import { monthLabelOf, resolveSnapIndex, rulerSlotsOf } from "./SavedSortControl";

interface Props {
  items: SavedItem[];
  selected: number | null;
  onSelect: (key: number | null) => void;
  nowKey?: number;
}

export function SavedMonthScrubber({ items, selected, onSelect, nowKey }: Props) {
  const now = new Date();
  const effectiveNowKey = nowKey ?? now.getFullYear() * 12 + now.getMonth();
  const slots = rulerSlotsOf(items, effectiveNowKey);

  if (slots.length === 0) return null;

  return (
    <div className="relative px-5 pt-1 pb-2" aria-label="연·월 필터">
      <div
        className="pointer-events-none absolute left-1/2 top-0 h-0 w-0 -translate-x-1/2"
        style={{
          borderLeft: "5px solid transparent",
          borderRight: "5px solid transparent",
          borderTop: "8px solid var(--text-primary)",
        }}
        aria-hidden
      />
      <div
        role="tablist"
        aria-label="연·월 필터"
        className="flex gap-1.5 overflow-x-auto pt-4 pb-1"
        style={{ scrollbarWidth: "none" }}
      >
        {slots.map((slot, index) => {
          const isSelected = selected === slot.key;
          const tickHeight = slot.yearLabel ? 16 : isSelected ? 12 : slot.hasData ? 8 : 6;
          const color = isSelected
            ? "var(--text-primary)"
            : slot.hasData
              ? "var(--text-secondary)"
              : "var(--text-muted)";
          return (
            <button
              key={slot.key}
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-label={slot.hasData ? `${slot.label} 저장작` : `${slot.label} 저장 없음`}
              onClick={() => {
                const resolved = resolveSnapIndex(slots, index);
                onSelect(resolved === slots.length ? null : slots[resolved].key);
              }}
              className="min-w-11 px-1 py-1 rounded-md active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
              style={{ color, background: isSelected ? "var(--surface)" : "transparent" }}
            >
              <div className="h-4 text-[10px] font-data text-muted">{slot.yearLabel ?? ""}</div>
              <div className="h-3 flex items-center justify-center">
                {slot.hasData && (
                  <span
                    className="block w-1.5 h-1.5 rounded-full"
                    style={{ background: isSelected ? "var(--accent)" : "var(--text-secondary)" }}
                  />
                )}
              </div>
              <div className="h-4 flex items-start justify-center">
                <span
                  className="block w-px rounded-full"
                  style={{ height: tickHeight, background: isSelected ? "var(--accent)" : "var(--border-strong)" }}
                />
              </div>
              <div className="text-[11px] font-data whitespace-nowrap">
                {slot.month}월
              </div>
            </button>
          );
        })}
        <div className="w-px h-9 my-auto mx-1 bg-border-subtle shrink-0" aria-hidden />
        <button
          type="button"
          role="tab"
          aria-selected={selected === null}
          aria-label="전체 월"
          onClick={() => onSelect(null)}
          className="min-w-14 px-3 py-2 rounded-md text-xs whitespace-nowrap active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
          style={{
            color: selected === null ? "var(--text-primary)" : "var(--text-secondary)",
            background: selected === null ? "var(--surface)" : "transparent",
            fontWeight: selected === null ? 700 : 500,
          }}
        >
          전체
        </button>
      </div>
      {selected !== null && (
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="ml-5 mt-0.5 text-[11px] text-muted underline underline-offset-4 active:scale-95"
        >
          {monthLabelOf(selected)} 해제
        </button>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { IconClose, IconCheck } from "@/components/Icons";
import { getOTTIcon } from "@/lib/ott-links";

type SortBy = "saved" | "title" | "rating";

const SORT_OPTIONS: { key: SortBy; label: string; desc: string }[] = [
  { key: "saved", label: "저장순", desc: "최근 저장한 작품 먼저" },
  { key: "title", label: "가나다순", desc: "제목 오름차순" },
  { key: "rating", label: "평점순", desc: "평점 높은 작품 먼저" },
];

type Props = {
  open: boolean;
  onClose: () => void;
  ottFilter: string | null;
  setOttFilter: (v: string | null) => void;
  groupByOTT: boolean;
  setGroupByOTT: (v: boolean) => void;
  availableOTTs: { name: string; count: number }[];
  sortBy: SortBy;
  setSortBy: (v: SortBy) => void;
};

const ANIM_MS = 240;

export default function SavedFilterSheet({
  open,
  onClose,
  ottFilter,
  setOttFilter,
  groupByOTT,
  setGroupByOTT,
  availableOTTs,
  sortBy,
  setSortBy,
}: Props) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect --
       정통 enter/exit animation 패턴 (mount → RAF → visible → unmount).
       sync setState 가 enter/exit transition 의 시작점이라 useEffect 외부
       이동 불가. open prop 이 user 토글이라 실질적으로 이벤트 핸들러. */
    if (open) {
      setMounted(true);
      const r = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(r);
    }
    setVisible(false);
    const t = setTimeout(() => setMounted(false), ANIM_MS);
    return () => clearTimeout(t);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted) return null;
  if (typeof document === "undefined") return null;

  const hasActive = ottFilter !== null || groupByOTT || sortBy !== "saved";
  const groupDisabled = ottFilter !== null;

  // template.tsx 의 animate-tab-slide wrapper 가 stacking context 를 만들어
  // 일반 fixed z-50 으로는 BottomNav 위로 나가지 못함 → body 로 portal.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      aria-modal="true"
      role="dialog"
      aria-label="필터"
      style={{ touchAction: "none" }}
      onTouchMove={(e) => e.stopPropagation()}
    >
      <div
        className="absolute inset-0 bg-overlay-heavy"
        onClick={onClose}
        aria-hidden
        style={{
          opacity: visible ? 1 : 0,
          transition: `opacity ${ANIM_MS}ms ease`,
        }}
      />
      <div
        className="relative w-full max-w-md rounded-t-2xl"
        style={{
          background: "var(--surface)",
          borderTop: "1px solid var(--border-subtle)",
          maxHeight: "75vh",
          transform: visible ? "translateY(0)" : "translateY(100%)",
          transition: `transform ${ANIM_MS}ms cubic-bezier(0.34, 1.3, 0.64, 1)`,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div className="flex justify-center pt-3 pb-1" aria-hidden>
          <div
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              background: "var(--border-strong)",
            }}
          />
        </div>

        <div className="flex items-center justify-between px-5 h-12 shrink-0">
          <h2
            className="font-display"
            style={{
              fontSize: 18,
              fontWeight: 600,
              color: "var(--text-primary)",
              letterSpacing: "-0.01em",
            }}
          >
            필터
          </h2>
          <div className="flex items-center gap-1">
            {hasActive && (
              <button
                type="button"
                onClick={() => {
                  setOttFilter(null);
                  setGroupByOTT(false);
                  setSortBy("saved");
                }}
                className="text-xs px-2 h-11 active:scale-95 transition-transform focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none rounded-md"
                style={{ color: "var(--text-secondary)", fontWeight: 500 }}
              >
                초기화
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="필터 닫기"
              className="w-11 h-11 flex items-center justify-center -mr-3 active:scale-90 transition-transform focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none rounded-md"
            >
              <IconClose size={18} color="var(--text-muted)" />
            </button>
          </div>
        </div>

        <div
          className="px-5 pb-6 overflow-y-auto"
          style={{ flex: 1, scrollbarWidth: "none" }}
        >
          {availableOTTs.length > 0 && (
            <section className="pt-3 pb-2">
              <div
                className="font-data uppercase mb-1"
                style={{
                  fontSize: 10,
                  letterSpacing: "0.12em",
                  color: "var(--text-secondary)",
                }}
              >
                OTT
              </div>
              <ul className="flex flex-col">
                <li>
                  <button
                    type="button"
                    onClick={() => setOttFilter(null)}
                    aria-pressed={ottFilter === null}
                    className="w-full flex items-center justify-between gap-3 py-3 px-1 active:scale-[0.99] transition-transform focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none rounded-md min-h-[44px]"
                  >
                    <span
                      className="text-sm"
                      style={{
                        color:
                          ottFilter === null
                            ? "var(--accent)"
                            : "var(--text-primary)",
                        fontWeight: ottFilter === null ? 600 : 500,
                      }}
                    >
                      전체
                    </span>
                    {ottFilter === null && (
                      <IconCheck size={16} color="var(--accent)" />
                    )}
                  </button>
                </li>
                {availableOTTs.map(({ name, count }) => {
                  const isActive = ottFilter === name;
                  const iconSrc = getOTTIcon(name);
                  return (
                    <li
                      key={name}
                      style={{
                        borderTop: "1px solid var(--border-subtle)",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setOttFilter(isActive ? null : name)}
                        aria-pressed={isActive}
                        aria-label={`${name} (${count}편) ${isActive ? "선택 해제" : "선택"}`}
                        className="w-full flex items-center justify-between gap-3 py-3 px-1 active:scale-[0.99] transition-transform focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none rounded-md min-h-[44px]"
                      >
                        <span className="flex items-center gap-2.5 min-w-0">
                          {iconSrc && (
                            <Image
                              src={iconSrc}
                              alt=""
                              width={20}
                              height={20}
                              className="object-contain rounded-sm flex-shrink-0"
                              unoptimized
                            />
                          )}
                          <span
                            className="text-sm truncate"
                            style={{
                              color: isActive
                                ? "var(--accent)"
                                : "var(--text-primary)",
                              fontWeight: isActive ? 600 : 500,
                            }}
                          >
                            {name}
                          </span>
                          <span
                            className="font-data"
                            style={{
                              fontSize: 11,
                              color: "var(--text-muted)",
                            }}
                          >
                            {count}
                          </span>
                        </span>
                        {isActive && (
                          <IconCheck size={16} color="var(--accent)" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section
            className="pt-2 mt-2"
            style={{ borderTop: "1px solid var(--border-subtle)" }}
          >
            <div
              className="font-data uppercase mt-3 mb-1"
              style={{
                fontSize: 10,
                letterSpacing: "0.12em",
                color: "var(--text-secondary)",
              }}
            >
              정렬
            </div>
            <ul className="flex flex-col">
              {SORT_OPTIONS.map((opt, i) => {
                const isActive = sortBy === opt.key;
                return (
                  <li
                    key={opt.key}
                    style={
                      i > 0
                        ? { borderTop: "1px solid var(--border-subtle)" }
                        : undefined
                    }
                  >
                    <button
                      type="button"
                      onClick={() => setSortBy(opt.key)}
                      aria-pressed={isActive}
                      aria-label={`${opt.label} ${isActive ? "선택됨" : "선택"}`}
                      className="w-full flex items-center justify-between gap-3 py-3 px-1 active:scale-[0.99] transition-transform focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none rounded-md min-h-[44px]"
                    >
                      <span className="flex flex-col items-start min-w-0">
                        <span
                          className="text-sm"
                          style={{
                            color: isActive
                              ? "var(--accent)"
                              : "var(--text-primary)",
                            fontWeight: isActive ? 600 : 500,
                          }}
                        >
                          {opt.label}
                        </span>
                        <span
                          className="text-xs mt-0.5"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {opt.desc}
                        </span>
                      </span>
                      {isActive && (
                        <IconCheck size={16} color="var(--accent)" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <section
            className="pt-2 mt-2"
            style={{ borderTop: "1px solid var(--border-subtle)" }}
          >
            <div
              className="font-data uppercase mt-3 mb-1"
              style={{
                fontSize: 10,
                letterSpacing: "0.12em",
                color: "var(--text-secondary)",
              }}
            >
              보기 옵션
            </div>
            <button
              type="button"
              onClick={() => {
                if (groupDisabled) return;
                setGroupByOTT(!groupByOTT);
              }}
              aria-pressed={groupByOTT}
              aria-disabled={groupDisabled}
              className="w-full flex items-center justify-between gap-3 py-3 px-1 active:scale-[0.99] transition-transform focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none rounded-md min-h-[44px]"
              style={{ opacity: groupDisabled ? 0.5 : 1 }}
            >
              <div className="flex flex-col items-start min-w-0">
                <span
                  className="text-sm"
                  style={{
                    color: "var(--text-primary)",
                    fontWeight: 500,
                  }}
                >
                  OTT별로 그룹화
                </span>
                <span
                  className="text-xs mt-0.5"
                  style={{ color: "var(--text-muted)" }}
                >
                  {groupDisabled
                    ? "OTT 필터 활성 시 사용 불가"
                    : "각 OTT 섹션으로 묶어 표시"}
                </span>
              </div>
              <span
                aria-hidden
                className="flex-shrink-0"
                style={{
                  width: 36,
                  height: 22,
                  borderRadius: 11,
                  background: groupByOTT
                    ? "var(--accent)"
                    : "var(--surface-raised)",
                  border: `1px solid ${groupByOTT ? "var(--accent)" : "var(--border)"}`,
                  position: "relative",
                  transition: "background 200ms ease, border-color 200ms ease",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 2,
                    left: groupByOTT ? 16 : 2,
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    background: "white",
                    transition: "left 200ms ease",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
                  }}
                />
              </span>
            </button>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}

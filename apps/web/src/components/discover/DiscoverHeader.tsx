"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { IconSearch } from "@/components/Icons";

/**
 * DiscoverHeader — discover 페이지 상단.
 *
 * 책임:
 * - 로고 표시
 * - persona 전환 chip + dropdown (createPortal 로 body 마운트 — 위임 P #2: 헤더 wrapper
 *   `overflow:hidden` 의 dropdown clipping 회피)
 * - 검색 버튼
 *
 * state 자체 (personaOpen, switchPersona 등) 는 부모 page 에서 owned.
 * portal 좌표 계산 (chip rect 기준) 은 본 컴포넌트 내부에서 effect 로 처리.
 *
 * immersive 모드 (현재 false 고정, 향후 다른 트리거 도입 시 부활) 시 wrapper
 * opacity/maxHeight 처리는 부모가 결정 — 본 컴포넌트는 라이브 UI 만.
 */

type Persona = {
  id: string;
  name: string;
};

type PersonaContext = {
  personas: Persona[];
  activePersonaId: string | null;
  activePersona: Persona | null;
  switchPersona: (id: string) => void;
};

interface DiscoverHeaderProps {
  persona: PersonaContext;
  personaOpen: boolean;
  onPersonaToggle: (next: boolean) => void;
  /** persona dropdown 의 "+ 새 취향 추가" 클릭 시 라우팅 */
  onAddPersona: () => void;
  /** persona switch 시 부모 cleanup (rec abort, filter 리셋, topIdx 0 등) */
  onPersonaSwitch: (id: string) => void;
  onSearchOpen: () => void;
}

export default function DiscoverHeader({
  persona,
  personaOpen,
  onPersonaToggle,
  onAddPersona,
  onPersonaSwitch,
  onSearchOpen,
}: DiscoverHeaderProps) {
  // dropdown 좌표 — chipRef.getBoundingClientRect() + page 절댓값.
  const [chipRef, setChipRef] = useState<HTMLButtonElement | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    // setState 는 microtask 로 미뤄 react-hooks/set-state-in-effect 규칙 준수.
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      if (!personaOpen || !chipRef) {
        setDropdownPos(null);
        return;
      }
      const r = chipRef.getBoundingClientRect();
      // dropdown 가운데 정렬 + 6px 간격
      setDropdownPos({
        left: r.left + r.width / 2,
        top: r.bottom + 6,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [personaOpen, chipRef]);

  return (
    <div className="flex items-center justify-between px-5 py-3 shrink-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/neq-logo.png" alt="neq," className="h-5 object-contain" />
      {persona.personas.length > 1 && (
        <div className="relative">
          {/* 위임 K #1 (2026-05-02) — 페르소나 전환 chip.
              chip 스타일 (bg + border) + dot indicator + chevron. 활성 페르소나 이름은
              var(--accent) 로 강조하여 "현재 어떤 취향" 인지 명확히. */}
          <button
            ref={setChipRef}
            onClick={() => onPersonaToggle(!personaOpen)}
            aria-haspopup="listbox"
            aria-expanded={personaOpen}
            aria-label={`취향 전환: 현재 ${persona.activePersona?.name ?? "기본"} (${persona.personas.length}개 중)`}
            className="flex items-center gap-1.5 h-9 px-3 active:scale-95 transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2 rounded-full"
            style={{
              background: personaOpen ? "var(--accent-dim)" : "var(--surface)",
              border: `1px solid ${personaOpen ? "var(--accent-border)" : "var(--border-subtle)"}`,
            }}
          >
            <span
              aria-hidden="true"
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: "var(--accent)" }}
            />
            <span
              className="text-xs font-medium"
              style={{
                color: personaOpen ? "var(--accent)" : "var(--text-primary)",
                transition: "color 150ms var(--ease-enter)",
              }}
            >
              {persona.activePersona?.name ?? "기본"}
            </span>
            <svg
              width="9"
              height="9"
              viewBox="0 0 8 8"
              fill="none"
              aria-hidden="true"
              style={{
                transform: personaOpen ? "rotate(180deg)" : "none",
                transition: "transform 150ms var(--ease-enter)",
                opacity: 0.6,
              }}
            >
              <path
                d="M1 2.5L4 5.5L7 2.5"
                stroke={personaOpen ? "var(--accent)" : "var(--text-muted)"}
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          {/* 위임 P #2 — dropdown 을 createPortal 로 body 에 직접 마운트해
              헤더 wrapper 의 overflow:hidden clipping 회피. */}
          {personaOpen && dropdownPos && typeof document !== "undefined" &&
            createPortal(
              <>
                <div
                  className="fixed inset-0"
                  style={{ zIndex: 60 }}
                  onClick={() => onPersonaToggle(false)}
                  aria-hidden="true"
                />
                <div
                  role="listbox"
                  aria-label="취향 목록"
                  className="fixed min-w-[200px] py-1.5 rounded-xl"
                  style={{
                    left: dropdownPos.left,
                    top: dropdownPos.top,
                    transform: "translateX(-50%)",
                    zIndex: 61,
                    background: "var(--surface-raised)",
                    border: "1px solid var(--border)",
                    boxShadow: "var(--shadow-lg)",
                    animation: "fade-in 150ms var(--ease-enter)",
                  }}
                >
                  <div
                    className="px-4 pt-1 pb-1.5 text-[10px] uppercase tracking-wider font-data"
                    style={{ color: "var(--text-muted)", letterSpacing: "0.12em" }}
                  >
                    취향 전환
                  </div>
                  {persona.personas.map((p) => (
                    <button
                      key={p.id}
                      role="option"
                      aria-selected={p.id === persona.activePersonaId}
                      onClick={() => {
                        if (p.id !== persona.activePersonaId) {
                          onPersonaSwitch(p.id);
                        }
                        onPersonaToggle(false);
                      }}
                      className="w-full flex items-center px-4 h-12 text-sm active:scale-[0.98] transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:-outline-offset-2"
                      style={{
                        color: p.id === persona.activePersonaId ? "var(--accent)" : "var(--text-primary)",
                        background: p.id === persona.activePersonaId ? "var(--accent-dim)" : "transparent",
                      }}
                    >
                      {p.name}
                      {p.id === persona.activePersonaId && (
                        <svg className="ml-auto" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  ))}
                  <div
                    className="my-1 mx-4 h-px"
                    style={{ background: "var(--border-subtle)" }}
                    aria-hidden="true"
                  />
                  {persona.personas.length < 3 ? (
                    <button
                      onClick={() => {
                        onPersonaToggle(false);
                        onAddPersona();
                      }}
                      className="w-full flex items-center px-4 h-11 text-xs active:scale-[0.98] transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:-outline-offset-2"
                      style={{ color: "var(--text-muted)" }}
                    >
                      + 새 취향 추가
                    </button>
                  ) : (
                    <div className="px-4 py-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
                      최대 3개까지 만들 수 있어요
                    </div>
                  )}
                </div>
              </>,
              document.body,
            )}
        </div>
      )}
      <button
        onClick={onSearchOpen}
        aria-label="검색 열기"
        className="w-11 h-11 flex items-center justify-center active:scale-90 transition-transform focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none rounded-md"
      >
        <IconSearch size={18} color="var(--text-muted)" />
      </button>
    </div>
  );
}

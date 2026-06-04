"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { IconCheck, IconClose } from "@/components/Icons";
import { FALLBACK_FAVORITES } from "@neq/core";

/**
 * NewPersonaSheet — Profile 페이지의 "새 취향 추가" 바텀시트.
 *
 * 책임:
 * - 취향 이름 입력
 * - mini search (디바운스 300ms) + selected (max 5)
 * - trending fetch fallback (빈 query 시)
 * - 다른 작품 보기 (재추천)
 * - 생성 confirm (이름 + 3개 이상 선택 시 활성)
 *
 * state owner: 본 컴포넌트 (open 시 mount, close 시 unmount → state 자동 리셋).
 * 외부 dependency: onSubmit (이름 + 선택된 작품 → persona 생성), onClose.
 *
 * 분할 전 page.tsx 안에 inline 으로 있던 모든 mini search state 를 캡슐화.
 */

export interface MiniSearchResult {
  id: number;
  title: string;
  posterUrl: string | null;
  year: string;
}

const MINI_FALLBACK: MiniSearchResult[] = [...FALLBACK_FAVORITES];

interface NewPersonaSheetProps {
  onClose: () => void;
  onSubmit: (name: string, items: MiniSearchResult[]) => void;
}

export default function NewPersonaSheet({ onClose, onSubmit }: NewPersonaSheetProps) {
  const [newName, setNewName] = useState("");
  const [miniQuery, setMiniQuery] = useState("");
  const [miniResults, setMiniResults] = useState<MiniSearchResult[]>([]);
  const [miniSelected, setMiniSelected] = useState<MiniSearchResult[]>([]);
  const [miniSuggestions, setMiniSuggestions] = useState<MiniSearchResult[]>(MINI_FALLBACK);
  const [miniSearching, setMiniSearching] = useState(false);
  const [miniLoadingSuggestions, setMiniLoadingSuggestions] = useState(false);
  const miniTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sheetTouchRef = useRef<{ startY: number; currentY: number } | null>(null);

  const fetchMiniTrending = useCallback(async () => {
    setMiniLoadingSuggestions(true);
    try {
      const res = await fetch("/api/trending");
      const data = await res.json();
      if (data.length > 0) setMiniSuggestions(data);
    } catch { /* fallback */ }
    setMiniLoadingSuggestions(false);
  }, []);

  // mount 시 trending 1회 fetch.
  // setState 는 microtask 로 미뤄 react-hooks/set-state-in-effect 규칙 준수
  // (fetchMiniTrending 의 sync 부분도 effect body 밖으로 분리).
  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) void fetchMiniTrending();
    });
    return () => {
      cancelled = true;
    };
  }, [fetchMiniTrending]);

  const miniSearch = useCallback(async (q: string) => {
    if (q.length < 1) { setMiniResults([]); return; }
    setMiniSearching(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) { setMiniResults([]); setMiniSearching(false); return; }
      const data = await res.json();
      setMiniResults(Array.isArray(data) ? data : []);
    } catch { setMiniResults([]); }
    setMiniSearching(false);
  }, []);

  const handleMiniInput = (value: string) => {
    setMiniQuery(value);
    if (miniTimerRef.current) clearTimeout(miniTimerRef.current);
    miniTimerRef.current = setTimeout(() => miniSearch(value), 300);
  };

  const toggleMiniSelect = (item: MiniSearchResult) => {
    if (miniSelected.some((s) => s.id === item.id)) {
      setMiniSelected(miniSelected.filter((s) => s.id !== item.id));
    } else if (miniSelected.length < 5) {
      setMiniSelected([...miniSelected, item]);
    }
  };

  const handleSubmit = () => {
    if (newName.trim().length === 0 || miniSelected.length < 3) return;
    onSubmit(newName.trim(), miniSelected);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "var(--bg-overlay-heavy)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-persona-title"
    >
      <div
        className="w-full max-w-lg rounded-t-2xl flex flex-col animate-slide-up"
        style={{
          background: "var(--surface)",
          maxHeight: "80vh",
        }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => {
          sheetTouchRef.current = { startY: e.touches[0].clientY, currentY: e.touches[0].clientY };
        }}
        onTouchMove={(e) => {
          if (sheetTouchRef.current) sheetTouchRef.current.currentY = e.touches[0].clientY;
        }}
        onTouchEnd={() => {
          if (sheetTouchRef.current) {
            const dy = sheetTouchRef.current.currentY - sheetTouchRef.current.startY;
            if (dy > window.innerHeight * 0.3) onClose();
            sheetTouchRef.current = null;
          }
        }}
      >
        <div className="w-10 h-1 rounded-full mx-auto mt-2 mb-3" style={{ background: "var(--border)" }} />
        <div className="px-5 pb-3 shrink-0">
          <h3 id="new-persona-title" className="font-display text-lg font-bold">새 취향 추가</h3>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="이 취향의 이름은?"
            maxLength={12}
            className="w-full px-4 py-3 mt-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] transition-colors bg-surface-sunken border border-border rounded-lg text-foreground text-sm"
          />
          {miniSelected.length > 0 && (
            <div className="flex gap-2 mt-3">
              {miniSelected.map((item) => (
                <button key={item.id} onClick={() => toggleMiniSelect(item)} className="flex-shrink-0 relative">
                  {item.posterUrl ? (
                    <Image src={item.posterUrl} alt={item.title} width={44} height={64} className="object-cover rounded-md" sizes="44px" />
                  ) : (
                    <div className="w-11 h-16 flex items-center justify-center text-xs bg-surface rounded-md text-muted">{item.title.slice(0, 2)}</div>
                  )}
                  <div className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center bg-danger rounded-full">
                    <IconClose size={8} color="var(--text-primary)" />
                  </div>
                </button>
              ))}
            </div>
          )}
          <input
            type="text"
            value={miniQuery}
            onChange={(e) => handleMiniInput(e.target.value)}
            placeholder="작품을 검색하세요"
            className="w-full px-4 py-3 mt-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] transition-colors bg-surface-sunken border border-border rounded-lg text-foreground text-sm"
          />
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5">
          {miniSearching && <div className="text-center py-4 text-muted text-sm">검색 중...</div>}
          {miniQuery.length === 0 && miniResults.length === 0 && (
            <div>
              <p className="text-xs text-muted mb-2">이런 작품은 어때요?</p>
              <div className="grid grid-cols-2 gap-2" style={{ gridAutoRows: "auto" }}>
                {miniSuggestions.slice(0, 8).map((item, i) => {
                  const isSelected = miniSelected.some((s) => s.id === item.id);
                  const isLarge = i % 3 === 0;
                  return (
                    <button
                      key={item.id}
                      onClick={() => toggleMiniSelect(item)}
                      className={`relative overflow-hidden transition-all active:scale-95 rounded-md${isLarge ? " col-span-2" : ""}`}
                      style={{
                        outline: isSelected ? "2px solid var(--accent)" : "none",
                        outlineOffset: "-2px",
                        aspectRatio: isLarge ? "4/3" : "2/3",
                      }}
                    >
                      {item.posterUrl ? (
                        <Image src={item.posterUrl} alt={item.title} fill className="object-cover" sizes="(max-width: 480px) 33vw, 120px" />
                      ) : (
                        <div className="w-full h-full bg-surface" />
                      )}
                      <div className="absolute bottom-0 left-0 right-0 p-1" style={{ background: "linear-gradient(transparent, var(--bg-overlay-heavy))" }}>
                        <div className="text-xs truncate">{item.title}</div>
                      </div>
                      {isSelected && (
                        <div className="absolute top-1 right-1 w-4 h-4 flex items-center justify-center bg-accent rounded-full">
                          <IconCheck size={10} color="var(--bg)" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={fetchMiniTrending}
                disabled={miniLoadingSuggestions}
                className="w-full mt-3 py-2 min-h-[44px] text-xs font-medium transition-colors disabled:opacity-30 text-muted active:scale-[0.98]"
              >
                {miniLoadingSuggestions ? "로딩..." : "다른 작품 보기"}
              </button>
            </div>
          )}
          {miniResults.map((item) => {
            const isSelected = miniSelected.some((s) => s.id === item.id);
            return (
              <button
                key={item.id}
                onClick={() => toggleMiniSelect(item)}
                className="w-full flex items-center gap-3 p-2.5 transition-colors rounded-lg"
                style={{
                  background: isSelected ? "var(--accent-dim)" : "transparent",
                  border: isSelected ? "1px solid var(--accent-border)" : "1px solid transparent",
                }}
              >
                {item.posterUrl ? (
                  <Image src={item.posterUrl} alt={item.title} width={40} height={60} className="object-cover flex-shrink-0 rounded-md" sizes="40px" />
                ) : (
                  <div className="w-10 h-15 flex-shrink-0 bg-surface rounded-md" />
                )}
                <div className="text-left flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{item.title}</div>
                  <div className="text-xs text-muted">{item.year}</div>
                </div>
                {isSelected && <IconCheck size={16} color="var(--accent)" />}
              </button>
            );
          })}
        </div>
        <div className="px-5 pb-6 pt-3 shrink-0" style={{ background: "linear-gradient(transparent, var(--surface) 30%)" }}>
          <button
            onClick={handleSubmit}
            disabled={newName.trim().length === 0 || miniSelected.length < 3}
            className="w-full py-3.5 text-sm font-semibold transition-all active:scale-[0.98] rounded-lg"
            style={{
              background: newName.trim().length > 0 && miniSelected.length >= 3 ? "var(--accent)" : "var(--surface-raised)",
              color: newName.trim().length > 0 && miniSelected.length >= 3 ? "var(--bg)" : "var(--text-muted)",
              cursor: newName.trim().length > 0 && miniSelected.length >= 3 ? "pointer" : "not-allowed",
            }}
          >
            {miniSelected.length < 3
              ? `${3 - miniSelected.length}개만 더 골라주세요`
              : "취향 추가하기"}
          </button>
        </div>
      </div>
    </div>
  );
}

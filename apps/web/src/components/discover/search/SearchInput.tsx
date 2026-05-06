"use client";

/**
 * SearchInput — 검색 입력 영역 (input + clear + voice + 취소).
 *
 * 책임: 텍스트 입력 / clear 버튼 / 음성 인식 토글 / "취소" 버튼.
 * fetch / debounce 책임 X — 부모 (SearchSheet) 가 onChange 콜백으로 받아 처리.
 *
 * voice 시각/접근성 동작:
 *   - voiceSupported=false → mic 버튼 미노출
 *   - listening=true → mic 배경 amber-active + aria-pressed=true
 */

import { forwardRef } from "react";

interface SearchInputProps {
  query: string;
  voiceSupported: boolean;
  listening: boolean;
  onChange: (value: string) => void;
  onClear: () => void;
  onMicClick: () => void;
  onClose: () => void;
}

const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  function SearchInput(
    {
      query,
      voiceSupported,
      listening,
      onChange,
      onClear,
      onMicClick,
      onClose,
    },
    ref,
  ) {
    return (
      <div className="flex items-center gap-2 px-4 pb-3 shrink-0">
        <div className="flex-1 relative">
          <input
            ref={ref}
            type="text"
            value={query}
            onChange={(e) => onChange(e.target.value)}
            placeholder="작품, 감독, 배우"
            aria-label="검색"
            className="w-full px-4 py-3 pr-20 text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] transition-colors bg-surface border border-border rounded-lg text-foreground"
            style={{ fontSize: "16px" }}
          />
          {query.length > 0 && (
            <button
              onClick={onClear}
              aria-label="검색어 지우기"
              className="absolute right-10 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full active:scale-90 transition-transform focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none focus-visible:ring-offset-1"
              style={{
                background: "var(--text-muted)",
                color: "var(--surface)",
              }}
            >
              <svg
                width={10}
                height={10}
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
          )}
          {voiceSupported && (
            <button
              onClick={onMicClick}
              aria-label={listening ? "음성 인식 중지" : "음성으로 검색"}
              aria-pressed={listening}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-full active:scale-90 transition-all focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
              style={{
                background: listening ? "var(--accent)" : "transparent",
                color: listening
                  ? "var(--surface)"
                  : "var(--text-muted)",
              }}
            >
              <svg
                width={14}
                height={16}
                viewBox="0 0 12 14"
                fill="none"
              >
                <rect
                  x="3"
                  y="0.5"
                  width="6"
                  height="9"
                  rx="3"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  fill={listening ? "currentColor" : "none"}
                />
                <path
                  d="M1 7C1 9.76142 3.23858 12 6 12V13.5M11 7C11 9.76142 8.76142 12 6 12"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="검색 닫기"
          className="shrink-0 px-3 py-3 text-sm text-muted active:scale-95 transition-transform focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none rounded-md"
        >
          취소
        </button>
      </div>
    );
  },
);

export default SearchInput;

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconDiscover, IconBookmark, IconSearch } from "./Icons";
import { track } from "@/lib/analytics";
import { emitSearchOpen } from "@/lib/search-trigger";
import type { ComponentType } from "react";

type TabKey = "discover" | "saved" | "search";
type TabIconProps = { size?: number; color?: string; className?: string; active?: boolean };

// 2026-08-12 — 3번째 슬롯을 Profile → Search 로 교체 (프로필은 각 화면 헤더 우상단
// 버튼으로 이동). 핸드오프(_design-handoff/Phase 4)의 4탭 중 Search 슬롯이 이제
// 코드에도 존재하지만, 라우트가 아니라 현재 화면의 SearchSheet 를 여는 트리거다
// (href 없음 → button 렌더). Saved 탭 아이콘은 핸드오프 정본대로 Bookmark.
const TABS: ReadonlyArray<{ key: TabKey; href?: string; label: string; Icon: ComponentType<TabIconProps>; aria: string }> = [
  { key: "discover", href: "/discover", label: "Discover", Icon: IconDiscover, aria: "Discover — 추천 작품 탐색" },
  { key: "saved", href: "/saved", label: "Saved", Icon: IconBookmark, aria: "Saved — 저장한 작품" },
  { key: "search", label: "Search", Icon: IconSearch, aria: "검색" },
];

const PATH_TO_TAB: Record<string, TabKey> = {
  "/discover": "discover",
  "/saved": "saved",
};

/**
 * BottomNav — 탭 전환 fade only (slide 제거).
 *
 * 모션 (motion-demos.jsx #6):
 *   - 색상 transition 250ms cubic-bezier(0.4, 0, 0.2, 1) (--ease-soft)
 *   - 활성 탭 indicator: 하단 2px bar, opacity 1 / 0 — slide 없음
 *   - prefers-reduced-motion: globals.css 글로벌 rule이 transition 즉시 종료
 *
 * active 는 usePathname 으로 자동 결정 (template.tsx 가 마운트 위치를 통제하므로
 * page 별 prop 전달 불필요). 탭 라우트 외에서는 마운트되지 않음.
 */
export default function BottomNav() {
  const pathname = usePathname();
  const active = pathname ? PATH_TO_TAB[pathname] : undefined;

  return (
    <nav
      aria-label="메인 네비게이션"
      className="flex pb-6 pt-2 shrink-0"
      style={{ borderTop: "1px solid var(--border)", touchAction: "manipulation" }}
    >
      {TABS.map(({ key, href, label, Icon, aria }) => {
        const isActive = active === key;
        const slotClass =
          "flex-1 flex flex-col items-center gap-0.5 py-2 text-xs focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none rounded-md relative";
        const slotStyle = {
          color: isActive ? "var(--accent)" : "var(--text-muted)",
          // fade only — color crossfade via --ease-soft
          transition:
            "color var(--duration-moderate, 250ms) var(--ease-soft, cubic-bezier(0.4, 0, 0.2, 1))",
        };
        const content = (
          <>
            <span className="active:scale-95 transition-transform">
              <Icon size={20} active={isActive} />
            </span>
            <span>{label}</span>
            {/* 활성 indicator — fade only (translate/scale 없음) */}
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                bottom: -2,
                left: "50%",
                transform: "translateX(-50%)",
                width: 16,
                height: 2,
                borderRadius: 1,
                background: "var(--accent)",
                opacity: isActive ? 1 : 0,
                transition:
                  "opacity var(--duration-moderate, 250ms) var(--ease-soft, cubic-bezier(0.4, 0, 0.2, 1))",
              }}
            />
          </>
        );

        // 2026-08-12 — href 없는 슬롯(검색)은 화면 전환이 아니라 현재 화면의
        // SearchSheet 를 여는 트리거. search_opened 는 진입점이 여기 하나로
        // 합쳐졌으므로 여기서만 발사한다 (기존엔 3개 화면 헤더 버튼이 각자 호출).
        if (!href) {
          return (
            <button
              key={key}
              type="button"
              aria-label={aria}
              className={slotClass}
              style={slotStyle}
              onClick={() => {
                track("search_opened");
                emitSearchOpen();
              }}
            >
              {content}
            </button>
          );
        }

        return (
          <Link
            key={key}
            href={href}
            prefetch={true}
            aria-label={aria}
            aria-current={isActive ? "page" : undefined}
            className={slotClass}
            style={slotStyle}
          >
            {content}
          </Link>
        );
      })}
    </nav>
  );
}

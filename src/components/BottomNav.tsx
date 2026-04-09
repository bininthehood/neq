"use client";

import Link from "next/link";
import { IconDiscover, IconHeart } from "./Icons";

interface Props {
  active: "discover" | "saved";
}

export default function BottomNav({ active }: Props) {
  return (
    <nav
      aria-label="메인 네비게이션"
      className="flex pb-6 pt-2 shrink-0"
      style={{ borderTop: "1px solid var(--border)", touchAction: "manipulation" }}
    >
      <Link
        href="/discover"
        aria-label="Discover — 추천 작품 탐색"
        aria-current={active === "discover" ? "page" : undefined}
        className="flex-1 flex flex-col items-center gap-0.5 py-2 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none rounded-md"
        style={{ color: active === "discover" ? "var(--accent)" : "var(--text-muted)" }}
      >
        <span className="active:scale-90 transition-transform"><IconDiscover size={20} /></span>
        <span>Discover</span>
      </Link>
      <Link
        href="/saved"
        aria-label="Saved — 저장한 작품"
        aria-current={active === "saved" ? "page" : undefined}
        className="flex-1 flex flex-col items-center gap-0.5 py-2 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none rounded-md"
        style={{ color: active === "saved" ? "var(--accent)" : "var(--text-muted)" }}
      >
        <span className="active:scale-90 transition-transform"><IconHeart size={20} /></span>
        <span>Saved</span>
      </Link>
    </nav>
  );
}

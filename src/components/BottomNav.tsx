"use client";

import Link from "next/link";
import { IconDiscover, IconHeart } from "./Icons";

interface Props {
  active: "discover" | "saved";
}

export default function BottomNav({ active }: Props) {
  return (
    <nav
      className="flex pb-6 pt-2 shrink-0"
      style={{ borderTop: "1px solid var(--border)", touchAction: "manipulation" }}
    >
      <Link
        href="/discover"
        className="flex-1 flex flex-col items-center gap-0.5 py-2 text-xs transition-colors"
        style={{ color: active === "discover" ? "var(--accent)" : "var(--text-muted)" }}
      >
        <span className="active:scale-90 transition-transform"><IconDiscover size={20} /></span>
        <span>Discover</span>
      </Link>
      <Link
        href="/saved"
        className="flex-1 flex flex-col items-center gap-0.5 py-2 text-xs transition-colors"
        style={{ color: active === "saved" ? "var(--accent)" : "var(--text-muted)" }}
      >
        <span className="active:scale-90 transition-transform"><IconHeart size={20} /></span>
        <span>Saved</span>
      </Link>
    </nav>
  );
}

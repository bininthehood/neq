"use client";

import Link from "next/link";
import { IconDiscover, IconHeart, IconUser } from "./Icons";

interface Props {
  active: "discover" | "saved" | "profile";
}

const TABS = [
  { key: "discover" as const, href: "/discover", label: "Discover", Icon: IconDiscover, aria: "Discover — 추천 작품 탐색" },
  { key: "saved" as const, href: "/saved", label: "Saved", Icon: IconHeart, aria: "Saved — 저장한 작품" },
  { key: "profile" as const, href: "/profile", label: "Profile", Icon: IconUser, aria: "Profile — 내 정보" },
];

export default function BottomNav({ active }: Props) {
  return (
    <nav
      aria-label="메인 네비게이션"
      className="flex pb-6 pt-2 shrink-0"
      style={{ borderTop: "1px solid var(--border)", touchAction: "manipulation" }}
    >
      {TABS.map(({ key, href, label, Icon, aria }) => (
        <Link
          key={key}
          href={href}
          aria-label={aria}
          aria-current={active === key ? "page" : undefined}
          className="flex-1 flex flex-col items-center gap-0.5 py-2 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none rounded-md"
          style={{ color: active === key ? "var(--accent)" : "var(--text-muted)" }}
        >
          <span className="active:scale-90 transition-transform"><Icon size={20} /></span>
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}

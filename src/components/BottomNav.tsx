"use client";

import Link from "next/link";

interface Props {
  active: "discover" | "saved";
}

export default function BottomNav({ active }: Props) {
  return (
    <nav className="flex border-t border-zinc-800 pb-6 pt-2 shrink-0">
      <Link
        href="/discover"
        className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-xs ${
          active === "discover" ? "text-white" : "text-zinc-600"
        }`}
      >
        <span className="text-lg">◆</span>
        <span>Discover</span>
      </Link>
      <Link
        href="/saved"
        className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-xs ${
          active === "saved" ? "text-white" : "text-zinc-600"
        }`}
      >
        <span className="text-lg">♡</span>
        <span>Saved</span>
      </Link>
    </nav>
  );
}

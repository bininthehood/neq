import Link from "next/link";

export default function NotFound() {
  return (
    <div
      className="h-dvh flex flex-col items-center justify-center px-8 max-w-lg mx-auto"
      style={{ background: "var(--bg)", color: "var(--text-primary)" }}
    >
      <div className="font-display text-[3rem] font-bold" style={{ color: "var(--accent)" }}>
        404
      </div>
      <p className="mt-3 text-lg font-display font-semibold">
        페이지를 찾을 수 없어요
      </p>
      <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
        찾으시는 페이지가 존재하지 않거나 이동되었어요.
      </p>
      <Link
        href="/discover"
        className="mt-8 px-6 py-3 text-sm font-semibold active:scale-95 transition-transform"
        style={{
          background: "var(--accent)",
          color: "var(--bg)",
          borderRadius: "var(--radius-full)",
        }}
      >
        Discover로 돌아가기
      </Link>
    </div>
  );
}

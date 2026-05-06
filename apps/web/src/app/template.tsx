"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Root template — 탭 라우트 전환 시 좌/우 슬라이드 애니메이션.
 *
 * 명세 (handoff Phase 4 - Full Prototype.html L302~308, L356~364):
 *   - 탭 인덱스가 증가 (Discover→Saved→Profile) = slide-in-right (translateX 40 → 0, opacity 0 → 1)
 *   - 탭 인덱스가 감소 = slide-in-left (translateX -40 → 0, opacity 0 → 1)
 *   - duration 280ms, easing cubic-bezier(0.32, 0.72, 0.24, 1) (= --ease-detail-morph)
 *
 * 적용 범위: /discover, /saved, /profile. 탭 외 페이지는 wrapper 없이 children 그대로 통과.
 *
 * 회귀 #1 (위임 M, 2026-05-02) root cause:
 *   - 이전 구현은 useState + useEffect 기반: effect 안에서 setAnimClass 로 클래스를 바꿈.
 *     그런데 template.tsx 는 navigation 마다 fresh instance 로 remount 되어 useRef(true) 의
 *     isFirstMount 가드가 항상 true 로 시작 → 매 navigation 첫 render 에서 첫 mount 분기로 빠져
 *     클래스가 절대 적용되지 않았음 (sessionStorage 는 정상 갱신, DOM 만 미적용).
 *   - 해결: render 시점에 sessionStorage 직접 읽기만 (read-only 라 StrictMode 이중 호출에도 멱등).
 *     sessionStorage 갱신은 useEffect 로 분리해 side effect 격리.
 *   - SSR-safe: 서버에선 sessionStorage 접근 불가지만 wrapper 자체는 항상 동일 className(빈
 *     animClass) 으로 첫 hydration. 첫 render 는 prev 없으므로 어차피 빈 문자열 → mismatch 0.
 *
 * prefers-reduced-motion: globals.css 의 글로벌 rule 이 animation-duration 0.01ms 강제.
 */

const TAB_ORDER: Record<string, number> = {
  "/discover": 0,
  "/saved": 1,
  "/profile": 2,
};

// /search 라우트 제거 후 3탭 구조로 환원. 기존 인덱스(0~3) 가 sessionStorage 에 남아있어도
// 새 범위(0~2) 와 다를 수 있음 — 한 번 잘못된 방향으로 슬라이드되고 자연 복원. 마이그레이션 불요.
const STORAGE_KEY = "neq:lastTabIdx";

/** sessionStorage 에서 prev 인덱스 읽기. SSR/private-mode 안전. */
function readPrevIdx(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed = parseInt(raw, 10);
    return Number.isNaN(parsed) ? null : parsed;
  } catch {
    return null;
  }
}

export default function RootTemplate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isTabRoute = pathname ? pathname in TAB_ORDER : false;

  // 탭 페이지가 아니면 wrapper 없이 children 그대로 — 레이아웃/포커스/스크롤 영향 0.
  // 탭 외 페이지 거치면 sessionStorage 그대로 두어 다음 탭 진입 시 prev 로 사용 (자연스러운 UX).
  // hooks 호출 후 early return 이 가능하도록 useEffect 는 항상 호출되어야 하지만,
  // 탭 외 페이지에선 effect 내부에서 no-op 처리 (조건부 hook 호출 방지).
  const currentIdx = pathname ? TAB_ORDER[pathname] : undefined;

  // render 시점에 prev 읽기. 매 render 동일 값 → StrictMode 이중 render 안전.
  // 갱신은 useEffect 로 격리 (read-only render).
  const prevIdx = readPrevIdx();

  useEffect(() => {
    if (currentIdx === undefined) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, String(currentIdx));
    } catch {
      // ignore
    }
  }, [currentIdx]);

  if (!isTabRoute || currentIdx === undefined) {
    return <>{children}</>;
  }

  // 첫 진입 (prev 없음) 또는 동일 탭 reload — 슬라이드 X.
  // 다른 탭에서 진입 — 인덱스 비교로 좌/우 결정.
  let animClass = "";
  if (prevIdx !== null && prevIdx !== currentIdx) {
    animClass = currentIdx > prevIdx ? "animate-tab-slide-right" : "animate-tab-slide-left";
  }

  return (
    <div key={pathname} className={`flex-1 min-h-0 flex flex-col ${animClass}`}>
      {children}
    </div>
  );
}

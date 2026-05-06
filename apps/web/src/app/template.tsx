"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import BottomNav from "@/components/BottomNav";

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
 *   - 이전 구현은 useState + useEffect + useRef(true) isFirstMount 가드 사용. template.tsx 는
 *     navigation 마다 fresh instance 로 remount → ref 매번 true 로 reset → 매 navigation 첫
 *     render 가 첫 mount 분기로 빠져 클래스가 절대 적용되지 않았음 (sessionStorage 갱신은 정상,
 *     DOM 만 미적용).
 *   - 해결: render 시점에 sessionStorage 직접 읽기. read-only 라 StrictMode 이중 render 안전.
 *     sessionStorage 갱신은 useEffect 로 분리.
 *
 * 회귀 #2 (2026-05-06) — animation 우선 trade-off:
 *   - render 시점 read 패턴은 SSR(빈 className) ↔ client 첫 render(sessionStorage prev 가
 *     있으면 슬라이드 클래스) 사이 hydration mismatch 1 건을 발생시킴.
 *   - useLayoutEffect + setState 로 mismatch 를 0 으로 만들면 첫 paint 가 final 위치에서 일어나
 *     animation 의 시작 위치(translateX 40 / opacity 0) 점프가 사용자 눈에 안 보임 → 슬라이드
 *     사실상 사라짐. SSR HTML 에 sessionStorage 가 없는 한 구조적 충돌이라 동시 만족 불가.
 *   - 결정: animation 우선. mismatch 1 건은 dev console only, prod 영향 0, 기능 영향 0.
 *     suppressHydrationWarning 은 React docs 명시상 patch up 안 하므로 무용 — 적용 안 함.
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

  // BottomNav 는 슬라이드 wrapper 밖 형제로 둠 — page content 만 슬라이드, 탭 바는 정지.
  return (
    <>
      <div key={pathname} className={`flex-1 min-h-0 flex flex-col ${animClass}`}>
        {children}
      </div>
      <BottomNav />
    </>
  );
}

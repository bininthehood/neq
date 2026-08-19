"use client";

/**
 * 하단 "검색" 탭 → 현재 화면의 SearchSheet 를 여는 트리거.
 *
 * 검색은 라우트가 아니라 각 페이지(discover / saved / profile)가 자체 마운트하는
 * sheet 다. 마운트를 한 곳으로 합치면 profile/page.tsx 경고대로 fetch race 회귀가
 * 나므로(사용자 보고), 탭은 화면 전환 대신 이 트리거만 쏘고 각 페이지가 자기 시트를
 * 연다. native `apps/native/lib/search-trigger.ts` 정합.
 *
 * native 는 탭이 lazy:false 로 pre-mount 되어 `useIsFocused` 로 구독을 좁혀야 했지만,
 * web 은 app router 가 한 번에 한 라우트만 마운트하므로 구독자는 항상 1개다.
 */
import { useEffect, useRef } from "react";

type Listener = () => void;

const listeners = new Set<Listener>();

export function emitSearchOpen(): void {
  listeners.forEach((listener) => listener());
}

export function useSearchTrigger(onOpen: () => void): void {
  const handler = useRef(onOpen);
  handler.current = onOpen;

  useEffect(() => {
    const listener = () => handler.current();
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
}

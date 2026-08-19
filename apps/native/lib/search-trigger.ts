/**
 * 하단 "검색" 탭 → 현재 포커스된 화면의 SearchSheet 를 여는 트리거.
 *
 * 검색은 라우트가 아니라 각 화면(index / saved / profile)이 자체 마운트하는 모달
 * 시트다. 마운트를 한 곳으로 합치면 profile.tsx 의 경고대로 fetch race 회귀가
 * 나므로(2026-06-01 사용자 보고), 탭은 화면 전환 대신 tabPress 를 가로채 이
 * 트리거만 쏘고 각 화면이 자기 시트를 연다.
 *
 * 포커스된 화면만 구독한다 — 가시 탭이 lazy:false 로 pre-mount 되어 있어
 * 무조건 구독하면 숨은 탭들의 시트까지 동시에 열린다.
 */
import { useEffect, useRef } from 'react';
import { useIsFocused } from '@react-navigation/native';

type Listener = () => void;

const listeners = new Set<Listener>();

export function emitSearchOpen(): void {
  listeners.forEach((listener) => listener());
}

export function useSearchTrigger(onOpen: () => void): void {
  const handler = useRef(onOpen);
  handler.current = onOpen;

  const focused = useIsFocused();

  useEffect(() => {
    if (!focused) return;
    const listener = () => handler.current();
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [focused]);
}

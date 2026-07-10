import { Image } from 'expo-image';

/**
 * 포스터 URL 을 디스크/메모리 캐시에 미리 적재 — 화면 전환·리스트 렌더 시점의
 * 이미지 팝인 방지. 데이터 fetch 응답이 도착한 시점(렌더 전)에 호출한다.
 * fire-and-forget: 실패해도 렌더 경로에 영향 없음 (expo-image 가 평소처럼 로드).
 */
export function prefetchPosters(
  urls: readonly (string | null | undefined)[],
  limit = 24,
) {
  const list = [...new Set(urls.filter((u): u is string => !!u))].slice(0, limit);
  if (list.length > 0) void Image.prefetch(list);
}

/**
 * Recommendation 공유 헬퍼.
 *
 * Discover/Saved/Search 의 DetailSheet 가 동일 동선을 쓰도록 통합.
 * navigator.share 지원 시 OS 시트, 미지원 시 clipboard 폴백. PostHog `card_shared` 발사.
 */

import type { Recommendation } from "./types";
import { track } from "./analytics";

export async function shareRecommendation(rec: Recommendation): Promise<void> {
  if (typeof window === "undefined") return;
  const shareUrl = `${window.location.origin}/share/${rec.tmdbId}?type=${rec.type}`;
  const providers = rec.providers.map((p) => p.name).join(", ");
  const body = [
    `🎬 ${rec.title}`,
    rec.reason,
    "",
    providers ? `📺 ${providers}` : null,
    `⭐ ${rec.rating.toFixed(1)}`,
    "",
    shareUrl,
  ]
    .filter((line) => line !== null)
    .join("\n");

  if (navigator.share) {
    try {
      await navigator.share({ title: rec.title, text: body, url: shareUrl });
      track("card_shared", { tmdb_id: rec.tmdbId, title: rec.title });
    } catch {
      // 사용자 취소 — 무시
    }
  } else {
    await navigator.clipboard.writeText(body);
    track("card_shared", { tmdb_id: rec.tmdbId, title: rec.title });
  }
}

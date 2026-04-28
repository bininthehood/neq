/**
 * Cron 인증 — `Authorization: Bearer <CRON_SECRET>` 헤더 검증.
 *
 * 본 프로젝트는 cron 실행을 GitHub Actions로 운영 (.github/workflows/notif-*.yml +
 * tmdb-providers-snapshot.yml). curl로 본 endpoint를 호출하며 Bearer 헤더 부착.
 * Vercel Cron도 동일 헤더 컨벤션으로 호환 (필요 시 vercel.json 추가만으로 작동).
 *
 * 로컬/admin 디버그도 동일 헤더로 호출 가능.
 * CRON_SECRET 미설정 시 모든 호출 401 (안전 default).
 */

import { getCronSecret } from "../env";

export function isAuthorizedCron(req: Request): boolean {
  const secret = getCronSecret();
  if (!secret) return false;

  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;

  // timing-safe 비교는 secret 길이가 다양해 단순 비교로 충분 (crypto.timingSafeEqual 은 동일 길이 요구)
  return auth === expected;
}

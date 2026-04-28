function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

// ─────────────────────────────────────────────
// 서버 전용 — 누락 시 throw
// ─────────────────────────────────────────────

export const TMDB_API_KEY = requireEnv("TMDB_API_KEY");
export const OPENAI_API_KEY = requireEnv("OPENAI_API_KEY");

// ─────────────────────────────────────────────
// Feature Flags — Onboarding V2
//
// 모두 NEXT_PUBLIC_* 라 client/server 양쪽에서 평가 가능.
// 기본값 false. 'true' 문자열일 때만 활성.
// 스펙: _workspace/onboarding-v2-spec.md §5
// ─────────────────────────────────────────────

function readFlag(name: string): boolean {
  // process.env.NEXT_PUBLIC_* 는 빌드 타임에 인라인되어야 하므로
  // 동적 키 접근(process.env[name])이 아닌 명시적 분기로 처리한다.
  // (Next.js의 환경변수 인라인 규칙)
  switch (name) {
    case "NEXT_PUBLIC_ONBOARDING_V2":
      return process.env.NEXT_PUBLIC_ONBOARDING_V2 === "true";
    case "NEXT_PUBLIC_TASTE_GENRES_ENABLED":
      return process.env.NEXT_PUBLIC_TASTE_GENRES_ENABLED === "true";
    case "NEXT_PUBLIC_OTT_WEAK_SIGNAL":
      return process.env.NEXT_PUBLIC_OTT_WEAK_SIGNAL === "true";
    case "NEXT_PUBLIC_NOTIFICATIONS_ENABLED":
      return process.env.NEXT_PUBLIC_NOTIFICATIONS_ENABLED === "true";
    case "NEXT_PUBLIC_SEARCH_GROUPED":
      return process.env.NEXT_PUBLIC_SEARCH_GROUPED === "true";
    default:
      return false;
  }
}

export function isOnboardingV2Enabled(): boolean {
  return readFlag("NEXT_PUBLIC_ONBOARDING_V2");
}

export function isTasteGenresEnabled(): boolean {
  return readFlag("NEXT_PUBLIC_TASTE_GENRES_ENABLED");
}

export function isOttWeakSignalEnabled(): boolean {
  return readFlag("NEXT_PUBLIC_OTT_WEAK_SIGNAL");
}

export function isNotificationsEnabled(): boolean {
  return readFlag("NEXT_PUBLIC_NOTIFICATIONS_ENABLED");
}

export function isSearchGroupedEnabled(): boolean {
  return readFlag("NEXT_PUBLIC_SEARCH_GROUPED");
}

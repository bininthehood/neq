function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

// ─────────────────────────────────────────────
// 서버 전용 — 누락 시 throw
//
// ⚠️ lazy getter로 export. 본 모듈은 클라이언트(use client) 코드에서도
// flag 함수(isTasteGenresEnabled 등) 때문에 import되는데, top-level에서
// requireEnv 를 평가하면 클라이언트 번들 module evaluation 시
// process.env.TMDB_API_KEY 가 비어 있어 throw 됨 (Day 21 회귀 fix).
// 함수로 감싸 호출 시점에만 평가되도록 함. server-only 사용처에서만 호출.
// ─────────────────────────────────────────────

export function getTmdbApiKey(): string {
  return requireEnv("TMDB_API_KEY");
}

export function getOpenaiApiKey(): string {
  return requireEnv("OPENAI_API_KEY");
}

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

// ─────────────────────────────────────────────
// VAPID — Web Push 서명용 키 (P0-4 알림 인프라)
//
// NEXT_PUBLIC_VAPID_PUBLIC_KEY 는 client + server 양쪽에서 사용 (구독 등록).
// VAPID_PRIVATE_KEY / VAPID_SUBJECT 는 서버 전용 (web-push.sendNotification).
// 미설정 시 isVapidConfigured() === false → sendPush 가 dry-run 으로 동작.
// 키 발급: `npx web-push generate-vapid-keys` (apps/web 루트)
// ─────────────────────────────────────────────

export const NEXT_PUBLIC_VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export function getVapidPrivateKey(): string {
  return process.env.VAPID_PRIVATE_KEY ?? "";
}

export function getVapidSubject(): string {
  return process.env.VAPID_SUBJECT ?? "mailto:dusgod30@gmail.com";
}

export function isVapidConfigured(): boolean {
  return Boolean(NEXT_PUBLIC_VAPID_PUBLIC_KEY && getVapidPrivateKey());
}

// ─────────────────────────────────────────────
// CRON_SECRET — Vercel Cron 인증 + admin 호출
//
// Vercel은 cron 호출 시 `Authorization: Bearer <CRON_SECRET>` 헤더를 자동 부착.
// 미설정 시 모든 cron 호출 401 (안전 default).
// ─────────────────────────────────────────────

export function getCronSecret(): string {
  return process.env.CRON_SECRET ?? "";
}

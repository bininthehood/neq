import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // dev에서는 비활성화
  enabled: process.env.NODE_ENV === "production",

  // 샘플링: 모든 에러 수집, 성능은 10%만
  tracesSampleRate: 0.1,

  // 콘솔 에러도 수집
  integrations: [Sentry.captureConsoleIntegration({ levels: ["error"] })],

  // PII 수집 안 함
  sendDefaultPii: false,
});

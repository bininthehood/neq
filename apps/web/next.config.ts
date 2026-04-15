import withSerwist from "@serwist/next";
import { withSentryConfig } from "@sentry/nextjs";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org",
      },
    ],
  },
};

const withPWA = withSerwist({
  swSrc: "src/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

export default withSentryConfig(withPWA(nextConfig), {
  // 소스맵 업로드 비활성화 (Sentry 계정 연결 전까지)
  sourcemaps: { disable: true },
  // 빌드 로그 숨김
  silent: true,
  // Telemetry 비활성화
  telemetry: false,
});

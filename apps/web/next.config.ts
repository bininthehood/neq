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
  async headers() {
    // Universal Link: iOS 는 `apple-app-site-association` 을 application/json 로만 인식.
    // Next.js public/ 정적 serving 은 확장자 없는 파일을 octet-stream 으로 응답하므로 강제.
    return [
      {
        source: "/.well-known/apple-app-site-association",
        headers: [{ key: "Content-Type", value: "application/json" }],
      },
    ];
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

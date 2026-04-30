import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import InstallBanner from "@/components/InstallBanner";
import Reminder from "@/components/Reminder";
import PostHogProvider from "@/components/PostHogProvider";
import { PersonaProvider } from "@/contexts/PersonaContext";
import { ToastProvider } from "@neq/design";

/**
 * Stage 4 D1 — fontsV2 전환:
 *   - display: Fraunces → Instrument Serif (큰 헤더 / hero / italic 액센트)
 *   - data: Outfit → Geist Mono (수치 tabular / 라벨)
 *   - body: Pretendard Variable (CSS @import 유지 — 한글 + 영문 본문/UI)
 *
 * 호환 보존: CSS 변수명 `--font-display` / `--font-data` 그대로 (호출처 0).
 * `globals.css` 에서 `var(--font-display)` 사용 — 폰트만 교체.
 */
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://neko-ecru.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "neq, — 당신의 취향을 발견하세요",
  description: "알고리즘 밖의 OTT 작품을 발견하세요. 좋아하는 작품 3개만 골라주면, 숨겨진 명작을 찾아드려요.",
  keywords: ["OTT 추천", "영화 추천", "시리즈 추천", "넷플릭스 추천", "디즈니플러스", "웨이브", "티빙", "콘텐츠 큐레이션"],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "neq",
  },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: siteUrl,
    title: "neq, — 당신의 취향을 발견하세요",
    description: "알고리즘 밖의 OTT 작품을 발견하세요. 좋아하는 작품 3개만 골라주면, 숨겨진 명작을 찾아드려요.",
    siteName: "neq,",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "neq, — 당신의 취향을 발견하세요",
      },
      {
        url: "/og-image-square.png",
        width: 1200,
        height: 1200,
        alt: "neq, — 당신의 취향을 발견하세요",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "neq, — 당신의 취향을 발견하세요",
    description: "알고리즘 밖의 OTT 작품을 발견하세요.",
    images: ["/og-image.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#12110E",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${instrumentSerif.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <link
          rel="preload"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
          as="style"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        <link rel="icon" href="/favicon.png" type="image/png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body className="h-full">
        <PostHogProvider>
          <PersonaProvider>
            <ToastProvider>
              <div className="h-dvh flex flex-col">{children}</div>
            </ToastProvider>
          </PersonaProvider>
          <InstallBanner />
          <Reminder />
          <Analytics />
        </PostHogProvider>
      </body>
    </html>
  );
}

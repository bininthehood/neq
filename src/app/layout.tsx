import type { Metadata, Viewport } from "next";
import { Fraunces, Outfit } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import InstallBanner from "@/components/InstallBanner";
import Reminder from "@/components/Reminder";
import PostHogProvider from "@/components/PostHogProvider";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
});

const outfit = Outfit({
  variable: "--font-outfit",
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
  themeColor: "#0C0A09",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${fraunces.variable} ${outfit.variable} h-full antialiased`}
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
          <div className="h-dvh flex flex-col">{children}</div>
          <InstallBanner />
          <Reminder />
          <Analytics />
        </PostHogProvider>
      </body>
    </html>
  );
}

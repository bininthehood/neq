/**
 * TMDB provider 이름 → OTT 검색 URL + favicon 매핑
 */

interface OTTProvider {
  domain: string;
  search: (title: string) => string;
  appLink?: (title: string) => string; // 모바일 앱 딥링크 (Universal Link)
  iconOverride?: string;
}

const providers: Record<string, OTTProvider> = {
  "Netflix": {
    domain: "www.netflix.com",
    search: (t) => `https://www.netflix.com/search?q=${enc(t)}`,
    appLink: (t) => `https://www.netflix.com/search?q=${enc(t)}`, // Universal Link → 앱 자동 전환
  },
  "Disney Plus": {
    domain: "www.disneyplus.com",
    search: (t) => `https://www.disneyplus.com/ko-kr/search?q=${enc(t)}`,
    appLink: (t) => `https://www.disneyplus.com/ko-kr/search?q=${enc(t)}`,
  },
  "Watcha": {
    domain: "watcha.com",
    search: (t) => `https://watcha.com/search?query=${enc(t)}`,
    appLink: (t) => `watcha://search?query=${enc(t)}`,
  },
  "wavve": {
    domain: "wavve.com",
    search: (t) => `https://www.wavve.com/search?searchWord=${enc(t)}`,
    appLink: (t) => `https://www.wavve.com/search?searchWord=${enc(t)}`,
    iconOverride: "https://www.wavve.com/favicon.ico",
  },
  "Coupang Play": {
    domain: "www.coupangplay.com",
    search: (t) => `https://www.coupangplay.com/search?q=${enc(t)}`,
    appLink: (t) => `https://www.coupangplay.com/search?q=${enc(t)}`,
  },
  "Apple TV Plus": {
    domain: "tv.apple.com",
    search: (t) => `https://tv.apple.com/kr/search?term=${enc(t)}`,
    appLink: (t) => `https://tv.apple.com/kr/search?term=${enc(t)}`,
  },
  "Apple TV": {
    domain: "tv.apple.com",
    search: (t) => `https://tv.apple.com/kr/search?term=${enc(t)}`,
    appLink: (t) => `https://tv.apple.com/kr/search?term=${enc(t)}`,
  },
  "Amazon Prime Video": {
    domain: "www.primevideo.com",
    search: (t) => `https://www.primevideo.com/search?phrase=${enc(t)}`,
    appLink: (t) => `https://www.primevideo.com/search?phrase=${enc(t)}`,
  },
  "Google Play Movies": {
    domain: "play.google.com",
    search: (t) => `https://play.google.com/store/search?q=${enc(t)}&c=movies`,
  },
  "TVING": {
    domain: "www.tving.com",
    search: (t) => `https://www.tving.com/search?keyword=${enc(t)}`,
    appLink: (t) => `https://www.tving.com/search?keyword=${enc(t)}`,
  },
  "Naver Store": {
    domain: "serieson.naver.com",
    search: (t) => `https://serieson.naver.com/search?query=${enc(t)}`,
  },
};

function enc(s: string) {
  return encodeURIComponent(s);
}

/** OTT 링크 — 모바일이면 앱 딥링크, 아니면 웹 검색 */
export function getOTTLink(providerName: string, title: string): string | null {
  const provider = providers[providerName];
  if (!provider) return null;
  // 모바일 환경에서 앱 딥링크 우선
  if (provider.appLink && typeof navigator !== "undefined" && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
    return provider.appLink(title);
  }
  return provider.search(title);
}

/** OTT 아이콘 — 직접 지정 우선, 폴백으로 Google Favicon API */
export function getOTTIcon(providerName: string): string | null {
  const provider = providers[providerName];
  if (!provider) return null;
  if (provider.iconOverride) return provider.iconOverride;
  return `https://www.google.com/s2/favicons?domain=${provider.domain}&sz=64`;
}

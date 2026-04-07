/**
 * TMDB provider 이름 → OTT 검색 URL + favicon 매핑
 */

interface OTTProvider {
  domain: string;
  search: (title: string) => string;
  iconOverride?: string; // Google Favicon API가 부정확한 경우 직접 지정
}

const providers: Record<string, OTTProvider> = {
  "Netflix": {
    domain: "www.netflix.com",
    search: (t) => `https://www.netflix.com/search?q=${enc(t)}`,
  },
  "Disney Plus": {
    domain: "www.disneyplus.com",
    search: (t) => `https://www.disneyplus.com/ko-kr/search?q=${enc(t)}`,
  },
  "Watcha": {
    domain: "watcha.com",
    search: (t) => `https://watcha.com/search?query=${enc(t)}`,
  },
  "wavve": {
    domain: "wavve.com",
    search: (t) => `https://www.wavve.com/search?searchWord=${enc(t)}`,
    iconOverride: "https://www.wavve.com/favicon.ico",
  },
  "Coupang Play": {
    domain: "www.coupangplay.com",
    search: (t) => `https://www.coupangplay.com/search?q=${enc(t)}`,
  },
  "Apple TV Plus": {
    domain: "tv.apple.com",
    search: (t) => `https://tv.apple.com/kr/search?term=${enc(t)}`,
  },
  "Apple TV": {
    domain: "tv.apple.com",
    search: (t) => `https://tv.apple.com/kr/search?term=${enc(t)}`,
  },
  "Amazon Prime Video": {
    domain: "www.primevideo.com",
    search: (t) => `https://www.primevideo.com/search?phrase=${enc(t)}`,
  },
  "Google Play Movies": {
    domain: "play.google.com",
    search: (t) => `https://play.google.com/store/search?q=${enc(t)}&c=movies`,
  },
  "TVING": {
    domain: "www.tving.com",
    search: (t) => `https://www.tving.com/search?keyword=${enc(t)}`,
  },
  "Naver Store": {
    domain: "serieson.naver.com",
    search: (t) => `https://serieson.naver.com/search?query=${enc(t)}`,
  },
};

function enc(s: string) {
  return encodeURIComponent(s);
}

export function getOTTLink(providerName: string, title: string): string | null {
  const provider = providers[providerName];
  if (!provider) return null;
  return provider.search(title);
}

/** OTT 아이콘 — 직접 지정 우선, 폴백으로 Google Favicon API */
export function getOTTIcon(providerName: string): string | null {
  const provider = providers[providerName];
  if (!provider) return null;
  if (provider.iconOverride) return provider.iconOverride;
  return `https://www.google.com/s2/favicons?domain=${provider.domain}&sz=64`;
}

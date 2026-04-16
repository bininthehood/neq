/**
 * OTT provider 메타데이터 — 웹/네이티브 공유.
 * 이름(TMDB 기준) → 도메인, 검색 URL, 앱 딥링크, 아이콘.
 */

interface OTTProvider {
  domain: string;
  search: (title: string) => string;
  /** 앱 딥링크 — 모바일에서 우선 사용 */
  appLink?: (title: string) => string;
  /** 직접 지정 아이콘 — 없으면 Google S2 favicon API 사용 */
  iconOverride?: string;
}

function enc(s: string): string {
  return encodeURIComponent(s);
}

const providers: Record<string, OTTProvider> = {
  Netflix: {
    domain: 'www.netflix.com',
    search: (t) => `https://www.netflix.com/search?q=${enc(t)}`,
    appLink: (t) => `https://www.netflix.com/search?q=${enc(t)}`,
  },
  'Disney Plus': {
    domain: 'www.disneyplus.com',
    search: (t) => `https://www.disneyplus.com/ko-kr/search?q=${enc(t)}`,
    appLink: (t) => `https://www.disneyplus.com/ko-kr/search?q=${enc(t)}`,
  },
  Watcha: {
    domain: 'watcha.com',
    search: (t) => `https://watcha.com/search?query=${enc(t)}`,
    appLink: (t) => `watcha://search?query=${enc(t)}`,
  },
  wavve: {
    domain: 'wavve.com',
    search: (t) => `https://www.wavve.com/search?searchWord=${enc(t)}`,
    appLink: (t) => `https://www.wavve.com/search?searchWord=${enc(t)}`,
    iconOverride: 'https://www.wavve.com/favicon.ico',
  },
  'Coupang Play': {
    domain: 'www.coupangplay.com',
    search: (t) => `https://www.coupangplay.com/search?q=${enc(t)}`,
    appLink: (t) => `https://www.coupangplay.com/search?q=${enc(t)}`,
  },
  'Apple TV Plus': {
    domain: 'tv.apple.com',
    search: (t) => `https://tv.apple.com/kr/search?term=${enc(t)}`,
    appLink: (t) => `https://tv.apple.com/kr/search?term=${enc(t)}`,
  },
  'Apple TV': {
    domain: 'tv.apple.com',
    search: (t) => `https://tv.apple.com/kr/search?term=${enc(t)}`,
    appLink: (t) => `https://tv.apple.com/kr/search?term=${enc(t)}`,
  },
  'Amazon Prime Video': {
    domain: 'www.primevideo.com',
    search: (t) => `https://www.primevideo.com/search?phrase=${enc(t)}`,
    appLink: (t) => `https://www.primevideo.com/search?phrase=${enc(t)}`,
  },
  'Google Play Movies': {
    domain: 'play.google.com',
    search: (t) => `https://play.google.com/store/search?q=${enc(t)}&c=movies`,
  },
  TVING: {
    domain: 'www.tving.com',
    search: (t) => `https://www.tving.com/search?keyword=${enc(t)}`,
    appLink: (t) => `https://www.tving.com/search?keyword=${enc(t)}`,
  },
  'Naver Store': {
    domain: 'serieson.naver.com',
    search: (t) => `https://serieson.naver.com/search?query=${enc(t)}`,
  },
};

/** OTT 아이콘 URL — iconOverride가 있으면 그것, 없으면 Google S2 favicon */
export function getOTTIcon(providerName: string): string | null {
  const provider = providers[providerName];
  if (!provider) return null;
  if (provider.iconOverride) return provider.iconOverride;
  return `https://www.google.com/s2/favicons?domain=${provider.domain}&sz=64`;
}

/** OTT 검색 URL (웹 브라우저용) */
export function getOTTSearchUrl(providerName: string, title: string): string | null {
  const provider = providers[providerName];
  if (!provider) return null;
  return provider.search(title);
}

/** OTT 앱 딥링크 (모바일 Universal Link 우선, 없으면 검색 URL) */
export function getOTTAppLink(providerName: string, title: string): string | null {
  const provider = providers[providerName];
  if (!provider) return null;
  return provider.appLink ? provider.appLink(title) : provider.search(title);
}

/**
 * 플랫폼별 적절한 OTT 링크 반환.
 * isMobile=true면 앱 딥링크 우선, 아니면 웹 검색.
 */
export function getOTTLink(
  providerName: string,
  title: string,
  isMobile = false,
): string | null {
  const provider = providers[providerName];
  if (!provider) return null;
  if (isMobile && provider.appLink) return provider.appLink(title);
  return provider.search(title);
}

/**
 * OTT provider 메타데이터 — 웹/네이티브 공유.
 * 이름(TMDB 기준) → 도메인, 검색 URL, 앱 딥링크, 아이콘.
 */

interface OTTProvider {
  domain: string;
  search: (title: string) => string;
  /** 앱 딥링크 — 모바일에서 우선 사용 */
  appLink?: (title: string) => string;
  /**
   * 네이티브 앱 custom URL scheme (예: 'watcha://...').
   * 설치돼 있으면 OTT 앱으로 직접 진입. canOpenURL 실패(미설치/scheme 미등록) 시
   * 호출부가 반드시 웹(appLink/search)으로 fallback 해야 함 — scheme 자체는 보장 없음.
   */
  appScheme?: (title: string) => string;
  /** appScheme 의 prefix (예: 'watcha'). app.json LSApplicationQueriesSchemes 와 일치 필수 */
  schemePrefix?: string;
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
    // 기존 appLink 이 이미 watcha:// scheme 이었음 → 웹 fallback 으로 search 사용,
    // scheme 은 appScheme 으로 승격 (canOpenURL 분기 대상).
    appLink: (t) => `https://watcha.com/search?query=${enc(t)}`,
    appScheme: (t) => `watcha://search?query=${enc(t)}`,
    schemePrefix: 'watcha',
  },
  wavve: {
    domain: 'wavve.com',
    search: (t) => `https://www.wavve.com/search?searchWord=${enc(t)}`,
    appLink: (t) => `https://www.wavve.com/search?searchWord=${enc(t)}`,
    // ponytail: best-effort scheme, 미확인 — 실기기 검증 필요. canOpenURL 실패 시 웹으로 자동 fallback
    appScheme: (t) => `wavve://search?searchWord=${enc(t)}`,
    schemePrefix: 'wavve',
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
    // ponytail: best-effort scheme, 미확인 — 실기기 검증 필요. canOpenURL 실패 시 웹으로 자동 fallback
    appScheme: (t) => `tving://search?keyword=${enc(t)}`,
    schemePrefix: 'tving',
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
 * 네이티브 앱 custom scheme (예: 'tving://...') — 없으면 null.
 * 호출부는 canOpenURL 로 설치 여부 확인 후, 실패하면 웹(getOTTAppLink)으로 fallback 해야 함.
 */
export function getOTTAppScheme(providerName: string, title: string): string | null {
  const provider = providers[providerName];
  if (!provider?.appScheme) return null;
  return provider.appScheme(title);
}

/**
 * 네이티브 OTT open 후보를 우선순위대로 반환.
 * [scheme?, web, search] — scheme 은 있을 때만 맨 앞. 호출부가 순서대로 canOpenURL→openURL 시도.
 * scheme 이 없거나 막히면 web/search 로 떨어져 회귀 0 (기존 웹 열기 동작 보존).
 */
export function getOTTOpenCandidates(
  providerName: string,
  title: string,
): { url: string; via: 'app' | 'web' }[] {
  const provider = providers[providerName];
  if (!provider) return [];
  const web = provider.appLink ? provider.appLink(title) : provider.search(title);
  const candidates: { url: string; via: 'app' | 'web' }[] = [];
  if (provider.appScheme) candidates.push({ url: provider.appScheme(title), via: 'app' });
  candidates.push({ url: web, via: 'web' });
  return candidates;
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

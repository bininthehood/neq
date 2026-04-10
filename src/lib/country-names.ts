/**
 * ISO 3166-1 alpha-2 국가 코드 → 한글 이름 매핑.
 * 콘텐츠 제작 국가 표시용. 여러 국가 중 첫 번째(주 제작국)만 사용.
 */

const COUNTRY_NAMES_KO: Record<string, string> = {
  KR: "한국",
  US: "미국",
  JP: "일본",
  CN: "중국",
  TW: "대만",
  HK: "홍콩",
  GB: "영국",
  FR: "프랑스",
  DE: "독일",
  IT: "이탈리아",
  ES: "스페인",
  CA: "캐나다",
  AU: "호주",
  NZ: "뉴질랜드",
  IN: "인도",
  TH: "태국",
  VN: "베트남",
  ID: "인도네시아",
  PH: "필리핀",
  MY: "말레이시아",
  SG: "싱가포르",
  RU: "러시아",
  BR: "브라질",
  MX: "멕시코",
  AR: "아르헨티나",
  SE: "스웨덴",
  NO: "노르웨이",
  DK: "덴마크",
  FI: "핀란드",
  NL: "네덜란드",
  BE: "벨기에",
  CH: "스위스",
  AT: "오스트리아",
  PL: "폴란드",
  CZ: "체코",
  TR: "튀르키예",
  IL: "이스라엘",
  AE: "아랍에미리트",
  SA: "사우디",
  EG: "이집트",
  ZA: "남아공",
  IE: "아일랜드",
  PT: "포르투갈",
  GR: "그리스",
  HU: "헝가리",
  RO: "루마니아",
  IS: "아이슬란드",
  UA: "우크라이나",
};

/**
 * 국가 코드 배열에서 대표 국가 한 개의 한글명을 반환.
 * - 빈 배열/없음 → null
 * - 매핑 없는 코드 → 원본 코드 그대로 반환 (fallback)
 */
export function getPrimaryCountryName(codes: string[] | undefined | null): string | null {
  if (!codes || codes.length === 0) return null;
  const code = codes[0];
  return COUNTRY_NAMES_KO[code] ?? code;
}

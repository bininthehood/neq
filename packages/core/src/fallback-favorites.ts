/**
 * Fallback favorites — /api/trending 응답 실패 시 사용하는 시드 작품 목록.
 *
 * Web/Native 양쪽의 TasteSurveyFavoritesPicker + Web 의 NewPersonaSheet
 * 가 동일 시드를 공유하기 위해 단일 정본으로 추출. 각 사용처는 필요한
 * 갯수만 slice 한다 (보통 6 또는 8).
 *
 * 정렬: 인지도 + 장르 분산 (스릴러 / 명작 / SF / 갱스터 / 애니 / 컬트 / 지브리 / 뮤지컬 / 컬트).
 */
export interface FallbackFavoriteItem {
  id: number;
  title: string;
  posterUrl: string;
  year: string;
}

export const FALLBACK_FAVORITES: readonly FallbackFavoriteItem[] = [
  { id: 496243, title: "기생충", posterUrl: "https://image.tmdb.org/t/p/w200/jjHccoFjbqlfr4VGLVLT7yek0Xn.jpg", year: "2019" },
  { id: 278, title: "쇼생크 탈출", posterUrl: "https://image.tmdb.org/t/p/w200/oAt6OtpwYCdJI76AVtVKW1eorYx.jpg", year: "1994" },
  { id: 157336, title: "인터스텔라", posterUrl: "https://image.tmdb.org/t/p/w200/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg", year: "2014" },
  { id: 238, title: "대부", posterUrl: "https://image.tmdb.org/t/p/w200/I1fkNd5CeJGv56mhrTDoOeMc2r.jpg", year: "1972" },
  { id: 372058, title: "너의 이름은.", posterUrl: "https://image.tmdb.org/t/p/w200/wJsOzBoMSdkLJEFwpPIl0GTvPaJ.jpg", year: "2016" },
  { id: 550, title: "파이트 클럽", posterUrl: "https://image.tmdb.org/t/p/w200/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg", year: "1999" },
  { id: 129, title: "센과 치히로의 행방불명", posterUrl: "https://image.tmdb.org/t/p/w200/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg", year: "2001" },
  { id: 578, title: "라라랜드", posterUrl: "https://image.tmdb.org/t/p/w200/uDO8zWDhfWwoFdKS4fzkUJt0Rf0.jpg", year: "2016" },
  { id: 680, title: "펄프 픽션", posterUrl: "https://image.tmdb.org/t/p/w200/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg", year: "1994" },
] as const;

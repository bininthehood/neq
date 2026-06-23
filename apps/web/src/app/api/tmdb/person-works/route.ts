import { NextRequest, NextResponse } from "next/server";
import { getPersonCombinedCredits, posterUrl } from "@/lib/tmdb";
import type { SearchResult } from "@/lib/types";

/**
 * GET /api/tmdb/person-works?id=123&dept=Directing|Acting
 *
 * 위임 J #2 — SearchSheet 의 감독/배우 카드 클릭 시 그 사람의 작품 리스트.
 *
 * - dept=Directing: crew 에서 job==='Director' (또는 department==='Directing') 만 필터
 * - dept=Acting (기본):   cast 배열 사용 (출연작)
 * - 중복 id 제거 (감독+출연 동시 케이스 안전)
 * - cap: 사실상 전체 (안전 상한 200). 정렬(score desc 관련도순)은 유지 — 메이저작 상위.
 * - 포스터 없는 항목 제외 — UI 그리드 렌더 불가 + 보통 uncredited/단역 노이즈라 필터.
 *
 * 위임 #05 (2026-06-23) — 필모그래피 완전성 버그 수정: slice(0,12) 캡 제거.
 *  - 드웨인 존슨 메이저작 12개 초과 → '센트럴 인텔리전스'(2016) 점수상 밀려 누락되던 문제.
 *  - 센트럴 인텔리전스는 poster_path 보유 → 순전히 개수 캡 문제였음. 캡 제거로 자연 위치에 포함.
 *  - dedup / movie·tv 한정 / 토크쇼·리얼리티·뉴스 제외 / poster 필터는 회귀 방지 위해 유지.
 *
 * 위임 P #5 (2026-05-02) — 사용자 직접 테스트: "톰 행크스 검색 시 토크쇼만 나옴" 회귀 수정.
 *  - 토크쇼/리얼리티/뉴스 장르 제외 (TMDB genre id 10763 News, 10764 Reality, 10767 Talk).
 *  - 정렬 가중치 변경: cast 의 경우 order(주연 우선) + vote_count(인지도) 종합. popularity 보조.
 *    토크쇼 게스트는 order 큼(80+) + 작품 vote_count 적음 → 자연스럽게 후순위.
 *  - 영화/시리즈 정상 작품 (캐스트 어웨이, 라이언 일병 구하기, 포레스트 검프 등) 상위 노출.
 *
 * 응답: SearchResult[] (검색 작품 카로셀과 동일 형태로 호출처에서 handleSelectWork 재사용).
 */

// 위임 P #5 — TMDB TV 장르: 10763 News, 10764 Reality, 10767 Talk Show.
// 영화는 이 카테고리 자체가 없음 (영화에는 토크쇼 장르 X). TV 항목에만 적용.
const EXCLUDED_TV_GENRES = new Set([10763, 10764, 10767]);

export async function GET(req: NextRequest) {
  const idParam = req.nextUrl.searchParams.get("id");
  const dept = req.nextUrl.searchParams.get("dept") ?? "Acting";

  const id = Number(idParam);
  if (!id || Number.isNaN(id)) {
    return NextResponse.json([], { status: 400 });
  }

  const credits = await getPersonCombinedCredits(id);
  if (!credits) {
    return NextResponse.json([]);
  }

  const source =
    dept === "Directing"
      ? credits.crew.filter(
          (c) => c.job === "Director" || c.department === "Directing",
        )
      : credits.cast;

  // dedup by id+media_type — 같은 작품에 감독/각본 여러 크레딧이면 하나만.
  const seen = new Set<string>();
  const dedup = source.filter((c) => {
    const key = `${c.id}-${c.media_type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // 1차 필터: media_type movie/tv, 포스터 있음, 토크쇼/리얼리티/뉴스 장르 제외.
  const filtered = dedup.filter((c) => {
    if (c.media_type !== "movie" && c.media_type !== "tv") return false;
    if (!c.poster_path) return false;
    if (c.media_type === "tv" && c.genre_ids) {
      if (c.genre_ids.some((g) => EXCLUDED_TV_GENRES.has(g))) return false;
    }
    return true;
  });

  // 2차 정렬:
  //  - cast: 주연/조연 우선 (order asc) + 인지도 (vote_count desc) + popularity 보조.
  //    토크쇼 게스트는 보통 order 70+ 이라 자연스럽게 밀림. order 미상은 999 로 처리.
  //  - crew: 감독은 보통 order 없음 → vote_count + popularity 만 사용.
  //
  // 점수: -order * 1000 + vote_count + popularity * 5
  //   주연(order=0~10) → +90000~100000
  //   조연(order=11~30) → +70000~89000
  //   카메오/게스트(order=50+) → +50000 이하
  //   vote_count 1만 이상의 메이저 작품이면 vote_count 만으로도 충분히 우위.
  const score = (c: (typeof filtered)[number]): number => {
    const orderTerm =
      typeof c.order === "number" ? -c.order * 1000 : -50 * 1000;
    const voteTerm = c.vote_count ?? 0;
    const popTerm = (c.popularity ?? 0) * 5;
    return orderTerm + voteTerm + popTerm + 100000; // baseline
  };

  filtered.sort((a, b) => score(b) - score(a));

  // 캡 제거: 전 작품 반환 (안전 상한 200 만 유지 — TMDB 단일 응답이라 실측 대부분 그 이하).
  // 정렬은 score desc 유지 → 메이저작 상위, 센트럴 인텔리전스 등 중위 작품도 빠짐없이 포함.
  const works: SearchResult[] = filtered.slice(0, 200).map((c) => ({
    id: c.id,
    title: (c.title ?? c.name ?? "") as string,
    posterUrl: posterUrl(c.poster_path, "w200"),
    year: ((c.release_date ?? c.first_air_date ?? "") as string).slice(0, 4),
    rating: c.vote_average,
    mediaType: c.media_type === "tv" ? "tv" : "movie",
  }));

  return NextResponse.json(works);
}

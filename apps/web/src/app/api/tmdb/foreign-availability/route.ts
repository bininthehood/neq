import { NextRequest, NextResponse } from "next/server";
import { getTmdbApiKey } from "@/lib/env";

/**
 * 입고 알림 프로브 — 타국(US/JP/GB) 구독(flatrate) 가용성 조회.
 *
 * GET /api/tmdb/foreign-availability?work_id={id}&type={movie|series}
 *  → { countries: [{ code: "US"|"JP"|"GB", name: "미국"|... }] }
 *    (flatrate 가 있는 나라만. 없으면 빈 배열)
 *
 * TMDB /watch/providers 는 한 호출로 전 국가를 반환 — 미러 스키마 변경 없이
 * 미서비스(KR provider 0) 작품 상세에서 타국 가용성 pill 을 만든다. 미러 인프라의
 * "라이브 콜 제거" 방향에 대한 의도된 예외 (설계 §Dependencies 각주). 미서비스 상세
 * (전체 열람의 ~11%) 에 한해 열람당 1회 라이브 콜.
 *
 * ponytail: US/JP/GB 3국 고정 (설계 §Recommended Approach). 국가 확장은 B 단계에서
 * mirror 주요국 providers 컬럼 확장으로 흡수 예정 — 라이브 콜 재제거가 전제.
 *
 * 시청 수단(딥링크/provider 명) 은 반환하지 않는다 — 국가명만. VPN/우회 조장 배제
 * (App Store 심사 리스크 0 원칙, 설계 §Constraints).
 */

const BASE = "https://api.themoviedb.org/3";

// 설계 고정 3국. 코드 → 표시 국가명 (한글).
const TARGET_COUNTRIES: { code: string; name: string }[] = [
  { code: "US", name: "미국" },
  { code: "JP", name: "일본" },
  { code: "GB", name: "영국" },
];

export async function GET(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("work_id"));
  if (!id || Number.isNaN(id)) {
    return NextResponse.json({ error: "work_id 필수" }, { status: 400 });
  }
  const type = req.nextUrl.searchParams.get("type") === "series" ? "tv" : "movie";

  let apiKey: string;
  try {
    apiKey = getTmdbApiKey();
  } catch {
    return NextResponse.json({ countries: [] });
  }

  try {
    const res = await fetch(`${BASE}/${type}/${id}/watch/providers?api_key=${apiKey}`);
    if (!res.ok) return NextResponse.json({ countries: [] });
    const data = await res.json();
    const results = data.results ?? {};

    const countries = TARGET_COUNTRIES.filter(
      (c) => Array.isArray(results[c.code]?.flatrate) && results[c.code].flatrate.length > 0,
    ).map((c) => ({ code: c.code, name: c.name }));

    return NextResponse.json({ countries });
  } catch {
    // graceful — 클라이언트가 pill 없이 버튼만 노출
    return NextResponse.json({ countries: [] });
  }
}

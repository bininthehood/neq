import { Metadata } from "next";
import { getDetails, getCredits, getKoreanProviders, posterUrl } from "@/lib/tmdb";
import ShareClient from "./ShareClient";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ type?: string }>;
}

// variety 는 TMDB 에서 TV 로 취급 (별도 endpoint 없음). 그래서 TMDB API 호출용
// tmdbType 은 'movie' | 'series' 2종, UI 노출용 displayType 은 3종으로 분리한다.
async function fetchWork(id: number, displayType: "movie" | "series" | "variety") {
  const TMDB = "https://api.themoviedb.org/3";
  const key = process.env.TMDB_API_KEY;
  const tmdbType: "movie" | "series" = displayType === "movie" ? "movie" : "series";
  const mediaType = tmdbType === "series" ? "tv" : "movie";

  const base = await fetch(
    `${TMDB}/${mediaType}/${id}?api_key=${key}&language=ko-KR`,
    { next: { revalidate: 86400 } }
  );
  if (!base.ok) return null;
  const data = await base.json();
  if (!data?.id) return null;

  const [details, credits, { providers }] = await Promise.all([
    getDetails(id, tmdbType),
    getCredits(id, tmdbType),
    getKoreanProviders(id, tmdbType),
  ]);

  const title = tmdbType === "movie" ? data.title : data.name;
  const titleEn = tmdbType === "movie" ? data.original_title : data.original_name;
  const date = tmdbType === "movie" ? (data.release_date ?? "") : (data.first_air_date ?? "");

  return {
    title: title ?? "",
    titleEn: titleEn ?? "",
    type: displayType,
    tmdbId: id,
    posterUrl: posterUrl(data.poster_path, "w500"),
    backdrop: posterUrl(data.backdrop_path, "w1280"),
    rating: data.vote_average ?? 0,
    date,
    overview: data.overview ?? "",
    providers,
    director: credits.director,
    cast: credits.cast,
    runtime: details.runtime,
    seasons: details.seasons,
    country: details.country,
  };
}

function parseDisplayType(raw: string | undefined): "movie" | "series" | "variety" {
  if (raw === "series" || raw === "variety") return raw;
  return "movie";
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { id } = await params;
  const { type: rawType } = await searchParams;
  const tmdbId = Number(id);
  if (!tmdbId || isNaN(tmdbId)) return { title: "neq," };

  const type = parseDisplayType(rawType);
  const work = await fetchWork(tmdbId, type);
  if (!work) return { title: "neq," };

  const desc = [
    work.overview?.slice(0, 120),
    work.providers.length > 0
      ? `${work.providers.map((p) => p.name).join(", ")}에서 시청 가능`
      : null,
  ].filter(Boolean).join(" — ");

  return {
    title: `${work.title} — neq,`,
    description: desc,
    openGraph: {
      title: work.title,
      description: desc,
      images: work.backdrop || work.posterUrl ? [{ url: work.backdrop || work.posterUrl! }] : [],
    },
  };
}

export default async function SharePage({ params, searchParams }: Props) {
  const { id } = await params;
  const { type: rawType } = await searchParams;
  const tmdbId = Number(id);
  const type = parseDisplayType(rawType);

  if (!tmdbId || isNaN(tmdbId)) {
    return (
      <div className="h-dvh flex items-center justify-center">
        <p className="text-muted">잘못된 링크예요</p>
      </div>
    );
  }

  const work = await fetchWork(tmdbId, type);

  if (!work) {
    return (
      <div className="h-dvh flex items-center justify-center">
        <p className="text-muted">작품을 찾을 수 없어요</p>
      </div>
    );
  }

  return <ShareClient work={work} />;
}

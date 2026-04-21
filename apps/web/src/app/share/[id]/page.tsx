import { Metadata } from "next";
import { getDetails, getCredits, getKoreanProviders, posterUrl } from "@/lib/tmdb";
import ShareClient from "./ShareClient";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ type?: string }>;
}

async function fetchWork(id: number, type: "movie" | "series") {
  const TMDB = "https://api.themoviedb.org/3";
  const key = process.env.TMDB_API_KEY;
  const mediaType = type === "series" ? "tv" : "movie";

  const base = await fetch(
    `${TMDB}/${mediaType}/${id}?api_key=${key}&language=ko-KR`,
    { next: { revalidate: 86400 } }
  );
  if (!base.ok) return null;
  const data = await base.json();
  if (!data?.id) return null;

  const [details, credits, { providers }] = await Promise.all([
    getDetails(id, type),
    getCredits(id, type),
    getKoreanProviders(id, type),
  ]);

  const title = type === "movie" ? data.title : data.name;
  const titleEn = type === "movie" ? data.original_title : data.original_name;
  const date = type === "movie" ? (data.release_date ?? "") : (data.first_air_date ?? "");

  return {
    title: title ?? "",
    titleEn: titleEn ?? "",
    type,
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

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { id } = await params;
  const { type: rawType } = await searchParams;
  const tmdbId = Number(id);
  if (!tmdbId || isNaN(tmdbId)) return { title: "neq," };

  const type: "movie" | "series" = rawType === "series" ? "series" : "movie";
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
  const type: "movie" | "series" = rawType === "series" ? "series" : "movie";

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

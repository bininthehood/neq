"use client";

import NextImage from "next/image";
import { useRouter } from "next/navigation";
import { IconStar, IconSave } from "@/components/Icons";
import { getOTTLink, getOTTIcon } from "@/lib/ott-links";
import { addSaved } from "@/lib/store";
import { track } from "@/lib/analytics";
import { getPrimaryCountryName } from "@/lib/country-names";
import { useState } from "react";

interface Work {
  title: string;
  titleEn: string;
  type: "movie" | "series";
  tmdbId: number;
  posterUrl: string | null;
  backdrop: string | null;
  rating: number;
  date: string;
  overview: string;
  providers: Array<{ name: string; logoUrl: string | null }>;
  director: string | null;
  cast: string[];
  runtime: number | null;
  seasons: number | null;
  country: string[];
}

export default function ShareClient({ work }: { work: Work }) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);

  const meta = [
    getPrimaryCountryName(work.country),
    work.date?.slice(0, 4),
    work.runtime ? `${work.runtime}분` : null,
    work.seasons ? `시즌 ${work.seasons}` : null,
  ].filter(Boolean).join(" · ");

  const handleSave = () => {
    addSaved({
      title: work.title,
      titleEn: work.titleEn,
      type: work.type,
      reason: "공유 링크에서 저장한 작품이에요",
      tmdbId: work.tmdbId,
      posterUrl: work.posterUrl,
      rating: work.rating,
      date: work.date,
      overview: work.overview,
      providers: work.providers,
      watchLink: null,
      director: work.director,
      cast: work.cast,
      runtime: work.runtime,
      seasons: work.seasons,
      country: work.country,
      backdrop: work.backdrop,
    });
    setSaved(true);
    track("share_saved", { tmdb_id: work.tmdbId, title: work.title });
  };

  return (
    <div className="h-dvh flex flex-col max-w-lg mx-auto w-full">
      {/* Hero */}
      <div className="relative h-[55vh] shrink-0 overflow-hidden">
        {(work.backdrop || work.posterUrl) && (
          <NextImage
            src={work.backdrop || work.posterUrl!}
            alt={work.title}
            fill
            className="object-cover"
            priority
          />
        )}
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(transparent 40%, var(--bg) 100%)" }}
        />
        <div className="absolute bottom-0 left-0 right-0 p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-overlay backdrop-blur-sm">
              <IconStar size={13} color="var(--accent)" />
              <span className="font-data font-semibold text-accent text-sm">
                {work.rating.toFixed(1)}
              </span>
            </div>
            <span className="text-xs text-muted px-2 py-1 rounded-md bg-overlay backdrop-blur-sm">
              {work.type === "series" ? "시리즈" : "영화"}
            </span>
          </div>
          <h1 className="font-display text-3xl font-bold">{work.title}</h1>
          {work.titleEn !== work.title && (
            <p className="text-sm text-muted mt-1">{work.titleEn}</p>
          )}
          <p className="text-xs text-muted mt-1">{meta}</p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 pb-8">
        {/* Credits */}
        {(work.director || work.cast.length > 0) && (
          <div className="py-4 space-y-1 text-sm text-muted border-b border-border">
            {work.director && <div>감독 <span className="text-secondary">{work.director}</span></div>}
            {work.cast.length > 0 && <div>출연 <span className="text-secondary">{work.cast.slice(0, 4).join(", ")}</span></div>}
          </div>
        )}

        {/* Overview */}
        {work.overview && (
          <div className="py-4 border-b border-border">
            <h3 className="text-sm font-semibold mb-2">줄거리</h3>
            <p className="text-sm text-secondary leading-relaxed">{work.overview}</p>
          </div>
        )}

        {/* OTT */}
        {work.providers.length > 0 && (
          <div className="py-4">
            <h3 className="text-sm font-semibold mb-3">시청 가능</h3>
            <div className="flex flex-wrap gap-2">
              {work.providers.map((p) => {
                const link = getOTTLink(p.name, work.title);
                const icon = getOTTIcon(p.name) ?? p.logoUrl;
                return (
                  <a
                    key={p.name}
                    href={link ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2.5 text-sm rounded-lg active:scale-95 transition-transform min-h-[44px]"
                    style={{ background: "var(--surface)", color: "var(--text-primary)" }}
                  >
                    {icon && (
                      <NextImage
                        src={icon}
                        alt={p.name}
                        width={20}
                        height={20}
                        className="object-contain rounded-sm"
                        unoptimized
                      />
                    )}
                    {p.name}
                  </a>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 mt-4">
          <button
            onClick={handleSave}
            disabled={saved}
            className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold rounded-lg active:scale-[0.98] transition-all min-h-[48px]"
            style={{
              background: saved ? "var(--surface)" : "var(--accent)",
              color: saved ? "var(--text-muted)" : "var(--bg)",
            }}
          >
            <IconSave size={18} color={saved ? "var(--text-muted)" : "var(--bg)"} filled={saved} />
            {saved ? "저장됨" : "내 리스트에 저장"}
          </button>
          <button
            onClick={() => router.push("/discover")}
            className="flex-1 flex items-center justify-center py-3 text-sm font-semibold rounded-lg active:scale-[0.98] transition-all min-h-[48px]"
            style={{ background: "var(--surface)", color: "var(--text-primary)" }}
          >
            추천 더 보기
          </button>
        </div>

        {/* Branding */}
        <div className="mt-8 flex justify-center">
          <img src="/neq-logo.png" alt="neq," className="h-6 opacity-40" />
        </div>
      </div>
    </div>
  );
}

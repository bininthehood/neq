"use client";

import NextImage from "next/image";
import type { RelatedWork } from "@/lib/types";
import PosterFallback from "@/components/PosterFallback";
import { ChapterMark } from "./ChapterMark";

/**
 * RelatedSection — 관련 작품 가로 카로셀.
 * 디자인 spec (neko-detail-sheet.jsx SimilarStrip 참조).
 * 카드 90×132, 간격 10px, label 은 ChapterMark (tone 으로 amber accent / muted 선택).
 *
 * - 클릭 시 호출처(DetailSheet)가 PostHog detail_related_clicked 발사 + onClick 호출
 * - 빈 works 는 호출처에서 이미 가드. 본 컴포넌트는 항상 work.length > 0 가정
 */
export function RelatedSection({
  label,
  works,
  source,
  tmdbId,
  disabled,
  onClick,
  tone = "muted",
}: {
  label: string;
  works: RelatedWork[];
  source: "collection" | "director" | "recommendations";
  tmdbId: number;
  disabled?: boolean;
  onClick: (
    work: RelatedWork,
    source: "collection" | "director" | "recommendations",
  ) => void;
  tone?: "accent" | "muted";
}) {
  // tmdbId 는 PostHog 이벤트의 origin 식별 (이미 onClick 내부에서 fire 되지만,
  // 디버깅용 로그/data-attribute 로 노출 가능). 현재는 onClick 으로 전달만.
  void tmdbId;
  const headingId = `d3-related-${source}`;
  return (
    <section className="mt-5" aria-labelledby={headingId}>
      <ChapterMark id={headingId} tone={tone}>{label}</ChapterMark>
      <div
        className="flex gap-2.5 overflow-x-auto pb-1 -mr-5"
        style={{ scrollbarWidth: "none" }}
      >
        {works.map((w) => (
          <button
            key={w.id}
            type="button"
            disabled={disabled}
            className="flex-shrink-0 w-[90px] text-left active:scale-[0.97] transition-transform disabled:opacity-50"
            onClick={() => onClick(w, source)}
          >
            <div
              className="w-[90px] h-[132px] rounded-md overflow-hidden mb-1.5 bg-surface relative"
              style={{ border: "1px solid var(--border)" }}
            >
              {w.posterUrl ? (
                <NextImage
                  src={w.posterUrl}
                  alt={w.title}
                  fill
                  sizes="90px"
                  className="object-cover"
                  unoptimized
                />
              ) : (
                <PosterFallback title={w.title} size="xs" />
              )}
            </div>
            <div className="text-[11px] font-medium leading-snug line-clamp-2">
              {w.title}
            </div>
            {w.year && (
              <div className="font-data text-xs text-muted mt-0.5">
                {w.year}
              </div>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}

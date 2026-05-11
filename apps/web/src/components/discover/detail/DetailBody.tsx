"use client";

import { useEffect, useState } from "react";
import NextImage from "next/image";
import type {
  Recommendation,
  RelatedWork,
  RelatedWorksResponse,
  CastMember,
} from "@/lib/types";
import { getOTTLink, getOTTIcon } from "@/lib/ott-links";
import { track } from "@/lib/analytics";
import { getPrimaryCountryName } from "@/lib/country-names";
import { IconStar } from "@/components/Icons";
import { ChapterMark } from "./ChapterMark";
import { RelatedSection } from "./DetailRelated";
import { DetailHero } from "./DetailHero";

// GH-3 #7 — Synopsis 더보기/접기 토글 임계.
// 200자 미만은 토글 자체 미노출 (자연스럽게 전체 표시).
const SYNOPSIS_THRESHOLD = 200;

function metaInfo(r: Recommendation) {
  return [
    getPrimaryCountryName(r.country),
    r.date ? r.date.slice(0, 4) : null,
    r.runtime ? `${r.runtime}분` : null,
    r.seasons ? `시즌 ${r.seasons}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * DetailBody — DetailSheet 본문 스크롤 영역.
 *
 * 책임: hero / 타이틀·메타 / reason / synopsis / cast / watch / related 섹션 렌더.
 * 자체 상태(synopsis 토글, lazy cast, related fetch)는 모두 내부에 캡슐화.
 * 관련작 클릭 시 부모(DetailSheet)에 위임 (rec 교체는 부모 책임).
 */
export function DetailBody({
  rec,
  showDetail,
  detailBodyRef,
  onDetailTouchStart,
  onDetailTouchMove,
  onDetailTouchEnd,
  heroRef,
  morphPhase,
  reactionBadge,
  onSearchPerson,
  hydratingRelated,
  onRelatedClick,
}: {
  rec: Recommendation;
  showDetail: boolean;
  detailBodyRef: React.RefObject<HTMLDivElement | null>;
  onDetailTouchStart: (e: React.TouchEvent) => void;
  onDetailTouchMove: (e: React.TouchEvent) => void;
  onDetailTouchEnd: () => void;
  heroRef: React.RefObject<HTMLDivElement | null>;
  morphPhase: "enter" | "exit" | null;
  reactionBadge?: React.ReactNode;
  onSearchPerson?: (name: string) => void;
  hydratingRelated: boolean;
  onRelatedClick: (
    work: RelatedWork,
    source: "collection" | "director" | "recommendations",
  ) => void;
}) {
  // GH-3 #7 — Synopsis 더보기/접기 토글.
  // line-clamp-5 (CSS) + 끝에 fade-out gradient 로 잘림 시각화.
  // rec 변경(관련작 클릭으로 교체) 시 자동 접힘으로 reset.
  const [synopsisExpanded, setSynopsisExpanded] = useState(false);
  useEffect(() => {
    setSynopsisExpanded(false);
  }, [rec.tmdbId]);

  // 위임 P #3 (2026-05-02) — Cast 사진 lazy hydration.
  // mirror cache 경로 rec 은 castMembers 가 빈 배열 → 사진 안 보임.
  // sheet 진입 시 1회 /api/tmdb/credits 호출해 directorMember/castMembers 를 채운다.
  // 이미 채워진 rec (hydrate/enrichCandidates 경로) 은 fetch skip — 무한 루프 방지.
  const [lazyCastMembers, setLazyCastMembers] = useState<CastMember[] | null>(null);
  const [lazyDirectorMember, setLazyDirectorMember] = useState<CastMember | null>(null);

  // 관련 작품 (collection + director). 화면 rec 변경 시 마다 fetch.
  const [related, setRelated] = useState<RelatedWorksResponse | null>(null);
  const [relatedLoading, setRelatedLoading] = useState(false);

  // 관련 작품 fetch — 화면 rec 의 tmdbId 변경 또는 sheet 가 열릴 때마다.
  //
  // setState 는 비동기 콜백(.then/.catch/.finally) 또는 cleanup 에서만 호출.
  // 시작 시 loading=true 도 promise microtask 로 미뤄서
  // react-hooks/set-state-in-effect 규칙 준수.
  useEffect(() => {
    if (!showDetail || !rec?.tmdbId) {
      return;
    }
    let cancelled = false;
    const url = `/api/tmdb/related?work_id=${rec.tmdbId}&type=${rec.type === "series" ? "series" : "movie"}`;

    Promise.resolve()
      .then(() => {
        if (cancelled) return null;
        setRelatedLoading(true);
        return fetch(url);
      })
      .then((r) => (r && r.ok ? r.json() : null))
      .then((data: RelatedWorksResponse | null) => {
        if (cancelled) return;
        setRelated(
          data ?? { collection: null, recommendations: [], directorWorks: [], directorName: null },
        );
      })
      .catch(() => {
        if (cancelled) return;
        setRelated({ collection: null, recommendations: [], directorWorks: [], directorName: null });
      })
      .finally(() => {
        if (!cancelled) setRelatedLoading(false);
      });

    return () => {
      cancelled = true;
      // 다음 sheet 진입/rec 변경 시 깨끗한 state 보장
      setRelated(null);
      setRelatedLoading(false);
    };
  }, [showDetail, rec?.tmdbId, rec?.type]);

  // 위임 P #3 — Cast 사진 lazy hydration.
  // sheet 가 보이고 rec.castMembers 가 비어있는데 cast 이름이라도 있으면 (또는 director 만 있어도)
  // /api/tmdb/credits 1회 호출해 사진 채움. 이미 castMembers 가 있는 rec(검색/관련작 hydrate 경로)
  // 은 skip. rec.tmdbId 변경 시 다시 측정.
  // setState 는 모두 microtask/promise 콜백 안에서만 호출 (react-hooks/set-state-in-effect 준수).
  useEffect(() => {
    if (!showDetail || !rec?.tmdbId) return;
    const hasCastMembers = (rec.castMembers?.length ?? 0) > 0;
    const hasDirectorMember = rec.directorMember != null;
    let cancelled = false;
    if (hasCastMembers || hasDirectorMember) {
      // 이미 채워짐 — fetch 불필요. lazy state 도 microtask 로 정리.
      Promise.resolve().then(() => {
        if (cancelled) return;
        setLazyCastMembers(null);
        setLazyDirectorMember(null);
      });
      return () => {
        cancelled = true;
      };
    }
    const hasNamesOnly = !!rec.director || (rec.cast?.length ?? 0) > 0;
    if (!hasNamesOnly) return;

    const url = `/api/tmdb/credits?id=${rec.tmdbId}&type=${rec.type === "series" ? "series" : "movie"}`;
    Promise.resolve()
      .then(() => fetch(url))
      .then((r) => (r && r.ok ? r.json() : null))
      .then((data: { directorMember: CastMember | null; castMembers: CastMember[] } | null) => {
        if (cancelled || !data) return;
        setLazyDirectorMember(data.directorMember);
        setLazyCastMembers(data.castMembers ?? []);
      })
      .catch(() => {
        // 실패 시 기존 fallback (이니셜) 그대로
      });
    return () => {
      cancelled = true;
    };
  }, [showDetail, rec?.tmdbId, rec?.type, rec?.castMembers, rec?.directorMember, rec?.director, rec?.cast]);

  return (
    <div
      ref={detailBodyRef}
      className="flex-1 overflow-y-auto px-5"
      style={{
        overscrollBehavior: "contain",
        paddingBottom: "calc(96px + env(safe-area-inset-bottom, 0px))",
      }}
      onTouchStart={onDetailTouchStart}
      onTouchMove={onDetailTouchMove}
      onTouchEnd={onDetailTouchEnd}
    >
      <DetailHero rec={rec} heroRef={heroRef} morphPhase={morphPhase} />

      <h2 className="font-display text-xl font-bold pr-14">{rec.title}</h2>
      <p className="text-sm mt-0.5 text-muted">
        {rec.titleEn} · {metaInfo(rec)}
      </p>
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <span className="flex items-center gap-1.5">
          <IconStar size={13} color="var(--accent)" />
          <span className="font-data text-sm font-semibold text-accent">
            {rec.rating.toFixed(1)}
          </span>
        </span>
        {/* Saved 페이지에서 ReactionLabel 등 페이지별 추가 배지를 끼워넣기 위한 slot.
            Discover 진입 시에는 미지정 → 렌더 X. */}
        {reactionBadge}
      </div>
      <div className="mt-4">
        {/* reason — 면(bg-accent-dim) → 선(borderLeft accent) 강조로 전환.
            2026-05-02 amber 누적 분배 정책 + Decisions Log #6 예외 패턴 재활용. */}
        <div
          className="pl-3 py-1 text-sm text-secondary"
          style={{ borderLeft: "2px solid var(--accent-border)" }}
        >
          {rec.reason}
        </div>
      </div>
      {rec.overview && (() => {
        // GH-3 #7 — 200자 이상이면 line-clamp-5 + 더보기/접기 토글.
        // 미만이면 그대로 전체 표시 (토글 미노출).
        // 2026-05-11 — 사용자 요청: 버튼뿐 아니라 synopsis 영역 자체 클릭 시 토글.
        //   isLong 일 때 전체 컨테이너 (텍스트 + 더보기 라벨) 를 button 으로 래핑.
        //   isLong 아니면 button 없이 plain 표시.
        const isLong = rec.overview.length >= SYNOPSIS_THRESHOLD;
        const showFade = isLong && !synopsisExpanded;
        const SynopsisInner = (
          <>
            <div className="relative">
              <p
                className="text-sm leading-relaxed text-secondary"
                style={
                  showFade
                    ? {
                        display: "-webkit-box",
                        WebkitLineClamp: 5,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }
                    : undefined
                }
              >
                {rec.overview}
              </p>
              {showFade && (
                <div
                  aria-hidden
                  className="absolute left-0 right-0 bottom-0 h-8 pointer-events-none"
                  style={{
                    background:
                      "linear-gradient(to bottom, transparent, var(--bg) 90%)",
                  }}
                />
              )}
            </div>
            {isLong && (
              <div
                className="mt-1.5 py-2 text-xs font-medium"
                style={{ color: "var(--text-secondary)" }}
                aria-hidden="true"
              >
                {synopsisExpanded ? "접기" : "더보기"}
              </div>
            )}
          </>
        );
        return (
          <section className="mt-5" aria-labelledby="d3-synopsis-heading">
            <ChapterMark id="d3-synopsis-heading">Synopsis · 줄거리</ChapterMark>
            {isLong ? (
              <button
                type="button"
                onClick={() => setSynopsisExpanded((v) => !v)}
                aria-expanded={synopsisExpanded}
                aria-controls="d3-synopsis-heading"
                aria-label={synopsisExpanded ? "줄거리 접기" : "줄거리 더보기"}
                className="block w-full text-left min-h-[44px] active:scale-[0.995] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded-md"
              >
                {SynopsisInner}
              </button>
            ) : (
              SynopsisInner
            )}
          </section>
        );
      })()}
      {/* Cast — director + cast 통합.
          위임 J #4: rec.directorMember/castMembers 가 있으면 실제 인물 사진 표시.
          위임 J #3: onSearchPerson 이 주어지면 클릭 시 SearchSheet 로 진입.
          두 신규 신호가 모두 미지정이어도 기존 이니셜 fallback 으로 동작 (회귀 0). */}
      {(rec.director || rec.cast?.length > 0) && (
        <section className="mt-5" aria-labelledby="d3-cast-heading">
          <ChapterMark id="d3-cast-heading" tone="muted">Cast · 출연</ChapterMark>
          <CastRow
            director={rec.director}
            cast={rec.cast}
            /* 위임 P #3 — lazy fetch 결과 우선. rec 자체가 이미 갖고 있으면 (hydrate 경로)
               그것 사용. 둘 다 비면 cast 이름 fallback (이니셜). */
            directorMember={
              rec.directorMember ?? lazyDirectorMember ?? null
            }
            castMembers={
              rec.castMembers && rec.castMembers.length > 0
                ? rec.castMembers
                : lazyCastMembers ?? []
            }
            onSearchPerson={onSearchPerson}
          />
        </section>
      )}
      <section className="mt-5" aria-labelledby="d3-watch-heading">
        <ChapterMark id="d3-watch-heading" tone="muted">Where to watch · 시청 가능</ChapterMark>
        {rec.providers.length === 0 ? (
          <p className="text-sm text-muted py-2">현재 한국 OTT에서 제공 정보를 찾지 못했어요</p>
        ) : (
          <div className="flex flex-col gap-2">
            {rec.providers.map((p) => {
              const u = getOTTLink(p.name, rec.title);
              return (
                <a
                  key={p.name}
                  href={u ?? rec.watchLink ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${p.name}에서 ${rec.title} 보기 (새 탭)`}
                  onClick={() =>
                    track("ott_link_clicked", {
                      tmdb_id: rec.tmdbId,
                      provider: p.name,
                      title: rec.title,
                    })
                  }
                  className="flex items-center gap-3 px-4 py-3 text-sm font-medium active:scale-[0.98] transition-transform bg-surface-raised rounded-md"
                >
                  {(getOTTIcon(p.name) ?? p.logoUrl) ? (
                    <NextImage
                      src={(getOTTIcon(p.name) ?? p.logoUrl)!}
                      alt={p.name}
                      width={32}
                      height={32}
                      className="object-contain flex-shrink-0 rounded-sm bg-surface"
                      unoptimized
                    />
                  ) : (
                    <div className="w-8 h-8 flex-shrink-0 rounded-sm bg-surface" />
                  )}
                  <span className="flex-1">{p.name}</span>
                  {/* "열기" amber 텍스트 → text-muted 화살표. amber 보조 액션 금지 정책. */}
                  <span className="text-xs text-muted" aria-hidden>›</span>
                </a>
              );
            })}
          </div>
        )}
      </section>
      {/* 관련 작품 — 시리즈 컬렉션 + 감독 다른 작품. F3 spec.
          - related === null + relatedLoading : 아직 로딩 (skeleton)
          - related 있고 collection/directorWorks 둘 다 비면 섹션 자체 숨김 */}
      {related === null && relatedLoading && (
        <div className="mt-5" aria-hidden>
          <div className="flex gap-2.5 overflow-x-auto pb-1 -mr-5">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex-shrink-0 w-[90px] h-[132px] rounded-md bg-surface"
                style={{ opacity: 0.5 }}
              />
            ))}
          </div>
        </div>
      )}

      {related?.collection && related.collection.works.length > 0 && (
        <RelatedSection
          label={related.collection.name}
          works={related.collection.works}
          source="collection"
          tmdbId={rec.tmdbId}
          disabled={hydratingRelated}
          onClick={onRelatedClick}
        />
      )}

      {/* 사용자 직접 테스트 #4 — TMDB recommendations 기반 비슷한 작품.
          collection (시리즈) 다음, director (감독 다른 작품) 이전 — 사용자 의도와 가까운 순서.
          빈 배열이면 섹션 자체 숨김. 옛 캐시 호환을 위해 optional chaining. */}
      {related?.recommendations && related.recommendations.length > 0 && (
        <RelatedSection
          label="비슷한 작품"
          works={related.recommendations}
          source="recommendations"
          tmdbId={rec.tmdbId}
          disabled={hydratingRelated}
          onClick={onRelatedClick}
        />
      )}

      {related?.directorWorks && related.directorWorks.length > 0 && (
        <RelatedSection
          label={
            related.directorName
              ? `${related.directorName} 감독의 다른 작품`
              : "감독의 다른 작품"
          }
          works={related.directorWorks}
          source="director"
          tmdbId={rec.tmdbId}
          disabled={hydratingRelated}
          onClick={onRelatedClick}
        />
      )}
    </div>
  );
}

/**
 * CastRow — director + cast 가로 스크롤 행.
 *
 * 위임 J #3 #4 — 사용자 직접 테스트 피드백 적용:
 *  - #4: directorMember/castMembers (TMDB profile_path) 있으면 실제 인물 사진 (NextImage).
 *        구버전 rec(이름만) 또는 profileUrl null 인 경우 기존 이니셜 fallback 유지.
 *  - #3: onSearchPerson 콜백 주어지면 64×64 영역을 button 으로 래핑 → 클릭 시 검색.
 *        콜백 미지정 시 비클릭 div 로 폴백 (회귀 0).
 *
 * 데이터 결합 규칙:
 *  - directorMember 가 있으면 그것을 1순위로 사용. 없고 director(이름) 만 있으면 fallback row 생성.
 *  - castMembers 가 비어있고 cast(이름 배열)만 있으면 cast 를 fallback 으로 매핑.
 *  - 길이/순서: director(1) → cast(최대 4) → 항상 5개 이하.
 */
function CastRow({
  director,
  cast,
  directorMember,
  castMembers,
  onSearchPerson,
}: {
  director: string | null;
  cast: string[];
  directorMember: CastMember | null;
  castMembers: CastMember[];
  onSearchPerson?: (name: string) => void;
}) {
  type Item = {
    name: string;
    role: "감독" | "출연";
    profileUrl: string | null;
    /** key 충돌 방지용 — tmdbId 가 있으면 사용, 없으면 name+index. */
    keyId: string;
  };
  const items: Item[] = [];

  // 1) Director — directorMember 우선, 없으면 director 문자열 fallback
  if (directorMember) {
    items.push({
      name: directorMember.name,
      role: "감독",
      profileUrl: directorMember.profileUrl,
      keyId: `d-${directorMember.tmdbId}`,
    });
  } else if (director) {
    items.push({
      name: director,
      role: "감독",
      profileUrl: null,
      keyId: `d-${director}`,
    });
  }

  // 2) Cast — castMembers 가 있으면 그걸로, 없으면 cast 문자열 배열 fallback
  if (castMembers && castMembers.length > 0) {
    for (const m of castMembers) {
      items.push({
        name: m.name,
        role: "출연",
        profileUrl: m.profileUrl,
        keyId: `c-${m.tmdbId}`,
      });
    }
  } else {
    for (let i = 0; i < cast.length; i++) {
      items.push({
        name: cast[i],
        role: "출연",
        profileUrl: null,
        keyId: `c-${cast[i]}-${i}`,
      });
    }
  }

  if (items.length === 0) return null;

  return (
    <div
      className="flex gap-2.5 overflow-x-auto pb-1 -mr-5"
      style={{ scrollbarWidth: "none" }}
    >
      {items.map((p) => (
        <CastItem
          key={p.keyId}
          name={p.name}
          role={p.role}
          profileUrl={p.profileUrl}
          onSearchPerson={onSearchPerson}
        />
      ))}
    </div>
  );
}

/**
 * CastItem — 인물 1명 셀 (사진 또는 이니셜 + 이름 + 역할).
 *
 * onSearchPerson 이 있으면 button (44×44 hit area 충족), 없으면 div.
 * 사진 영역은 64×64 원형, 이름 클램프 2줄(11px font-medium), 역할은 muted xs.
 */
function CastItem({
  name,
  role,
  profileUrl,
  onSearchPerson,
}: {
  name: string;
  role: "감독" | "출연";
  profileUrl: string | null;
  onSearchPerson?: (name: string) => void;
}) {
  const Avatar = (
    <div
      className="mx-auto mb-1.5 relative overflow-hidden flex items-center justify-center"
      style={{
        width: 64,
        height: 64,
        borderRadius: "50%",
        background: "var(--surface-raised)",
        border: "1px solid var(--border)",
      }}
      aria-hidden
    >
      {profileUrl ? (
        <NextImage
          src={profileUrl}
          alt=""
          fill
          sizes="64px"
          className="object-cover"
          unoptimized
        />
      ) : (
        <span
          className="font-display italic"
          style={{
            color: "var(--text-secondary)",
            fontSize: 22,
            lineHeight: 1,
          }}
        >
          {name.charAt(0)}
        </span>
      )}
    </div>
  );

  const Label = (
    <>
      <div
        className="text-[11px] font-medium leading-tight line-clamp-2"
        style={{ color: "var(--text-primary)" }}
      >
        {name}
      </div>
      <div
        className="font-data text-xs mt-0.5"
        style={{ color: "var(--text-muted)" }}
      >
        {role}
      </div>
    </>
  );

  if (onSearchPerson) {
    return (
      <button
        type="button"
        onClick={() => {
          track("detail_cast_clicked", { name, role });
          onSearchPerson(name);
        }}
        aria-label={`${name} ${role} 검색`}
        className="flex-shrink-0 text-center active:scale-[0.97] transition-transform focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none rounded-md"
        style={{ width: 64, minHeight: 44 }}
      >
        {Avatar}
        {Label}
      </button>
    );
  }

  return (
    <div className="flex-shrink-0 text-center" style={{ width: 64 }}>
      {Avatar}
      {Label}
    </div>
  );
}

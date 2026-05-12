"use client";

/**
 * SearchResults — uiState=ok 일 때 카로셀 그리드 + floating panel 렌더링.
 *
 * 위임 Q (2026-05-02) — 작품/인물 선택 시 floating panel + scoped dim 패턴.
 * 사용자 피드백: "정보 섹션 레이아웃이 선택한 작품 밑으로 공중에 띄워주고,
 * 후방은 반투명 레이아웃으로 덮으면 직관적일것같아요."
 *
 * 채택: Inline panel + per-section dim (옵션 B 강화).
 *   - 선택된 항목이 속한 group section 바로 아래에 패널을 inline 렌더 →
 *     "이 카드 → 이 정보" 시각 인접성 자연 확보 (좌표 측정 X, 가로 스크롤 호환)
 *   - 비활성 그룹에 dim overlay (per-section scope) → 후방 반투명 덮음
 *   - dim 클릭 시 선택 해제 (popover-style dismiss)
 *   - 진입 모션: panel fadeIn + 8px translateY → 0 (200ms, --ease-detail-morph)
 *   - prefers-reduced-motion 은 globals.css 전역 규칙으로 즉시 적용됨
 *
 * fetch 책임 X — 부모 (SearchSheet) 가 모든 데이터/콜백을 props 로 내려줌.
 * 카로셀(WorksCarousel/PeopleCarousel/PersonCard) 도 같은 파일에 동거 — UI 응집성.
 */

import Image from "next/image";
import { IconStar } from "@/components/Icons";
import PosterFallback from "@/components/PosterFallback";
import type {
  GroupedSearchResponse,
  PersonResult,
  Recommendation,
  SearchResult,
} from "@/lib/types";
import type { CategoryGroup } from "@neq/core";
import SelectedWorkPanel, { type ProviderInfo } from "./SelectedWorkPanel";
import SelectedPersonPanel from "./SelectedPersonPanel";

export default function SearchResults({
  data,
  groups,
  selectedWork,
  selectedPerson,
  providers,
  loadingProviders,
  loadingDetail,
  detailRec,
  personWorks,
  personWorksLoading,
  personWorksError,
  savedIds,
  onSelectWork,
  onSelectPerson,
  onDismissSelection,
  onSave,
  onOpenDetail,
}: {
  data: GroupedSearchResponse;
  groups: CategoryGroup[];
  selectedWork: SearchResult | null;
  selectedPerson: PersonResult | null;
  providers: ProviderInfo[];
  loadingProviders: boolean;
  loadingDetail: boolean;
  detailRec: Recommendation | null;
  personWorks: SearchResult[];
  personWorksLoading: boolean;
  personWorksError: boolean;
  savedIds: Set<number>;
  onSelectWork: (item: SearchResult) => void;
  onSelectPerson: (person: PersonResult) => void;
  onDismissSelection: () => void;
  onSave: (item: SearchResult) => void;
  onOpenDetail: () => void;
}) {
  const hasSelection = !!(selectedWork || selectedPerson);
  // 우선순위: selectedPerson 활성 시 인물 panel 그룹 → 인물 panel 안에서 작품 선택해도
  // 인물 panel 자체는 활성 유지. selectedWork 만 있을 때만 "works" 그룹 활성.
  // 이 우선순위 변경으로 인물 panel 내부에 SelectedWorkPanel 을 nested 표시 가능.
  const activeGroupKey: "works" | "directors" | "actors" | null =
    selectedPerson
      ? selectedPerson.knownForDept === "Directing"
        ? "directors"
        : "actors"
      : selectedWork
        ? "works"
        : null;

  return (
    <div className="space-y-4 pt-2 relative min-h-full">
      {groups.map((g) => {
        const isActive = g.key === activeGroupKey;
        const isDimmed = hasSelection && !isActive;
        return (
          <section
            key={g.key}
            aria-label={`${g.label} 검색 결과 ${g.count}건`}
            className="relative"
            style={{
              // 활성 섹션은 dim 위로, 비활성은 dim 가려짐
              zIndex: isActive ? 2 : 0,
            }}
          >
            {/* 2026-05-02 사용자 직접 테스트 D-2 #3:
                검색 결과 좌우 padding px-5 (20px) → px-6 (24px = --space-lg).
                사용자가 "왼쪽 margin이 없어서 화면에 너무 붙어있는 느낌"이라
                한 단계 더 여유. SelectedWorkPanel mx-6 와 정합. */}
            <div
              className="flex items-baseline justify-between px-6 pt-2 pb-2"
              style={{
                opacity: isDimmed ? 0.35 : 1,
                transition: "opacity 180ms var(--ease-detail-morph)",
              }}
            >
              <h3
                className="text-xs font-data uppercase tracking-widest"
                style={{
                  color: "var(--accent)",
                  letterSpacing: "0.12em",
                }}
              >
                {g.label}
              </h3>
              <span
                className="text-xs font-data"
                style={{ color: "var(--text-muted)" }}
              >
                {g.count}
              </span>
            </div>

            <div
              style={{
                opacity: isDimmed ? 0.35 : 1,
                transition:
                  "opacity 180ms var(--ease-detail-morph)",
                // 비활성 섹션은 클릭 차단 — dim 클릭으로만 닫히게
                pointerEvents: isDimmed ? "none" : "auto",
              }}
              aria-hidden={isDimmed || undefined}
            >
              {g.key === "works" && (
                <WorksCarousel
                  items={data.works}
                  selectedId={selectedWork?.id ?? null}
                  onSelect={onSelectWork}
                />
              )}

              {g.key === "directors" && (
                <PeopleCarousel
                  items={data.directors}
                  selectedId={selectedPerson?.id ?? null}
                  onSelect={onSelectPerson}
                />
              )}
              {g.key === "actors" && (
                <PeopleCarousel
                  items={data.actors}
                  selectedId={selectedPerson?.id ?? null}
                  onSelect={onSelectPerson}
                />
              )}
            </div>

            {/* 위임 Q — 활성 그룹 바로 아래에 floating panel inline */}
            {isActive && selectedWork && g.key === "works" && (
              <div className="search-floating-panel">
                <SelectedWorkPanel
                  item={selectedWork}
                  providers={providers}
                  loadingProviders={loadingProviders}
                  loadingDetail={loadingDetail}
                  detailRec={detailRec}
                  isSaved={savedIds.has(selectedWork.id)}
                  onSave={() => onSave(selectedWork)}
                  onOpenDetail={onOpenDetail}
                />
              </div>
            )}
            {isActive && selectedPerson && g.key !== "works" && (
              <div className="search-floating-panel">
                <SelectedPersonPanel
                  person={selectedPerson}
                  works={personWorks}
                  loading={personWorksLoading}
                  error={personWorksError}
                  selectedWorkId={selectedWork?.id ?? null}
                  onSelectWork={(item) => {
                    // 인물 panel 유지 + 작품 panel (SelectedWorkPanel) 을 nested 표시.
                    // handleSelectWork 가 selectedWork 세팅 + provider/detail fetch 처리.
                    // 사용자는 OTT/save 카드 (SelectedWorkPanel) 를 먼저 보고, OPEN 버튼으로 detail 진입.
                    // (track 호출은 SelectedPersonPanel 내부에서 이미 처리)
                    onSelectWork(item);
                  }}
                  nestedWorkPanel={
                    selectedWork ? (
                      <SelectedWorkPanel
                        item={selectedWork}
                        providers={providers}
                        loadingProviders={loadingProviders}
                        loadingDetail={loadingDetail}
                        detailRec={detailRec}
                        isSaved={savedIds.has(selectedWork.id)}
                        onSave={() => onSave(selectedWork)}
                        onOpenDetail={onOpenDetail}
                      />
                    ) : null
                  }
                />
              </div>
            )}
          </section>
        );
      })}

      {/* dim overlay — 활성 섹션 외부 클릭 시 선택 해제.
          활성 섹션은 z-index 2, dim 은 z-index 1, 비활성은 z-index 0.
          dim 은 overflow-y-auto 컨테이너 안에서 absolute inset-0 으로 덮어
          세로 스크롤 시에도 모든 비활성 콘텐츠를 덮음. */}
      {hasSelection && (
        <button
          type="button"
          onClick={onDismissSelection}
          aria-label="선택 해제"
          className="search-dim-overlay"
        />
      )}

      <style>{`
        /* panel 을 layout flow 안에 배치 — scroll body 가 panel 높이를 정상 인식.
           활성 section 자체 zIndex:2 stacking context 안 → dim(zIndex:1) 위 자동 표시.
           다음 section 을 밀게 되지만 dim 이 그 영역을 가리므로 시각적으로 동일.
           이 결정의 효과: 인물 panel 안 nested SelectedWorkPanel 이 길어져도 scroll 로 끝까지 접근 가능 — absolute 일 때는 scroll body 가 panel 높이를 모르고 잘렸음. */
        .search-floating-panel {
          position: relative;
          animation: searchPanelEnter 200ms var(--ease-detail-morph);
        }
        .search-dim-overlay {
          position: absolute;
          inset: 0;
          z-index: 1;
          background: var(--bg-overlay);
          border: 0;
          padding: 0;
          cursor: pointer;
          animation: searchDimEnter 180ms var(--ease-detail-morph);
        }
        @keyframes searchPanelEnter {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes searchDimEnter {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// 카로셀 — 작품
// ─────────────────────────────────────────────────────

function WorksCarousel({
  items,
  selectedId,
  onSelect,
}: {
  items: SearchResult[];
  selectedId: number | null;
  onSelect: (item: SearchResult) => void;
}) {
  return (
    // 2026-05-02 사용자 직접 테스트 D-2 #3: px-5 → px-6 (24px) — 첫 카드 좌측 여유.
    // scroll-snap-align: start 가 padding-left 를 무시하고 첫 카드를 left=0 에 붙이는
    // 문제(브라우저 기본 동작)를 scrollPaddingLeft 24px 로 해결 — snap 기준점을 24px 안쪽으로.
    <div
      className="flex gap-3 px-6 pb-1 overflow-x-auto"
      style={{
        scrollSnapType: "x mandatory",
        scrollPaddingLeft: 24,
        scrollbarWidth: "none",
        WebkitOverflowScrolling: "touch",
      }}
    >
      {items.map((item) => {
        const isSelected = selectedId === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onSelect(item)}
            aria-label={`${item.title} 선택`}
            aria-pressed={isSelected}
            className="shrink-0 active:scale-[0.98] transition-transform focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none rounded-md"
            style={{
              width: 112,
              scrollSnapAlign: "start",
            }}
          >
            <div
              className="relative rounded-md overflow-hidden"
              style={{
                width: 112,
                aspectRatio: "2 / 3",
                background: "var(--surface)",
                border: isSelected
                  ? "1.5px solid var(--accent)"
                  : "1px solid var(--border)",
                transition: "border-color 150ms",
              }}
            >
              {item.posterUrl ? (
                <Image
                  src={item.posterUrl}
                  alt={item.title}
                  fill
                  sizes="112px"
                  className="object-cover"
                />
              ) : (
                <PosterFallback title={item.title} size="sm" />
              )}
            </div>
            <div className="mt-2 text-left">
              <div
                className="text-xs font-medium truncate"
                style={{ color: "var(--text-primary)" }}
              >
                {item.title}
              </div>
              <div
                className="flex items-center gap-1.5 mt-0.5 text-[11px]"
                style={{ color: "var(--text-muted)" }}
              >
                <span>{item.mediaType === "tv" ? "시리즈" : "영화"}</span>
                {item.year && <span>·</span>}
                {item.year && <span>{item.year}</span>}
                {item.rating > 0 && (
                  <>
                    <span>·</span>
                    <span className="flex items-center gap-0.5 font-data">
                      <IconStar size={9} color="var(--text-secondary)" />
                      {item.rating.toFixed(1)}
                    </span>
                  </>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────
// 카로셀 — 인물 (감독 / 배우 공용)
// ─────────────────────────────────────────────────────

function PeopleCarousel({
  items,
  selectedId,
  onSelect,
}: {
  items: PersonResult[];
  selectedId: number | null;
  onSelect: (person: PersonResult) => void;
}) {
  return (
    // 2026-05-02 사용자 직접 테스트 D-2 #3: px-5 → px-6 — WorksCarousel 와 동일.
    // scrollPaddingLeft 24px 로 snap 기준점을 padding 안쪽으로 조정 (첫 카드 left=0 방지).
    <div
      className="flex gap-3 px-6 pb-1 overflow-x-auto"
      style={{
        scrollSnapType: "x mandatory",
        scrollPaddingLeft: 24,
        scrollbarWidth: "none",
        WebkitOverflowScrolling: "touch",
      }}
    >
      {items.map((p) => (
        <PersonCard
          key={p.id}
          person={p}
          isSelected={selectedId === p.id}
          onSelect={() => onSelect(p)}
        />
      ))}
    </div>
  );
}

function PersonCard({
  person,
  isSelected,
  onSelect,
}: {
  person: PersonResult;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const knownForText =
    person.knownFor.length > 0
      ? person.knownFor.map((k) => k.title).join(", ")
      : null;
  return (
    // 위임 J #2 — 카드 자체가 button. 클릭 시 작품 패널 토글.
    // isSelected 시 amber 1.5px 보더로 활성 표현 (WorksCarousel 와 동일 패턴).
    // amber 누적 정책: 카로셀 카드 보더는 일시적/단일 활성이므로 ≤4 카운트 영향 미미.
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      aria-label={`${person.name} ${
        person.knownForDept === "Directing" ? "감독" : "배우"
      } 작품 보기`}
      className="shrink-0 flex flex-col items-center text-center active:scale-[0.97] transition-transform focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none rounded-md"
      style={{ width: 96, scrollSnapAlign: "start" }}
    >
      <div
        className="rounded-full overflow-hidden"
        style={{
          width: 72,
          height: 72,
          background: "var(--surface)",
          border: isSelected
            ? "1.5px solid var(--accent)"
            : "1px solid var(--border)",
          transition: "border-color 150ms",
        }}
      >
        {person.profileUrl ? (
          <Image
            src={person.profileUrl}
            alt={person.name}
            width={72}
            height={72}
            className="object-cover w-full h-full"
            sizes="72px"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center font-display text-2xl"
            style={{ color: "var(--accent)" }}
          >
            {person.name.charAt(0)}
          </div>
        )}
      </div>
      <div
        className="mt-2 text-xs font-medium truncate w-full"
        style={{ color: "var(--text-primary)" }}
      >
        {person.name}
      </div>
      {knownForText && (
        <div
          className="text-[11px] mt-0.5 truncate w-full"
          style={{ color: "var(--text-muted)" }}
          title={knownForText}
        >
          {knownForText}
        </div>
      )}
    </button>
  );
}

/**
 * Seeded Mix 2차 (2026-07-08) — Mix 탭 테마 제안 순수 헬퍼.
 *
 * 데이터 소스는 전부 로컬 (saved + persona tasteGenres) — 신규 API 0.
 * 각 테마는 "seed 작품" 으로 귀결되어 기존 seeded mix (related 기반 덱 주입) 를
 * 재사용한다. 장르/감독 테마는 해당 조건의 최신 저장작을 seed 로 쓰는 근사 —
 * 장르 전용 후보 검색(디스커버리 API)은 범위 밖 후속 과제.
 */
import { getGenreLabels, TMDB_GENRE_NAMES_KO } from '@neq/core';
import type { Recommendation, SavedItem } from './types';

export type MixThemeKind = 'recent_saved' | 'genre' | 'director';

export interface MixTheme {
  kind: MixThemeKind;
  /** 표시 제목 — 예: "인셉션 큐" / "스릴러 큐" / "봉준호 큐" */
  title: string;
  /** 장르 테마 전용 — TMDB 장르 id. 하이브리드 후보(genre-top mirror API) 조회 키. */
  genreId?: number;
  /**
   * 보조 설명 — 예: "최근 저장작" / "저장작 3편".
   * 기반 작품명은 노출하지 않음 (사용자 피드백 2026-07-08 — 알고리즘 개선 여지를
   * 위해 seed 작품은 내부 정보로만 유지).
   */
  subtitle: string;
  /** 믹스 seed (기존 seeded mix 로 연결) — UI 비노출, 내부용 */
  seed: Recommendation;
  /**
   * 카드 이미지 — 장르: seed 작품 스틸컷(backdrop, 없으면 poster),
   * 감독: 프로필 사진 (없으면 null → 이니셜 fallback), 최근 저장작: poster.
   */
  imageUrl: string | null;
}

export const MIX_THEME_RECENT_MAX = 6;
export const MIX_THEME_GENRE_MAX = 6;
export const MIX_THEME_DIRECTOR_MAX = 4;

/** savedAt desc 정렬 사본 (원본 불변). */
function byRecency(saved: SavedItem[]): SavedItem[] {
  return saved.slice().sort((a, b) => b.savedAt - a.savedAt);
}

/** 최근 저장작 seed 테마 — 상위 N. */
export function buildRecentSavedThemes(saved: SavedItem[], max = MIX_THEME_RECENT_MAX): MixTheme[] {
  return byRecency(saved)
    .slice(0, max)
    .map((s) => ({
      kind: 'recent_saved' as const,
      title: `${s.recommendation.title} 큐`,
      subtitle: '최근 저장작',
      seed: s.recommendation,
      imageUrl: s.recommendation.posterUrl,
    }));
}

/**
 * 장르 테마 — 저장작 genres 빈도 상위 순. seed = 해당 장르 최신 저장작.
 * tasteGenres(온보딩 취향 장르)는 slug 라 TMDB id 매핑이 없어 사용하지 않음 —
 * 저장작의 실제 genres(number[]) 만 사용 (미보유 저장분은 skip).
 */
export function buildGenreThemes(saved: SavedItem[], max = MIX_THEME_GENRE_MAX): MixTheme[] {
  const recent = byRecency(saved);
  const itemsByGenre = new Map<number, SavedItem[]>();
  for (const s of recent) {
    for (const g of s.recommendation.genres ?? []) {
      if (!(g in TMDB_GENRE_NAMES_KO)) continue; // 미매핑 id 잡음 제거
      const list = itemsByGenre.get(g);
      if (list) list.push(s);
      else itemsByGenre.set(g, [s]); // recency 순 유지
    }
  }
  // seed 분산 — 인접 테마가 같은 최신 저장작을 공유하면 이미지/후보가 반복되므로
  // 이미 쓰인 seed 는 피해 그 장르의 다음 최신작 선택 (전부 겹치면 최신작 유지).
  const usedSeeds = new Set<string>();
  return [...itemsByGenre.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, max)
    .map(([genreId, items]) => {
      const seedItem =
        items.find(
          (s) => !usedSeeds.has(`${s.recommendation.type}:${s.recommendation.tmdbId}`),
        ) ?? items[0];
      usedSeeds.add(`${seedItem.recommendation.type}:${seedItem.recommendation.tmdbId}`);
      return {
        kind: 'genre' as const,
        title: `${getGenreLabels([genreId])[0]} 큐`,
        genreId,
        subtitle: `저장작 ${items.length}편`,
        seed: seedItem.recommendation,
        imageUrl: seedItem.recommendation.backdrop ?? seedItem.recommendation.posterUrl,
      };
    });
}

/** 감독 테마 — director 보유 저장작을 감독별 그룹, 작품 수 desc. seed = 그 감독 최신 저장작. */
export function buildDirectorThemes(saved: SavedItem[], max = MIX_THEME_DIRECTOR_MAX): MixTheme[] {
  const recent = byRecency(saved);
  const count = new Map<string, number>();
  const latestByDirector = new Map<string, SavedItem>();
  // 프로필 사진 — 최신작에 없어도 그 감독의 다른 저장작에서 확보 (5/7 보유 실측).
  const profileByDirector = new Map<string, string>();
  for (const s of recent) {
    const d = s.recommendation.director;
    if (!d) continue;
    count.set(d, (count.get(d) ?? 0) + 1);
    if (!latestByDirector.has(d)) latestByDirector.set(d, s);
    const profile = s.recommendation.directorMember?.profileUrl;
    if (profile && !profileByDirector.has(d)) profileByDirector.set(d, profile);
  }
  return [...count.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([director, n]) => {
      const seedItem = latestByDirector.get(director)!;
      return {
        kind: 'director' as const,
        title: `${director} 큐`,
        subtitle: `저장작 ${n}편`,
        seed: seedItem.recommendation,
        imageUrl: profileByDirector.get(director) ?? null,
      };
    });
}

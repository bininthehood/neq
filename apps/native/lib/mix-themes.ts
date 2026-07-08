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
  /** 표시 제목 — 예: "인셉션 믹스" / "스릴러 믹스" / "봉준호 믹스" */
  title: string;
  /** 보조 설명 — 예: "최근 저장작" / "저장작 3편 기반" */
  subtitle: string;
  /** 믹스 seed (기존 seeded mix 로 연결) */
  seed: Recommendation;
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
      title: `${s.recommendation.title} 믹스`,
      subtitle: '최근 저장작',
      seed: s.recommendation,
    }));
}

/**
 * 장르 테마 — 저장작 genres 빈도 상위 순. seed = 해당 장르 최신 저장작.
 * tasteGenres(온보딩 취향 장르)는 slug 라 TMDB id 매핑이 없어 사용하지 않음 —
 * 저장작의 실제 genres(number[]) 만 사용 (미보유 저장분은 skip).
 */
export function buildGenreThemes(saved: SavedItem[], max = MIX_THEME_GENRE_MAX): MixTheme[] {
  const recent = byRecency(saved);
  const count = new Map<number, number>();
  const latestByGenre = new Map<number, SavedItem>();
  for (const s of recent) {
    for (const g of s.recommendation.genres ?? []) {
      if (!(g in TMDB_GENRE_NAMES_KO)) continue; // 미매핑 id 잡음 제거
      count.set(g, (count.get(g) ?? 0) + 1);
      if (!latestByGenre.has(g)) latestByGenre.set(g, s); // recent 순회라 첫 등장 = 최신
    }
  }
  return [...count.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([genreId, n]) => {
      const seedItem = latestByGenre.get(genreId)!;
      return {
        kind: 'genre' as const,
        title: `${getGenreLabels([genreId])[0]} 믹스`,
        subtitle: `저장작 ${n}편 기반 · ${seedItem.recommendation.title}`,
        seed: seedItem.recommendation,
      };
    });
}

/** 감독 테마 — director 보유 저장작을 감독별 그룹, 작품 수 desc. seed = 그 감독 최신 저장작. */
export function buildDirectorThemes(saved: SavedItem[], max = MIX_THEME_DIRECTOR_MAX): MixTheme[] {
  const recent = byRecency(saved);
  const count = new Map<string, number>();
  const latestByDirector = new Map<string, SavedItem>();
  for (const s of recent) {
    const d = s.recommendation.director;
    if (!d) continue;
    count.set(d, (count.get(d) ?? 0) + 1);
    if (!latestByDirector.has(d)) latestByDirector.set(d, s);
  }
  return [...count.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([director, n]) => {
      const seedItem = latestByDirector.get(director)!;
      return {
        kind: 'director' as const,
        title: `${director} 믹스`,
        subtitle: `저장작 ${n}편 · ${seedItem.recommendation.title}`,
        seed: seedItem.recommendation,
      };
    });
}

export interface Recommendation {
  title: string;
  titleEn: string;
  type: 'movie' | 'series';
  reason: string;
  tmdbId: number;
  posterUrl: string | null;
  rating: number;
  date: string;
  overview: string;
  providers: { name: string; logoUrl: string | null }[];
  watchLink: string | null;
}

export type WatchReaction = 'loved' | 'good' | 'meh' | 'dropped';

export interface SavedItem {
  recommendation: Recommendation;
  savedAt: number;
}

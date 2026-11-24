import type { GuardLevel } from "./db-guard";

export type CrawlQueueRow = {
  tmdb_id: number;
  media_type: "movie" | "tv";
  failed_count: number;
};

export function queueKey(row: Pick<CrawlQueueRow, "tmdb_id" | "media_type">): string {
  return `${row.media_type}:${row.tmdb_id}`;
}

/** Existing metadata is refreshed first; new metadata is never inserted above the ingest limit. */
export function selectQueueForGuard<T extends CrawlQueueRow>(
  rows: T[],
  existing: Set<string>,
  level: GuardLevel,
): T[] {
  if (level === "halt") return [];
  const eligible = level === "refreshOnly"
    ? rows.filter((row) => existing.has(queueKey(row)))
    : rows;
  return eligible.toSorted((a, b) => Number(existing.has(queueKey(b))) - Number(existing.has(queueKey(a))));
}

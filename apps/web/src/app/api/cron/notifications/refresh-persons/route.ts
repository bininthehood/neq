/**
 * GET /api/cron/notifications/refresh-persons
 *
 * 매주 토요일 17:00 UTC (= 일요일 02:00 KST) — saved_items 에서 감독·배우 person 추출.
 * 이후 new-release cron 이 이 person 의 신작을 매일 체크.
 *
 * P0-5a 풀구현:
 *   1. 활성 사용자 (지난 30일 saved 또는 watch 활동) 조회
 *   2. 활성 사용자의 saved_items 작품 ID 모음 (favorites = saved_items 만 사용)
 *   3. TMDB credits 호출 (movie/{id}/credits, tv/{id}/credits) — 작품 단위 dedup
 *   4. 감독 1명 + 주연 cast top 3 추출
 *   5. notification_followed_persons UPSERT (profile_id, person_id, role)
 *
 * 결정 사항 (_workspace/p0-5a-design.md §5):
 *   - favorites 소스: saved_items 만 (profiles.onboarding_picks 비활용)
 *   - cast top 3 (false positive 최소화)
 *
 * vercel.json: "0 17 * * 6"
 */

import { NextResponse } from "next/server";
import { isNotificationsEnabled } from "@/lib/env";
import { isAuthorizedCron } from "@/lib/notifications/cron-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  dedupPersonsForProfile,
  extractPersonsFromCredits,
  mapWithConcurrency,
  RateLimiter,
  tmdbCredits,
  workKey,
  type ExtractedPerson,
  type MediaType,
} from "@/lib/notifications/persons-helpers";

const TMDB_CONCURRENCY = 6;
const PAGE_SIZE = 1000;
const UPSERT_BATCH = 500;

interface SavedRow {
  profile_id: string;
  tmdb_id: number;
  media_type: MediaType;
}

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isNotificationsEnabled()) {
    return NextResponse.json({ ok: true, disabled: true, processed: 0 });
  }

  const tmdbApiKey = process.env.TMDB_API_KEY;
  if (!tmdbApiKey) {
    return NextResponse.json(
      { error: "TMDB_API_KEY missing" },
      { status: 500 },
    );
  }

  const startedAt = Date.now();
  const admin = supabaseAdmin();

  // STEP 1 — 활성 사용자 조회 (지난 30일 saved 또는 watch 활동)
  let activeProfileIds: string[];
  try {
    activeProfileIds = await fetchActiveProfileIds(admin);
  } catch (err) {
    console.error("[cron/refresh-persons] active profiles fetch failed:", err);
    return NextResponse.json(
      { error: "active-profiles-failed", detail: String(err) },
      { status: 500 },
    );
  }

  if (activeProfileIds.length === 0) {
    return NextResponse.json({
      ok: true,
      active_profiles: 0,
      total_works_processed: 0,
      unique_persons_extracted: 0,
      rows_inserted_or_updated: 0,
      tmdb_calls: 0,
      duration_ms: Date.now() - startedAt,
      errors: [],
    });
  }

  // STEP 2 — 활성 사용자의 saved_items 조회
  let savedRows: SavedRow[];
  try {
    savedRows = await fetchSavedItemsForProfiles(admin, activeProfileIds);
  } catch (err) {
    console.error("[cron/refresh-persons] saved_items fetch failed:", err);
    return NextResponse.json(
      { error: "saved-items-failed", detail: String(err) },
      { status: 500 },
    );
  }

  // 작품 단위 dedup (TMDB credits 호출은 작품당 1회)
  const distinctWorks = new Map<string, { tmdbId: number; mediaType: MediaType }>();
  for (const r of savedRows) {
    const k = workKey(r.tmdb_id, r.media_type);
    if (!distinctWorks.has(k)) {
      distinctWorks.set(k, { tmdbId: r.tmdb_id, mediaType: r.media_type });
    }
  }
  const uniqueWorkList = Array.from(distinctWorks.values());

  // STEP 3 — TMDB credits 호출 + 캐시
  const limiter = new RateLimiter(30);
  const errors: Array<{ tmdb_id: number; media_type: MediaType; error: string }> = [];
  const personsCache = new Map<string, ExtractedPerson[]>();
  let tmdbCalls = 0;

  await mapWithConcurrency(uniqueWorkList, TMDB_CONCURRENCY, async (w) => {
    try {
      const credits = await tmdbCredits(
        w.tmdbId,
        w.mediaType,
        tmdbApiKey,
        limiter,
      );
      tmdbCalls += 1;
      personsCache.set(workKey(w.tmdbId, w.mediaType), extractPersonsFromCredits(credits));
    } catch (err) {
      errors.push({
        tmdb_id: w.tmdbId,
        media_type: w.mediaType,
        error: String(err),
      });
      personsCache.set(workKey(w.tmdbId, w.mediaType), []);
    }
  });

  // STEP 4 — 사용자별 PersonRow dedup
  const profileToWorks = new Map<string, SavedRow[]>();
  for (const r of savedRows) {
    if (!profileToWorks.has(r.profile_id)) {
      profileToWorks.set(r.profile_id, []);
    }
    profileToWorks.get(r.profile_id)!.push(r);
  }

  const allRows: Array<{
    profile_id: string;
    person_id: number;
    person_name: string;
    role: "director" | "actor";
    source_work_id: number;
    source_media_type: MediaType;
  }> = [];

  const uniquePersonIds = new Set<number>();
  for (const [profileId, rows] of profileToWorks) {
    const works = rows.map((r) => ({
      tmdbId: r.tmdb_id,
      mediaType: r.media_type,
      persons: personsCache.get(workKey(r.tmdb_id, r.media_type)) ?? [],
    }));
    const dedupedRows = dedupPersonsForProfile(profileId, works);
    for (const d of dedupedRows) {
      uniquePersonIds.add(d.personId);
      allRows.push({
        profile_id: d.profileId,
        person_id: d.personId,
        person_name: d.personName,
        role: d.role,
        source_work_id: d.sourceWorkId,
        source_media_type: d.sourceMediaType,
      });
    }
  }

  // STEP 5 — UPSERT batch (UNIQUE profile_id, person_id, role)
  let rowsInsertedOrUpdated = 0;
  for (let i = 0; i < allRows.length; i += UPSERT_BATCH) {
    const batch = allRows.slice(i, i + UPSERT_BATCH);
    const { error: upErr } = await admin
      .from("notification_followed_persons")
      .upsert(batch, {
        onConflict: "profile_id,person_id,role",
        ignoreDuplicates: false,
      });
    if (upErr) {
      console.error("[cron/refresh-persons] upsert batch failed:", upErr);
      return NextResponse.json(
        { error: "upsert-failed", detail: upErr.message },
        { status: 500 },
      );
    }
    rowsInsertedOrUpdated += batch.length;
  }

  return NextResponse.json({
    ok: true,
    active_profiles: activeProfileIds.length,
    total_works_processed: uniqueWorkList.length,
    unique_persons_extracted: uniquePersonIds.size,
    rows_inserted_or_updated: rowsInsertedOrUpdated,
    tmdb_calls: tmdbCalls,
    duration_ms: Date.now() - startedAt,
    errors: errors.slice(0, 50),
    errors_total: errors.length,
  });
}

// ─────────────────────────────────────────────────────────────────
// helpers — orchestration (DB I/O)
// ─────────────────────────────────────────────────────────────────

async function fetchActiveProfileIds(
  admin: ReturnType<typeof supabaseAdmin>,
): Promise<string[]> {
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const ids = new Set<string>();

  // saved_items 활동
  let from = 0;
  for (;;) {
    const { data, error } = await admin
      .from("saved_items")
      .select("profile_id")
      .gte("saved_at", since)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) {
      if (typeof row.profile_id === "string") ids.add(row.profile_id);
    }
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  // watch_reports 활동
  from = 0;
  for (;;) {
    const { data, error } = await admin
      .from("watch_reports")
      .select("profile_id")
      .gte("reported_at", since)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) {
      if (typeof row.profile_id === "string") ids.add(row.profile_id);
    }
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return Array.from(ids);
}

async function fetchSavedItemsForProfiles(
  admin: ReturnType<typeof supabaseAdmin>,
  profileIds: string[],
): Promise<SavedRow[]> {
  if (profileIds.length === 0) return [];

  const rows: SavedRow[] = [];
  // .in() 쪼개기 (Supabase REST URL 길이 한도 안전)
  const ID_PAGE = 200;
  for (let i = 0; i < profileIds.length; i += ID_PAGE) {
    const idSlice = profileIds.slice(i, i + ID_PAGE);
    let from = 0;
    for (;;) {
      const { data, error } = await admin
        .from("saved_items")
        .select("profile_id, tmdb_id, type")
        .in("profile_id", idSlice)
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const row of data) {
        const tmdbId = row.tmdb_id as number;
        const type = row.type as MediaType;
        if (
          typeof row.profile_id === "string" &&
          typeof tmdbId === "number" &&
          (type === "movie" || type === "tv")
        ) {
          rows.push({
            profile_id: row.profile_id,
            tmdb_id: tmdbId,
            media_type: type,
          });
        }
      }
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
  }
  return rows;
}

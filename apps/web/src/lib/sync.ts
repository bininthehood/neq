"use client";

import * as Sentry from "@sentry/nextjs";
import { supabase, ensureAuth, getAuthUid } from "./supabase";
import { getDeviceId } from "./device-id";
import {
  getSaved,
  getWatchReports,
  getSeenTitles,
  getArchivedIds,
  addSaved,
  addWatchReport,
  archiveItem,
} from "./store";
import type { SavedItem, WatchReport } from "./types";

// ---------- Profile ----------

/**
 * auth.uid() 기반 프로필 조회 또는 생성. device_id 마이그레이션 포함.
 *
 * 1. auth.uid()로 프로필 조회 → 있으면 반환
 * 2. device_id로 기존 프로필 조회 → 있으면 user_id 연결 후 반환
 * 3. 둘 다 없으면 새 프로필 생성
 */
async function getOrCreateProfile(): Promise<string | null> {
  await ensureAuth();
  const uid = await getAuthUid();
  if (!uid) return null;

  // 1. auth.uid() 기반 조회
  const { data: byUid } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", uid)
    .single();

  if (byUid) return byUid.id;

  // 2. device_id 마이그레이션: 기존 프로필에 user_id 연결
  const deviceId = getDeviceId();
  if (deviceId) {
    const { data: byDevice } = await supabase
      .from("profiles")
      .select("id, user_id")
      .eq("device_id", deviceId)
      .single();

    if (byDevice && !byDevice.user_id) {
      await supabase
        .from("profiles")
        .update({ user_id: uid })
        .eq("id", byDevice.id);
      return byDevice.id;
    }
  }

  // 3. 신규 생성
  const { data: created, error } = await supabase
    .from("profiles")
    .insert({ device_id: deviceId, user_id: uid })
    .select("id")
    .single();

  if (error) {
    console.error("[sync] profile creation failed:", error.message);
    Sentry.captureMessage(`[sync] profile creation failed: ${error.message}`, {
      level: "error",
      tags: { origin: "sync.getOrCreateProfile" },
    });
    return null;
  }

  return created.id;
}

// ---------- Push: localStorage → Supabase ----------

/** 로컬 데이터를 서버에 업로드 (upsert) */
export async function pushToServer(): Promise<{ success: boolean; pushed: number }> {
  const profileId = await getOrCreateProfile();
  if (!profileId) return { success: false, pushed: 0 };

  let pushed = 0;

  try {
    // 1. saved_items
    const saved = getSaved();
    if (saved.length > 0) {
      const rows = saved.map((s: SavedItem) => ({
        profile_id: profileId,
        tmdb_id: s.recommendation.tmdbId,
        title: s.recommendation.title,
        title_en: s.recommendation.titleEn,
        type: s.recommendation.type,
        poster_url: s.recommendation.posterUrl,
        rating: s.recommendation.rating,
        reason: s.recommendation.reason,
        providers: s.recommendation.providers,
        metadata: {
          director: s.recommendation.director,
          cast: s.recommendation.cast,
          runtime: s.recommendation.runtime,
          seasons: s.recommendation.seasons,
          country: s.recommendation.country,
          overview: s.recommendation.overview,
          backdrop: s.recommendation.backdrop,
        },
        saved_at: new Date(s.savedAt).toISOString(),
      }));

      const { error } = await supabase
        .from("saved_items")
        .upsert(rows, { onConflict: "profile_id,tmdb_id" });

      if (!error) pushed += rows.length;
    }

    // 2. watch_reports
    const reports = getWatchReports();
    if (reports.length > 0) {
      const rows = reports.map((r: WatchReport) => ({
        profile_id: profileId,
        tmdb_id: r.tmdbId,
        reaction: r.reaction,
        reported_at: new Date(r.reportedAt).toISOString(),
      }));

      const { error } = await supabase
        .from("watch_reports")
        .upsert(rows, { onConflict: "profile_id,tmdb_id" });

      if (!error) pushed += rows.length;
    }

    // 3. seen_titles
    const seen = getSeenTitles();
    if (seen.length > 0) {
      // seen은 양이 많을 수 있으므로 서버에 없는 것만 추가
      const { data: existing } = await supabase
        .from("seen_titles")
        .select("title")
        .eq("profile_id", profileId);

      const existingSet = new Set((existing ?? []).map((e: { title: string }) => e.title));
      const newTitles = seen.filter((t) => !existingSet.has(t));

      if (newTitles.length > 0) {
        const rows = newTitles.map((title) => ({
          profile_id: profileId,
          title,
        }));

        // 배치 삽입 (100개씩)
        for (let i = 0; i < rows.length; i += 100) {
          await supabase.from("seen_titles").insert(rows.slice(i, i + 100));
        }
        pushed += newTitles.length;
      }
    }

    // 4. archived
    const archivedIds = getArchivedIds();
    if (archivedIds.length > 0) {
      const rows = archivedIds.map((tmdbId) => ({
        profile_id: profileId,
        tmdb_id: tmdbId,
      }));

      const { error } = await supabase
        .from("archived_items")
        .upsert(rows, { onConflict: "profile_id,tmdb_id" });

      if (!error) pushed += rows.length;
    }

    console.log(`[sync] pushed ${pushed} items to server`);
    return { success: true, pushed };
  } catch (err) {
    console.error("[sync] push failed:", err);
    Sentry.captureException(err, { tags: { origin: "sync.pushToServer" } });
    return { success: false, pushed };
  }
}

// ---------- Pull: Supabase → localStorage ----------

/** 서버 데이터를 로컬로 가져오기 (로컬에 없는 것만 추가) */
export async function pullFromServer(): Promise<{ success: boolean; pulled: number }> {
  const profileId = await getOrCreateProfile();
  if (!profileId) return { success: false, pulled: 0 };

  let pulled = 0;

  try {
    // 1. saved_items
    const { data: serverSaved } = await supabase
      .from("saved_items")
      .select("*")
      .eq("profile_id", profileId);

    if (serverSaved && serverSaved.length > 0) {
      const localSaved = getSaved();
      const localIds = new Set(localSaved.map((s) => s.recommendation.tmdbId));

      for (const row of serverSaved) {
        if (localIds.has(row.tmdb_id)) continue;

        addSaved({
          title: row.title,
          titleEn: row.title_en ?? "",
          type: row.type,
          reason: row.reason ?? "",
          tmdbId: row.tmdb_id,
          posterUrl: row.poster_url,
          rating: row.rating ?? 0,
          date: "",
          overview: row.metadata?.overview ?? "",
          providers: row.providers ?? [],
          watchLink: null,
          director: row.metadata?.director ?? null,
          cast: row.metadata?.cast ?? [],
          runtime: row.metadata?.runtime ?? null,
          seasons: row.metadata?.seasons ?? null,
          country: row.metadata?.country ?? [],
          backdrop: row.metadata?.backdrop ?? null,
        });
        pulled++;
      }
    }

    // 2. watch_reports
    const { data: serverReports } = await supabase
      .from("watch_reports")
      .select("*")
      .eq("profile_id", profileId);

    if (serverReports && serverReports.length > 0) {
      const localReports = getWatchReports();
      const localReportIds = new Set(localReports.map((r) => r.tmdbId));

      for (const row of serverReports) {
        if (localReportIds.has(row.tmdb_id)) continue;
        addWatchReport(row.tmdb_id, row.reaction);
        pulled++;
      }
    }

    // 3. archived
    const { data: serverArchived } = await supabase
      .from("archived_items")
      .select("tmdb_id")
      .eq("profile_id", profileId);

    if (serverArchived && serverArchived.length > 0) {
      const localArchived = new Set(getArchivedIds());
      for (const row of serverArchived) {
        if (localArchived.has(row.tmdb_id)) continue;
        archiveItem(row.tmdb_id);
        pulled++;
      }
    }

    console.log(`[sync] pulled ${pulled} items from server`);
    return { success: true, pulled };
  } catch (err) {
    console.error("[sync] pull failed:", err);
    Sentry.captureException(err, { tags: { origin: "sync.pullFromServer" } });
    return { success: false, pulled };
  }
}

// ---------- Full Sync ----------

/** 양방향 동기화: pull 먼저 (서버 우선) → push (로컬 추가분) */
export async function syncAll(): Promise<{ success: boolean; pulled: number; pushed: number }> {
  const pullResult = await pullFromServer();
  const pushResult = await pushToServer();

  return {
    success: pullResult.success && pushResult.success,
    pulled: pullResult.pulled,
    pushed: pushResult.pushed,
  };
}

// ---------- 마지막 동기화 시간 ----------

const LAST_SYNC_KEY = "neq_last_sync";

export function getLastSyncTime(): number {
  if (typeof window === "undefined") return 0;
  return Number(localStorage.getItem(LAST_SYNC_KEY) ?? "0");
}

export function setLastSyncTime() {
  localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
}

/** 마지막 동기화로부터 N분 이상 경과했는지 */
export function shouldSync(intervalMinutes: number = 5): boolean {
  const last = getLastSyncTime();
  return Date.now() - last > intervalMinutes * 60 * 1000;
}

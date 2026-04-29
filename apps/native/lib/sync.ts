import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, ensureAuth, getAuthUid } from './supabase';
import { env, isOnboardingV2Enabled } from './env';
import {
  getSaved,
  getWatchReports,
  addSaved,
  addWatchReport,
  getDeviceId,
  getAccountPrefs,
  setAccountPrefs,
  defaultAccountPrefs,
} from './store';
import type { AccountPrefs, SavedItem, WatchReport } from './types';

const LAST_SYNC_KEY = 'neq_last_sync';

function isConfigured(): boolean {
  return !!env.SUPABASE_URL && !!env.SUPABASE_ANON_KEY;
}

async function getOrCreateProfile(): Promise<string | null> {
  await ensureAuth();
  const uid = await getAuthUid();
  if (!uid) return null;

  const { data: byUid } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_id', uid)
    .single();

  if (byUid) return byUid.id;

  const deviceId = await getDeviceId();

  const { data: byDevice } = await supabase
    .from('profiles')
    .select('id, user_id')
    .eq('device_id', deviceId)
    .single();

  if (byDevice && !byDevice.user_id) {
    await supabase
      .from('profiles')
      .update({ user_id: uid })
      .eq('id', byDevice.id);
    return byDevice.id;
  }

  const { data: created, error } = await supabase
    .from('profiles')
    .insert({ device_id: deviceId, user_id: uid })
    .select('id')
    .single();

  if (error) {
    console.error('[sync] profile creation failed:', error.message);
    return null;
  }

  return created.id;
}

export async function pushToServer(): Promise<{ success: boolean; pushed: number }> {
  if (!isConfigured()) return { success: false, pushed: 0 };

  const profileId = await getOrCreateProfile();
  if (!profileId) return { success: false, pushed: 0 };

  let pushed = 0;

  try {
    const saved = await getSaved();
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
        .from('saved_items')
        .upsert(rows, { onConflict: 'profile_id,tmdb_id' });

      if (!error) pushed += rows.length;
    }

    const reports = await getWatchReports();
    if (reports.length > 0) {
      const rows = reports.map((r: WatchReport) => ({
        profile_id: profileId,
        tmdb_id: r.tmdbId,
        reaction: r.reaction,
        reported_at: new Date(r.reportedAt).toISOString(),
      }));

      const { error } = await supabase
        .from('watch_reports')
        .upsert(rows, { onConflict: 'profile_id,tmdb_id' });

      if (!error) pushed += rows.length;
    }

    // account_prefs (Onboarding V2 — feature flag 뒤)
    //   flag OFF 시 column 자체를 건드리지 않으므로 V1 prod 영향 0.
    //   web `apps/web/src/lib/sync.ts` 의 account_prefs 분기와 동일.
    if (isOnboardingV2Enabled()) {
      const accountPrefs = await getAccountPrefs();
      const { error } = await supabase
        .from('profiles')
        .update({ account_prefs: accountPrefs })
        .eq('id', profileId);

      if (!error) pushed += 1;
    }

    console.log(`[sync] pushed ${pushed} items to server`);
    return { success: true, pushed };
  } catch (err) {
    console.error('[sync] push failed:', err);
    return { success: false, pushed };
  }
}

export async function pullFromServer(): Promise<{ success: boolean; pulled: number }> {
  if (!isConfigured()) return { success: false, pulled: 0 };

  const profileId = await getOrCreateProfile();
  if (!profileId) return { success: false, pulled: 0 };

  let pulled = 0;

  try {
    const { data: serverSaved } = await supabase
      .from('saved_items')
      .select('*')
      .eq('profile_id', profileId);

    if (serverSaved && serverSaved.length > 0) {
      const localSaved = await getSaved();
      const localIds = new Set(localSaved.map((s) => s.recommendation.tmdbId));

      for (const row of serverSaved) {
        if (localIds.has(row.tmdb_id)) continue;

        await addSaved({
          title: row.title,
          titleEn: row.title_en ?? '',
          type: row.type,
          reason: row.reason ?? '',
          tmdbId: row.tmdb_id,
          posterUrl: row.poster_url,
          rating: row.rating ?? 0,
          date: '',
          overview: row.metadata?.overview ?? '',
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

    const { data: serverReports } = await supabase
      .from('watch_reports')
      .select('*')
      .eq('profile_id', profileId);

    if (serverReports && serverReports.length > 0) {
      const localReports = await getWatchReports();
      const localReportIds = new Set(localReports.map((r) => r.tmdbId));

      for (const row of serverReports) {
        if (localReportIds.has(row.tmdb_id)) continue;
        await addWatchReport(row.tmdb_id, row.reaction);
        pulled++;
      }
    }

    // account_prefs (Onboarding V2 — feature flag 뒤)
    //   flag OFF → column 무시 → V1 영향 0.
    //   서버 우선 — default 와 동일하면 굳이 덮어쓰지 않음 (web 동일 패턴).
    if (isOnboardingV2Enabled()) {
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('account_prefs')
        .eq('id', profileId)
        .single();

      const row = profileRow as { account_prefs?: AccountPrefs | null } | null;
      const serverPrefs = row?.account_prefs ?? null;
      if (serverPrefs && typeof serverPrefs === 'object') {
        const merged: AccountPrefs = {
          ...defaultAccountPrefs(),
          ...serverPrefs,
          notificationPrefs: {
            ...defaultAccountPrefs().notificationPrefs,
            ...(serverPrefs.notificationPrefs ?? {}),
          },
        };
        await setAccountPrefs(merged);
        pulled += 1;
      }
    }

    console.log(`[sync] pulled ${pulled} items from server`);
    return { success: true, pulled };
  } catch (err) {
    console.error('[sync] pull failed:', err);
    return { success: false, pulled };
  }
}

export async function syncAll(): Promise<{ success: boolean; pulled: number; pushed: number }> {
  const pullResult = await pullFromServer();
  const pushResult = await pushToServer();

  return {
    success: pullResult.success && pushResult.success,
    pulled: pullResult.pulled,
    pushed: pushResult.pushed,
  };
}

export async function getLastSyncTime(): Promise<number> {
  const raw = await AsyncStorage.getItem(LAST_SYNC_KEY);
  return Number(raw ?? '0');
}

export async function setLastSyncTime(): Promise<void> {
  await AsyncStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
}

export async function shouldSync(intervalMinutes: number = 5): Promise<boolean> {
  const last = await getLastSyncTime();
  return Date.now() - last > intervalMinutes * 60 * 1000;
}

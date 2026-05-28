import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, ensureAuth, getAuthUid } from './supabase';
import { env } from './env';
import {
  getSaved,
  getWatchReports,
  addSaved,
  addWatchReport,
  getDeviceId,
  getAccountPrefs,
  setAccountPrefs,
  defaultAccountPrefs,
  isDefaultPersonaBucket,
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

  // W5 Task G — non-default persona 가 활성일 때 watch_reports / account_prefs 동기화 skip.
  // web `apps/web/src/lib/sync.ts:94, 134-135, 152-153` 와 동일한 v1 sync limitation.
  // saved_items 는 글로벌이므로 항상 동기화.
  //
  // 2026-05-28 — 시드 페르소나 제거 후 'default' id 직접 비교 → personas[0] 기반
  // bucket 판정으로 변경 (`isDefaultPersonaBucket`). 첫 페르소나는 사용자가 명시
  // 생성한 UUID id 라도 personas[0] 이므로 default bucket 으로 간주 → sync 정상.
  const isDefaultPersona = await isDefaultPersonaBucket();
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

    // watch_reports — default persona only (web v1 sync limitation 정합).
    const reports = isDefaultPersona ? await getWatchReports() : [];
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

    // account_prefs (Onboarding V2) — default persona only.
    if (isDefaultPersona) {
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

  // W5 Task G — v1 sync limitation: 비-default persona 가 활성일 때 pull skip.
  // web `apps/web/src/lib/sync.ts:227-234` 와 동일.
  // 이유: store setter 들이 single bucket 에 쓰기 때문에 서버 데이터(default 기준)가
  // 활성 persona 와 무관하게 덮어써질 위험. saved 는 글로벌이므로 큰 문제 없지만
  // watch_reports / account_prefs 가 섞이는 것 방지. v2 sync (persona-aware) 에서 해제.
  //
  // 2026-05-28 — 시드 페르소나 제거 후 personas[0] = default bucket 으로 의미 재정의.
  if (!(await isDefaultPersonaBucket())) {
    console.log('[sync] pull skipped — non-default persona active (v1 limitation)');
    return { success: true, pulled: 0 };
  }

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

    // account_prefs (Onboarding V2)
    //   2026-05-18 — v1 회귀 audit: 이전 구현은 서버 prefs 가 비어 있어도 (다른 디바이스
    //   진입 / anon ID 충돌 / 첫 push 전 pull 등) `default + serverPrefs` merge 가
    //   local 의 tasteGenres / subscribedOtt 를 빈 배열로 덮어 v2 → v1 회귀가 발생.
    //
    //   Fix: 필드 단위로 "비어있지 않은 쪽을 보존" — 서버 빈 + 로컬 채움 → 로컬 보존.
    //   notificationPrefs 는 server override 우선 (사용자가 다른 디바이스에서 변경 가능).
    {
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('account_prefs')
        .eq('id', profileId)
        .single();

      const row = profileRow as { account_prefs?: AccountPrefs | null } | null;
      const serverPrefs = row?.account_prefs ?? null;
      if (serverPrefs && typeof serverPrefs === 'object') {
        const localPrefs = await getAccountPrefs();

        const serverTaste = Array.isArray(serverPrefs.tasteGenres) ? serverPrefs.tasteGenres : [];
        const serverOtt = Array.isArray(serverPrefs.subscribedOtt) ? serverPrefs.subscribedOtt : [];

        const merged: AccountPrefs = {
          ...defaultAccountPrefs(),
          // 빈 server 배열 → local 보존. 둘 다 비어있으면 default 빈 배열 그대로.
          tasteGenres: serverTaste.length > 0 ? serverTaste : localPrefs.tasteGenres,
          subscribedOtt: serverOtt.length > 0 ? serverOtt : localPrefs.subscribedOtt,
          notificationPrefs: {
            ...defaultAccountPrefs().notificationPrefs,
            ...(localPrefs.notificationPrefs ?? {}),
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

/**
 * W5 Task E — Supabase wipe.
 *
 * web 정본: `apps/web/src/lib/sync.ts:387` `wipeCloudData()`.
 * "모든 데이터 초기화" 시 `clearAllUserData()` 와 함께 호출해야 다음 sync 에서
 * cloud 가 다시 끌어오지 않는다. 호출하지 않으면 reset 후 다음 pull 에서
 * 서버 데이터가 그대로 부활.
 *
 * 삭제 대상 (web 정합):
 *   - saved_items     : profile_id 기준 행 삭제
 *   - watch_reports   : profile_id 기준 행 삭제
 *   - profiles.account_prefs / onboarding_picks : NULL 로 리셋 (row 자체는 auth uid 와
 *     연결되므로 유지)
 *
 * native 만의 차이: web 의 seen_titles / archived_items 는 native sync 에 아직 미포함
 * (페르소나 / 아카이브 UI 미구현 단계). 향후 추가 시 본 함수도 확장.
 *
 * 디바이스 격리 (메모리 `project_anon_auth_device_isolation`): 현재 anon 인증은 디바이스마다
 * 별도 user_id 라 다른 디바이스에 격리됨. 향후 OAuth + linkIdentity 도입 시점에는
 * 사용자가 명시적으로 "모든 디바이스 데이터 초기화" 의도일 수 있으므로 그대로 유효.
 *
 * 실패 시 silent — sentry/posthog 미연동 native 환경에서는 console.error 만.
 */
export async function wipeCloudData(): Promise<{ success: boolean }> {
  if (!isConfigured()) return { success: false };

  const profileId = await getOrCreateProfile();
  if (!profileId) return { success: false };

  try {
    await Promise.all([
      supabase.from('saved_items').delete().eq('profile_id', profileId),
      supabase.from('watch_reports').delete().eq('profile_id', profileId),
    ]);
    await supabase
      .from('profiles')
      .update({ onboarding_picks: null, account_prefs: null })
      .eq('id', profileId);
    return { success: true };
  } catch (err) {
    console.error('[sync] wipeCloudData failed:', err);
    return { success: false };
  }
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

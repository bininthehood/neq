import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import type { Recommendation, SavedItem, WatchReaction, WatchReport } from './types';

const SAVED_KEY = 'neq_saved';
const WATCH_REPORTS_KEY = 'neq_watch_reports';
const DEVICE_ID_KEY = 'neq_device_id';

async function safeGet<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// ---------- saved ----------

export async function getSaved(): Promise<SavedItem[]> {
  return safeGet<SavedItem[]>(SAVED_KEY, []);
}

export async function isSaved(tmdbId: number): Promise<boolean> {
  const saved = await getSaved();
  return saved.some((s) => s.recommendation.tmdbId === tmdbId);
}

export async function addSaved(rec: Recommendation): Promise<void> {
  const saved = await getSaved();
  if (saved.some((s) => s.recommendation.tmdbId === rec.tmdbId)) return;
  const next: SavedItem[] = [{ recommendation: rec, savedAt: Date.now() }, ...saved];
  await AsyncStorage.setItem(SAVED_KEY, JSON.stringify(next));
}

export async function removeSaved(tmdbId: number): Promise<void> {
  const saved = await getSaved();
  const next = saved.filter((s) => s.recommendation.tmdbId !== tmdbId);
  await AsyncStorage.setItem(SAVED_KEY, JSON.stringify(next));
}

export async function toggleSaved(rec: Recommendation): Promise<boolean> {
  const saved = await isSaved(rec.tmdbId);
  if (saved) {
    await removeSaved(rec.tmdbId);
    return false;
  }
  await addSaved(rec);
  return true;
}

// ---------- watch reports ----------

export async function getWatchReports(): Promise<WatchReport[]> {
  return safeGet<WatchReport[]>(WATCH_REPORTS_KEY, []);
}

export async function addWatchReport(tmdbId: number, reaction: WatchReaction): Promise<void> {
  const reports = await getWatchReports();
  const without = reports.filter((r) => r.tmdbId !== tmdbId);
  const next: WatchReport[] = [{ tmdbId, reaction, reportedAt: Date.now() }, ...without];
  await AsyncStorage.setItem(WATCH_REPORTS_KEY, JSON.stringify(next));
}

export async function getWatchStats(): Promise<{
  total: number;
  loved: number;
  good: number;
  meh: number;
  dropped: number;
}> {
  const reports = await getWatchReports();
  return {
    total: reports.length,
    loved: reports.filter((r) => r.reaction === 'loved').length,
    good: reports.filter((r) => r.reaction === 'good').length,
    meh: reports.filter((r) => r.reaction === 'meh').length,
    dropped: reports.filter((r) => r.reaction === 'dropped').length,
  };
}

// ---------- device id ----------

export async function getDeviceId(): Promise<string> {
  let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = Crypto.randomUUID();
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

// ---------- reset ----------

export async function clearAllUserData(): Promise<void> {
  await AsyncStorage.multiRemove([SAVED_KEY, WATCH_REPORTS_KEY]);
  // device_id는 유지 (익명 식별자 안정성)
}

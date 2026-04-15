import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Recommendation, SavedItem } from './types';

const SAVED_KEY = 'neq_saved';

async function safeGet<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

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

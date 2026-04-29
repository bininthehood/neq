import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import type {
  AccountPrefs,
  NekoPushSubscriptionJSON,
  NotificationPrefs,
  Recommendation,
  SavedItem,
  WatchReaction,
  WatchReport,
} from './types';

const SAVED_KEY = 'neq_saved';
const WATCH_REPORTS_KEY = 'neq_watch_reports';
const DEVICE_ID_KEY = 'neq_device_id';
const ACCOUNT_PREFS_KEY = 'neq_account_prefs';

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

// ---------- account prefs (Onboarding V2 — P0-1) ----------
//
// 페르소나 외부의 "계정 전체" 단위 설정을 AsyncStorage에 단일 JSON 키로 저장.
// - tasteGenres   : 장르 칩 멀티 선택 (LLM 강한 신호로 사용)
// - subscribedOtt : 구독 OTT provider id (LLM 약한 신호 — 가중치)
// - notificationPrefs : 4종 알림 토글 + Web Push subscription
//
// 키: 'neq_account_prefs' (web LocalStorage 키와 동일 — 양 플랫폼 호환).
//
// DECISIONS.md #23: 네이티브 알림 architecture 보류. 본 모듈은
// `notificationPrefs.pushSubscription` 을 native 에서 발급하지 않으며
// 항상 null 유지 (Web Push 전용).
//
// 스펙: _workspace/onboarding-v2-spec.md §1.2

export function defaultNotificationPrefs(): NotificationPrefs {
  return {
    weeklyRec: false,
    newRelease: false,
    ottExpiry: false,
    monthlyReport: false,
    pushSubscription: null,
  };
}

export function defaultAccountPrefs(): AccountPrefs {
  return {
    tasteGenres: [],
    subscribedOtt: [],
    notificationPrefs: defaultNotificationPrefs(),
  };
}

/**
 * AsyncStorage 의 raw 문자열을 AccountPrefs 로 안전 복원.
 * - JSON 파싱 실패 → default
 * - 누락된 필드 → default 로 채움 (forward-compat)
 * - 타입 불일치 → default 필드로 fallback
 *
 * web `apps/web/src/lib/account-prefs.ts` 의 parseAccountPrefs 와 동일한 로직.
 */
function parseAccountPrefs(raw: string | null): AccountPrefs {
  if (!raw) return defaultAccountPrefs();
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return defaultAccountPrefs();
  }
  if (!obj || typeof obj !== 'object') return defaultAccountPrefs();
  const o = obj as Record<string, unknown>;

  const tasteGenres = Array.isArray(o.tasteGenres)
    ? o.tasteGenres.filter((x): x is string => typeof x === 'string')
    : [];
  const subscribedOtt = Array.isArray(o.subscribedOtt)
    ? o.subscribedOtt.filter((x): x is number => typeof x === 'number')
    : [];

  const np = (o.notificationPrefs ?? {}) as Record<string, unknown>;
  const notificationPrefs: NotificationPrefs = {
    weeklyRec: typeof np.weeklyRec === 'boolean' ? np.weeklyRec : false,
    newRelease: typeof np.newRelease === 'boolean' ? np.newRelease : false,
    ottExpiry: typeof np.ottExpiry === 'boolean' ? np.ottExpiry : false,
    monthlyReport:
      typeof np.monthlyReport === 'boolean' ? np.monthlyReport : false,
    pushSubscription:
      np.pushSubscription && typeof np.pushSubscription === 'object'
        ? (np.pushSubscription as NekoPushSubscriptionJSON)
        : null,
  };

  return { tasteGenres, subscribedOtt, notificationPrefs };
}

export async function getAccountPrefs(): Promise<AccountPrefs> {
  const raw = await AsyncStorage.getItem(ACCOUNT_PREFS_KEY).catch(() => null);
  return parseAccountPrefs(raw);
}

export async function setAccountPrefs(prefs: AccountPrefs): Promise<void> {
  await AsyncStorage.setItem(ACCOUNT_PREFS_KEY, JSON.stringify(prefs));
}

export async function updateAccountPrefs(
  updater: (prev: AccountPrefs) => AccountPrefs,
): Promise<void> {
  const next = updater(await getAccountPrefs());
  await setAccountPrefs(next);
}

export async function setTasteGenres(genres: string[]): Promise<void> {
  await updateAccountPrefs((prev) => ({ ...prev, tasteGenres: genres }));
}

export async function setSubscribedOtt(providers: number[]): Promise<void> {
  await updateAccountPrefs((prev) => ({ ...prev, subscribedOtt: providers }));
}

export async function updateNotificationPrefs(
  updater: (prev: NotificationPrefs) => NotificationPrefs,
): Promise<void> {
  await updateAccountPrefs((prev) => ({
    ...prev,
    notificationPrefs: updater(prev.notificationPrefs),
  }));
}

export async function clearAccountPrefs(): Promise<void> {
  await AsyncStorage.removeItem(ACCOUNT_PREFS_KEY);
}

// ---------- reset ----------

export async function clearAllUserData(): Promise<void> {
  await AsyncStorage.multiRemove([
    SAVED_KEY,
    WATCH_REPORTS_KEY,
    ACCOUNT_PREFS_KEY,
  ]);
  // device_id는 유지 (익명 식별자 안정성)
}

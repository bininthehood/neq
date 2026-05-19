import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import type {
  AccountPrefs,
  FavoriteMeta,
  NekoPushSubscriptionJSON,
  NotificationPrefs,
  Persona,
  Recommendation,
  SavedItem,
  WatchReaction,
  WatchReport,
} from './types';

const SAVED_KEY = 'neq_saved';
const WATCH_REPORTS_KEY = 'neq_watch_reports';
const ARCHIVE_KEY = 'neq_archived';
const DEVICE_ID_KEY = 'neq_device_id';
const ACCOUNT_PREFS_KEY = 'neq_account_prefs';
const ONBOARDED_KEY = 'neq_onboarded';
// W5 Task G — 페르소나 메타데이터.
// web `apps/web/src/lib/store.ts` 의 PERSONAS_KEY / ACTIVE_PERSONA_KEY 와 동일.
// native 는 web 의 full v2 마이그레이션을 수행하지 않고 메타데이터 (id/name/favorites/
// favoritesMeta) 만 관리. watchReports / seenTitles / recCache 는 single bucket 유지
// (web 의 v1 sync limitation 과 정합 — 비-default persona 일 때 동기화 skip 동일).
const PERSONAS_KEY = 'neq_personas';
const ACTIVE_PERSONA_KEY = 'neq_active_persona_id';
// W5 Task B — Discover 첫 진입 4단계 튜토리얼 (TutorialFlow v3) 노출 여부.
// web `localStorage.tutorialV3Shown === "1"` 과 동일한 의미/값.
// 양 플랫폼이 같은 익명 식별자를 공유하지 않으므로 디바이스별 1회만 노출.
const TUTORIAL_V3_KEY = 'tutorialV3Shown';

const MAX_PERSONAS = 3;

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

/**
 * 시청 리포트 제거 — web `apps/web/src/lib/store.ts:307-312` `removeWatchReport` 정합.
 * Saved 카드의 reaction 토글 해제("시청" 배지 다시 누름) 및 작품 삭제 시 함께 호출.
 *
 * sync 정합: web/native sync 모두 watch_reports 를 `upsert` 만 한다 (push 가 전체
 * 행을 다시 올리는 모델이 아니라 "현재 로컬에 있는 것만 upsert"). 즉 로컬에서 제거된
 * 행은 서버에서 자동 삭제되지 않는다 — 이는 web 도 동일한 v1 한계이며, 서버 측 삭제는
 * `wipeCloudData` (전체 초기화) 에서만 일어난다. 따라서 본 함수 추가로 sync push 모델을
 * 바꿀 필요는 없다 (web 정본과 동일 동작).
 */
export async function removeWatchReport(tmdbId: number): Promise<void> {
  const reports = await getWatchReports();
  const next = reports.filter((r) => r.tmdbId !== tmdbId);
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

// ---------- archive (W5 Task F) ----------
//
// web `apps/web/src/lib/store.ts:325-343` 와 동일 의미.
// "저장은 유지하되 목록에서 숨김" — 사용자가 시청 완료/관심 종료한 작품을
// 잡음에서 제외하는 메커니즘. 기본 뷰에서 hide, "아카이브" 필터에서만 노출.
//
// 키: 'neq_archived' (web LocalStorage 키와 동일 — 향후 sync 시 호환).
// 값: number[] (tmdbId 배열).

export async function getArchivedIds(): Promise<number[]> {
  return safeGet<number[]>(ARCHIVE_KEY, []);
}

export async function archiveItem(tmdbId: number): Promise<void> {
  const ids = await getArchivedIds();
  if (!ids.includes(tmdbId)) {
    ids.push(tmdbId);
    await AsyncStorage.setItem(ARCHIVE_KEY, JSON.stringify(ids));
  }
}

export async function unarchiveItem(tmdbId: number): Promise<void> {
  const ids = (await getArchivedIds()).filter((id) => id !== tmdbId);
  await AsyncStorage.setItem(ARCHIVE_KEY, JSON.stringify(ids));
}

export async function isArchived(tmdbId: number): Promise<boolean> {
  const ids = await getArchivedIds();
  return ids.includes(tmdbId);
}

// ---------- personas (W5 Task G) ----------
//
// web `apps/web/src/lib/store.ts:113-198` 의 페르소나 CRUD 와 동등하지만, native 는
// **metadata-only** 모델 — 페르소나의 favorites / favoritesMeta 만 관리하고
// watchReports / seenTitles / recCache 는 single bucket 유지.
//
// 이는 web 자체도 sync.ts 에서 비-default persona 의 watch_reports / seen_titles 동기화를
// skip 하는 v1 limitation 과 정합 (web `sync.ts:134-135, 151-152, 231-234`).
// 즉 양 플랫폼 모두 단일 디바이스 안에서만 페르소나별 데이터가 분리됨.
//
// **non-default persona 가 활성**일 때:
//   - native 의 sync push 에서 watch_reports 를 skip (web 정본 정합).
//   - saved_items 는 글로벌이므로 그대로 동기화.
//
// 키:
//   - PERSONAS_KEY (`neq_personas`): Persona[] 배열
//   - ACTIVE_PERSONA_KEY (`neq_active_persona_id`): string
//
// web 과 동일한 키 사용 — 향후 storage 통합 시 호환 유지 (현재는 분리된 환경).

function createEmptyPersonaMeta(id: string, name: string): Persona {
  return {
    id,
    name,
    favorites: [],
    favoritesMeta: [],
    // native metadata-only — 아래 3개 필드는 web 타입 호환을 위해 빈 값 유지.
    // single bucket (store.ts 상단의 SAVED_KEY/WATCH_REPORTS_KEY) 가 실제 데이터 소스.
    watchReports: [],
    seenTitles: [],
    recCache: [],
    recFilteredCache: {},
  };
}

export async function getPersonas(): Promise<Persona[]> {
  const personas = await safeGet<Persona[]>(PERSONAS_KEY, []);
  if (personas.length === 0) {
    // 첫 호출 — default 페르소나 시드. 사용자가 명시 생성하지 않아도 active 상태 보장.
    const seed: Persona[] = [createEmptyPersonaMeta('default', '기본')];
    await AsyncStorage.setItem(PERSONAS_KEY, JSON.stringify(seed));
    return seed;
  }
  return personas;
}

export async function setPersonas(personas: Persona[]): Promise<void> {
  await AsyncStorage.setItem(PERSONAS_KEY, JSON.stringify(personas));
}

export async function getActivePersonaId(): Promise<string> {
  const raw = await AsyncStorage.getItem(ACTIVE_PERSONA_KEY).catch(() => null);
  if (!raw) return 'default';
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'string' ? parsed : 'default';
  } catch {
    return 'default';
  }
}

export async function setActivePersonaId(id: string): Promise<void> {
  await AsyncStorage.setItem(ACTIVE_PERSONA_KEY, JSON.stringify(id));
}

export async function getActivePersona(): Promise<Persona> {
  const personas = await getPersonas();
  const activeId = await getActivePersonaId();
  return (
    personas.find((p) => p.id === activeId) ??
    personas[0] ??
    createEmptyPersonaMeta('default', '기본')
  );
}

export async function createPersona(
  name: string,
  favorites: string[],
  favoritesMeta: FavoriteMeta[],
): Promise<string | null> {
  const personas = await getPersonas();
  if (personas.length >= MAX_PERSONAS) return null;
  const id = Crypto.randomUUID().slice(0, 8);
  const persona = createEmptyPersonaMeta(id, name);
  persona.favorites = favorites;
  persona.favoritesMeta = favoritesMeta;
  personas.push(persona);
  await setPersonas(personas);
  return id;
}

export async function switchPersona(id: string): Promise<void> {
  const personas = await getPersonas();
  if (!personas.some((p) => p.id === id)) return;
  await setActivePersonaId(id);
}

export async function deletePersona(id: string): Promise<void> {
  let personas = await getPersonas();
  personas = personas.filter((p) => p.id !== id);
  if (personas.length === 0) {
    personas = [createEmptyPersonaMeta('default', '기본')];
  }
  await setPersonas(personas);
  const activeId = await getActivePersonaId();
  if (activeId === id) {
    await setActivePersonaId(personas[0].id);
  }
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

// ---------- onboarding flag ----------
//
// web `apps/web/src/lib/store.ts` 의 `hasOnboarded()` 와 동일 의미.
// 명시 완료 플래그 (`neq_onboarded === "true"`) 우선 + saved >= 3 폴백.
// favorites 는 native 에 페르소나 구조가 없으므로 saved 갯수로 대체 (의도: 기존 사용자
// 데이터가 있는 경우에도 가드를 통과하도록).
//
// 호출자: `app/index.tsx` (Discover) 의 첫 mount effect 에서 false 면
// `router.replace('/onboarding')`.

export async function hasOnboarded(): Promise<boolean> {
  try {
    const flag = await AsyncStorage.getItem(ONBOARDED_KEY);
    if (flag === 'true') return true;
  } catch {
    /* read 실패 — fallback 으로 진입 */
  }
  const saved = await getSaved();
  return saved.length >= 3;
}

export async function setOnboarded(): Promise<void> {
  await AsyncStorage.setItem(ONBOARDED_KEY, 'true');
}

export async function clearOnboarded(): Promise<void> {
  await AsyncStorage.removeItem(ONBOARDED_KEY);
}

// ---------- tutorial v3 flag (W5 Task B) ----------
//
// web `apps/web/src/app/discover/page.tsx` 의 localStorage `tutorialV3Shown === "1"`
// 과 동일 의미. Discover 첫 진입 시 4단계 튜토리얼을 1회만 보여주기 위한 가드.
//
// 값 '1' = 노출 완료 / 부재 = 미노출. web 과 동일 문자열 사용 (혹시라도 양 플랫폼이
// 같은 storage 를 공유하는 향후 시나리오에 호환 유지).
//
// 호출자:
//   - `app/index.tsx` Discover 의 mount effect 에서 false 면 TutorialFlow 마운트
//   - TutorialFlow 의 onClose 콜백에서 `markTutorialV3Seen()` 호출

export async function hasSeenTutorialV3(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(TUTORIAL_V3_KEY);
    return v === '1';
  } catch {
    return false;
  }
}

export async function markTutorialV3Seen(): Promise<void> {
  await AsyncStorage.setItem(TUTORIAL_V3_KEY, '1');
}

export async function clearTutorialV3(): Promise<void> {
  await AsyncStorage.removeItem(TUTORIAL_V3_KEY);
}

// ---------- reset ----------

export async function clearAllUserData(): Promise<void> {
  await AsyncStorage.multiRemove([
    SAVED_KEY,
    WATCH_REPORTS_KEY,
    ARCHIVE_KEY,
    ACCOUNT_PREFS_KEY,
    ONBOARDED_KEY,
    TUTORIAL_V3_KEY,
    PERSONAS_KEY,
    ACTIVE_PERSONA_KEY,
  ]);
  // device_id는 유지 (익명 식별자 안정성)
}

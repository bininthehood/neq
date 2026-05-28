import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import {
  createPersona as createPersonaCore,
  deletePersona as deletePersonaCore,
  getActivePersona as getActivePersonaCore,
  MAX_PERSONAS,
} from '@neq/core';
import type {
  AccountPrefs,
  FavoriteMeta,
  NekoPushSubscriptionJSON,
  NotificationPrefs,
  Persona,
  PersonaContext,
  Recommendation,
  SavedItem,
  TasteSurveyAnswer,
  WatchReaction,
  WatchReport,
} from './types';

const SAVED_KEY = 'neq_saved';
const WATCH_REPORTS_KEY = 'neq_watch_reports';
const ARCHIVE_KEY = 'neq_archived';
// 배치 H — 추천 기록(rec history). web `apps/web/src/lib/store.ts:32` HISTORY_KEY 와 동일.
// Discover 에서 추천 배치가 로드될 때마다 누적되는 글로벌(페르소나 무관) 기록.
// sync 대상 아님 — web 도 `sync.ts` 에 rec_history 가 없는 디바이스 로컬 전용 데이터.
const HISTORY_KEY = 'neq_rec_history';
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

// ---------- rec history (배치 H) ----------
//
// web `apps/web/src/lib/store.ts:345-373` 의 Rec History 와 1:1 정합.
// Discover 에서 추천 배치가 로드/표시될 때마다 호출되어 작품을 누적 기록.
// "이전에 추천받았지만 저장 안 한 작품을 다시 찾을 수 있게" 하는 글로벌 기록.
//
// 정합 포인트 (web 정본):
//   - 키: 'neq_rec_history' (web HISTORY_KEY 와 동일 문자열).
//   - 최대 100건 (web MAX_HISTORY). 초과 시 오래된 것부터 drop.
//   - 신규 항목을 앞에 prepend → 최근 추천이 위로.
//   - 이미 있는 tmdbId 는 skip (날짜 갱신 안 함 — web 동일).
//   - date 는 'YYYY-MM-DD' (로컬 X — web 은 toISOString().slice(0,10) = UTC date).
//   - sync 대상 아님 — web 도 sync.ts 에 rec_history 가 없는 디바이스 로컬 전용.
//
// 기록 시점: `app/index.tsx` 의 `load()` 에서 추천 배치가 완성된 직후
// (web `useRecommendations.ts:271/413` — recommendation_loaded 직후와 동일 지점).

const MAX_HISTORY = 100;

/**
 * 추천 기록 1건. web `apps/web/src/lib/store.ts:349-355` RecHistoryEntry 정합.
 */
export interface RecHistoryEntry {
  title: string;
  tmdbId: number;
  posterUrl: string | null;
  date: string;
  type?: 'movie' | 'series' | 'variety';
}

export async function getRecHistory(): Promise<RecHistoryEntry[]> {
  return safeGet<RecHistoryEntry[]>(HISTORY_KEY, []);
}

/**
 * 추천 배치를 기록에 누적. web `addRecHistory` (store.ts:362-373) 와 동일 로직.
 * - 이미 기록된 tmdbId 는 제외.
 * - 신규 항목을 앞에 붙이고 100건으로 잘라냄.
 */
export async function addRecHistory(
  recs: {
    title: string;
    tmdbId: number;
    posterUrl: string | null;
    type?: 'movie' | 'series' | 'variety';
  }[],
): Promise<void> {
  const existing = await getRecHistory();
  const existingIds = new Set(existing.map((e) => e.tmdbId));
  const date = new Date().toISOString().slice(0, 10);
  const newEntries = recs
    .filter((r) => !existingIds.has(r.tmdbId))
    .map((r) => ({ ...r, date }));
  if (newEntries.length === 0) return;
  const updated = [...newEntries, ...existing].slice(0, MAX_HISTORY);
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
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

// id 8자 short id 정책 유지 (기존 native 호환). packages/core 의 createPersona 는
// 풀 UUID 를 생성하므로 결과를 받은 뒤 id 만 native 측에서 덮어쓴다.
function createEmptyPersonaMeta(id: string, name: string): Persona {
  return { ...createPersonaCore(name), id };
}

/**
 * 2026-05-28 — "1 생성 = 1 페르소나" 모델로 단순화.
 *
 * 기존: 첫 호출 시 `[{id:'default', name:'기본'}]` 시드 자동 생성 → 사용자가
 *   onboarding 에서 첫 페르소나 만들어도 "기본" + 사용자 페르소나 2개로 노출.
 *
 * 현재: 빈 배열 그대로 반환. 페르소나는 onboarding 완주 또는 profile "+ 새 취향
 *   추가" 에서만 생성. `activePersonaId` 와 `activePersona` 도 null/'' 가능 상태로.
 *
 * 호환:
 *   - 기존 사용자(이미 'default' 시드를 가진 디바이스)는 그대로 유지. 의도적
 *     마이그레이션 없음 (회귀 위험 mid). QA/본인 디바이스는 시뮬레이터 AsyncStorage
 *     clear 또는 Profile "모든 데이터 초기화" 로 reset.
 */
export async function getPersonas(): Promise<Persona[]> {
  return safeGet<Persona[]>(PERSONAS_KEY, []);
}

export async function setPersonas(personas: Persona[]): Promise<void> {
  await AsyncStorage.setItem(PERSONAS_KEY, JSON.stringify(personas));
}

/**
 * 활성 페르소나 id. 페르소나 미생성 상태에서는 빈 문자열 반환.
 * 호출자는 '' 케이스 (= 페르소나 없음) 를 안전하게 처리해야 한다.
 */
export async function getActivePersonaId(): Promise<string> {
  const raw = await AsyncStorage.getItem(ACTIVE_PERSONA_KEY).catch(() => null);
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'string' ? parsed : '';
  } catch {
    return '';
  }
}

export async function setActivePersonaId(id: string): Promise<void> {
  await AsyncStorage.setItem(ACTIVE_PERSONA_KEY, JSON.stringify(id));
}

/**
 * 활성 페르소나. 페르소나 미생성 또는 active id 가 stale 이면 null.
 * 페르소나가 있되 active id 가 일치 안 하면 personas[0] 폴백.
 */
export async function getActivePersona(): Promise<Persona | null> {
  const personas = await getPersonas();
  if (personas.length === 0) return null;
  const activeId = await getActivePersonaId();
  return getActivePersonaCore(personas, activeId) ?? personas[0];
}

/**
 * sync 정책용 헬퍼 — "activePersona 가 사실상 default bucket 인가?"
 *
 * 시드 페르소나 제거(2026-05-28) 이전: id === 'default' 로 판정. 이후: 페르소나가
 * 1개뿐이거나 active 가 첫 페르소나(personas[0])일 때 = default bucket 정합.
 *
 * 의미: native sync 는 watch_reports / account_prefs 를 single bucket 에만 저장 →
 * 첫 페르소나는 글로벌 bucket 과 동일하므로 sync 정상. 두 번째 이후 페르소나
 * 활성 시점부터 v1 sync limitation (web `sync.ts` 와 동일) 으로 push/pull skip.
 *
 * 페르소나 없음(personas=[]): legacy 'default' 시점과 동일하게 true 로 간주 —
 * onboarding 진행 전에도 saved_items sync 정상 동작 유지.
 */
export async function isDefaultPersonaBucket(): Promise<boolean> {
  const personas = await getPersonas();
  if (personas.length === 0) return true;
  if (personas.length === 1) return true;
  const activeId = await getActivePersonaId();
  return personas[0].id === activeId;
}

/**
 * 페르소나 신규 생성. v2 (2026-05-24 design doc) — extras 인자로 LLM 동적
 * 설문 결과 (tasteSummary / tasteSurveyAnswers / context) 전달 가능. 기존
 * 호출자 (favorites + favoritesMeta 만) 영향 0 (extras 는 optional).
 */
export async function createPersona(
  name: string,
  favorites: string[],
  favoritesMeta: FavoriteMeta[],
  extras?: {
    tasteSummary?: string;
    tasteSurveyAnswers?: TasteSurveyAnswer[];
    context?: PersonaContext;
  },
): Promise<string | null> {
  const personas = await getPersonas();
  if (personas.length >= MAX_PERSONAS) return null;
  const id = Crypto.randomUUID().slice(0, 8);
  const persona: Persona = {
    ...createPersonaCore(name),
    id,
    favorites,
    favoritesMeta,
    ...(extras?.tasteSummary ? { tasteSummary: extras.tasteSummary } : {}),
    ...(extras?.tasteSurveyAnswers
      ? { tasteSurveyAnswers: extras.tasteSurveyAnswers }
      : {}),
    ...(extras?.context ? { context: extras.context } : {}),
  };
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
  const current = await getPersonas();
  const next = deletePersonaCore(current, id);
  await setPersonas(next);
  const activeId = await getActivePersonaId();
  if (activeId === id) {
    // 빈 배열 가능 (2026-05-28 시드 제거 이후 — 마지막 페르소나 삭제 시).
    // 빈 문자열로 active 리셋 — 호출자가 personas=[] 케이스 처리.
    await setActivePersonaId(next.length > 0 ? next[0].id : '');
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
    HISTORY_KEY,
    ACCOUNT_PREFS_KEY,
    ONBOARDED_KEY,
    TUTORIAL_V3_KEY,
    PERSONAS_KEY,
    ACTIVE_PERSONA_KEY,
  ]);
  // device_id는 유지 (익명 식별자 안정성)
}

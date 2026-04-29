/**
 * GET /api/cron/notifications/new-release
 *
 * 매일 01:00 UTC (= 10:00 KST) — 새 작품 알림.
 *
 * P0-5b 풀구현 (Day 23). notification-triggers-detail.md §2 의 4 트리거 통합:
 *
 *   Trigger A — saved 시리즈 새 시즌 (TMDB tv/{id} → seasons[].air_date > 어제)
 *   Trigger B — favorites 감독 신작 (notification_followed_persons role=director)
 *   Trigger C — favorites 배우 신작 (role=actor)
 *   Trigger D — 구독 OTT 신작 (discover/{movie|tv}?with_watch_providers=...)
 *
 * 사용자당 일일 1건만 발송 (cooldown 24h + 통합 우선순위).
 * 매력도 점수 = 0.5 * vote_average/10 + 0.5 * popularity_norm (Q2 결정).
 *
 * 캐시 전략:
 *  - in-memory Map (cron 호출 1회 한정 dedup):
 *      * personCreditsCache: `${personId}|${mediaType}` → fetch 1회만
 *      * discoverCache: `${providerId}|${mediaType}|${dateGteIso}` → fetch 1회만
 *      * tvDetailsCache: `${tmdbId}` → fetch 1회만
 *  - Vercel Runtime Cache (next/cache) 도입 가능하지만 일별 cron 1회 호출이라
 *    in-memory Map 으로 충분 (아래 결정 사항 참조).
 *
 * vercel.json: "0 1 * * *"
 */

import { NextResponse } from "next/server";
import { isNotificationsEnabled } from "@/lib/env";
import { isAuthorizedCron } from "@/lib/notifications/cron-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  sendPush,
  generateTrackingId,
  type NotificationPayload,
} from "@/lib/notifications/send";
import {
  buildPayloadText,
  extractDiscoverCandidates,
  extractNewSeasonCandidates,
  extractPersonNewWorks,
  pickTopCandidate,
  posterUrlFromPath,
  tmdbDiscoverByProvider,
  tmdbPersonCredits,
  tmdbTvDetails,
  yesterdayIsoDate,
  type NewReleaseCandidate,
} from "@/lib/notifications/new-release-helpers";
import {
  RateLimiter,
  mapWithConcurrency,
  type MediaType,
} from "@/lib/notifications/providers-helpers";
import { PROVIDER_ID_TO_KR_NAME } from "@/lib/notifications/ott-expiry-helpers";
import type { AccountPrefs } from "@/lib/types";

const TMDB_CONCURRENCY = 6;

interface ProfileRow {
  id: string;
  account_prefs: AccountPrefs | null;
}

interface SavedTvRow {
  profile_id: string;
  tmdb_id: number;
}

interface FollowedPersonRow {
  profile_id: string;
  person_id: number;
  person_name: string | null;
  role: "director" | "actor";
}

interface MirrorTvRow {
  tmdb_id: number;
  name: string | null;
  poster_path: string | null;
  vote_average: number | null;
  popularity: number | null;
  seasons: Array<{
    season_number?: number;
    air_date?: string | null;
    name?: string;
  }> | null;
}

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isNotificationsEnabled()) {
    return NextResponse.json({
      ok: true,
      disabled: true,
      sent: 0,
      failed: 0,
      skipped: 0,
    });
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
  const sinceIso = yesterdayIsoDate();

  // STEP 1 — newRelease=true 사용자 조회
  const { data: profiles, error: profilesErr } = await admin
    .from("profiles")
    .select("id, account_prefs")
    .eq("account_prefs->notificationPrefs->>newRelease", "true");

  if (profilesErr) {
    console.error(
      "[cron/new-release] profiles query failed:",
      profilesErr.message,
    );
    return NextResponse.json(
      { error: "profiles-query-failed", detail: profilesErr.message },
      { status: 500 },
    );
  }
  const candidates: ProfileRow[] = (profiles ?? []) as ProfileRow[];
  if (candidates.length === 0) {
    return NextResponse.json({
      ok: true,
      candidates: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      duration_ms: Date.now() - startedAt,
    });
  }

  const profileIds = candidates.map((p) => p.id);

  // STEP 2 — 사용자별 데이터 일괄 로드 (saved tv + followed persons)
  let savedTvRows: SavedTvRow[];
  let followedPersonsRows: FollowedPersonRow[];
  try {
    [savedTvRows, followedPersonsRows] = await Promise.all([
      fetchSavedTvForProfiles(admin, profileIds),
      fetchFollowedPersonsForProfiles(admin, profileIds),
    ]);
  } catch (err) {
    console.error("[cron/new-release] step2 fetch failed:", err);
    return NextResponse.json(
      { error: "fetch-failed", detail: String(err) },
      { status: 500 },
    );
  }

  // STEP 3 — 트리거별 후보 일괄 수집 (사용자 cross dedup)
  const limiter = new RateLimiter(30);
  const tmdbCallStats = { tv: 0, personCredits: 0, discover: 0 };
  const errors: Array<{ kind: string; key: string; error: string }> = [];

  // Trigger A: saved tv 작품 단위 dedup → tv/{id} 호출
  const distinctTvIds = Array.from(new Set(savedTvRows.map((r) => r.tmdb_id)));

  // 미러에서 seasons 가 있으면 fetch skip 하기 위한 간단 룩업
  const mirrorTvLookup = await fetchMirrorTv(admin, distinctTvIds);

  const tvSeasonCache = new Map<number, NewReleaseCandidate[]>();
  await mapWithConcurrency(distinctTvIds, TMDB_CONCURRENCY, async (id) => {
    try {
      const mirror = mirrorTvLookup.get(id);
      const hasMirrorSeasons =
        mirror &&
        Array.isArray(mirror.seasons) &&
        mirror.seasons.length > 0;
      if (hasMirrorSeasons) {
        // 미러 조립 — extractNewSeasonCandidates 가 받는 shape 으로 변환
        const fakeTv = {
          id,
          name: mirror.name ?? "",
          poster_path: mirror.poster_path,
          vote_average: mirror.vote_average ?? 0,
          popularity: mirror.popularity ?? 0,
          seasons: mirror.seasons,
        } as Record<string, unknown>;
        tvSeasonCache.set(id, extractNewSeasonCandidates(fakeTv, sinceIso));
        return;
      }
      const raw = await tmdbTvDetails(id, tmdbApiKey, limiter);
      tmdbCallStats.tv += 1;
      tvSeasonCache.set(id, extractNewSeasonCandidates(raw, sinceIso));
    } catch (err) {
      errors.push({ kind: "tv", key: String(id), error: String(err) });
      tvSeasonCache.set(id, []);
    }
  });

  // Trigger B/C: distinct (person_id, mediaType) — 같은 사람의 movie + tv credits 모두 호출
  const distinctPersons = dedupPersons(followedPersonsRows);
  // key: `${personId}|${mediaType}` → ExtractedPerson 후보
  const personCreditsCache = new Map<string, NewReleaseCandidate[]>();

  await mapWithConcurrency(distinctPersons, TMDB_CONCURRENCY, async (p) => {
    for (const mt of ["movie", "tv"] as MediaType[]) {
      const key = `${p.personId}|${mt}|${p.role}`;
      try {
        const raw = await tmdbPersonCredits(
          p.personId,
          mt,
          tmdbApiKey,
          limiter,
        );
        tmdbCallStats.personCredits += 1;
        personCreditsCache.set(
          key,
          extractPersonNewWorks(raw, p.personId, p.personName, mt, p.role, sinceIso),
        );
      } catch (err) {
        errors.push({ kind: "person", key, error: String(err) });
        personCreditsCache.set(key, []);
      }
    }
  });

  // Trigger D: 구독 OTT 사용자 → provider id 단위 dedup → discover 1회
  const distinctProviderIds = Array.from(
    new Set(
      candidates.flatMap((c) => c.account_prefs?.subscribedOtt ?? []),
    ),
  );
  const discoverCache = new Map<string, NewReleaseCandidate[]>(); // `${pid}|${mt}`

  // movie + tv 두 호출 — provider 단위 캐싱
  const providerJobs: Array<{ pid: number; mt: MediaType }> =
    distinctProviderIds.flatMap((pid) =>
      (["movie", "tv"] as MediaType[]).map((mt) => ({ pid, mt })),
    );
  await mapWithConcurrency(providerJobs, TMDB_CONCURRENCY, async (j) => {
    const key = `${j.pid}|${j.mt}`;
    try {
      const raw = await tmdbDiscoverByProvider(
        j.pid,
        j.mt,
        sinceIso,
        tmdbApiKey,
        limiter,
      );
      tmdbCallStats.discover += 1;
      discoverCache.set(key, extractDiscoverCandidates(raw, j.mt));
    } catch (err) {
      errors.push({ kind: "discover", key, error: String(err) });
      discoverCache.set(key, []);
    }
  });

  // STEP 4 — 사용자별 후보 통합 + 1건 선택 + 발송
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const reasons: Record<string, number> = {};

  // 사용자별 saved tv id 매핑
  const profileToSavedTv = new Map<string, number[]>();
  for (const r of savedTvRows) {
    if (!profileToSavedTv.has(r.profile_id)) {
      profileToSavedTv.set(r.profile_id, []);
    }
    profileToSavedTv.get(r.profile_id)!.push(r.tmdb_id);
  }
  // 사용자별 followed persons
  const profileToPersons = new Map<string, FollowedPersonRow[]>();
  for (const r of followedPersonsRows) {
    if (!profileToPersons.has(r.profile_id)) {
      profileToPersons.set(r.profile_id, []);
    }
    profileToPersons.get(r.profile_id)!.push(r);
  }

  for (const p of candidates) {
    try {
      const profileCandidates: NewReleaseCandidate[] = [];

      // A — saved tv
      const savedTv = profileToSavedTv.get(p.id) ?? [];
      for (const tvId of savedTv) {
        profileCandidates.push(...(tvSeasonCache.get(tvId) ?? []));
      }

      // B / C — followed persons
      const persons = profileToPersons.get(p.id) ?? [];
      for (const fp of persons) {
        for (const mt of ["movie", "tv"] as MediaType[]) {
          const key = `${fp.person_id}|${mt}|${fp.role}`;
          profileCandidates.push(...(personCreditsCache.get(key) ?? []));
        }
      }

      // D — subscribed providers
      const subOtt = p.account_prefs?.subscribedOtt ?? [];
      for (const pid of subOtt) {
        for (const mt of ["movie", "tv"] as MediaType[]) {
          profileCandidates.push(...(discoverCache.get(`${pid}|${mt}`) ?? []));
        }
      }

      if (profileCandidates.length === 0) {
        skipped += 1;
        reasons["no-candidates"] = (reasons["no-candidates"] ?? 0) + 1;
        continue;
      }

      // 1건 선택 (우선순위 + 매력도)
      const picked = pickTopCandidate(profileCandidates);
      if (!picked) {
        skipped += 1;
        reasons["pick-null"] = (reasons["pick-null"] ?? 0) + 1;
        continue;
      }

      // payload 구성 — D 트리거인 경우 매칭된 사용자 provider 이름 표시 (첫번째 매칭)
      let providerNameKr: string | undefined;
      if (picked.trigger === "D_provider") {
        const matchedPid = subOtt.find((pid) =>
          (discoverCache.get(`${pid}|${picked.mediaType}`) ?? []).some(
            (c) => c.tmdbId === picked.tmdbId,
          ),
        );
        if (matchedPid) {
          providerNameKr = PROVIDER_ID_TO_KR_NAME[matchedPid];
        }
      }

      const text = buildPayloadText(picked, providerNameKr);
      const trackingId = generateTrackingId();
      const payload: NotificationPayload = {
        type: "new_release",
        title: text.title,
        body: text.body,
        url: `/work/${picked.tmdbId}?type=${picked.mediaType}`,
        ...(picked.posterUrl
          ? { imageUrl: picked.posterUrl }
          : {}),
        trackingId,
      };

      const sendResult = await sendPush(p.id, payload);
      if (sendResult.delivered) {
        sent += 1;
      } else {
        const reasonKey = sendResult.reason ?? "unknown";
        reasons[reasonKey] = (reasons[reasonKey] ?? 0) + 1;
        if (
          reasonKey === "cooldown" ||
          reasonKey === "no-subscription" ||
          reasonKey === "type-toggle-off" ||
          reasonKey === "vapid-missing" ||
          reasonKey === "subscription-gone"
        ) {
          skipped += 1;
        } else {
          failed += 1;
        }
      }
    } catch (err) {
      console.error("[cron/new-release] profile error:", p.id, err);
      failed += 1;
      reasons["exception"] = (reasons["exception"] ?? 0) + 1;
    }
  }

  return NextResponse.json({
    ok: true,
    candidates: candidates.length,
    sent,
    failed,
    skipped,
    reasons,
    tmdb_calls: tmdbCallStats,
    errors: errors.slice(0, 50),
    errors_total: errors.length,
    duration_ms: Date.now() - startedAt,
  });
}

// 안전 unused warning 회피: posterUrlFromPath 는 미러 조립에서 사용
void posterUrlFromPath;

// ─────────────────────────────────────────────────────────────────
// helpers (내부 — DB I/O)
// ─────────────────────────────────────────────────────────────────

const ID_PAGE = 200;
const PAGE_SIZE = 1000;

async function fetchSavedTvForProfiles(
  admin: ReturnType<typeof supabaseAdmin>,
  profileIds: string[],
): Promise<SavedTvRow[]> {
  if (profileIds.length === 0) return [];
  const out: SavedTvRow[] = [];
  for (let i = 0; i < profileIds.length; i += ID_PAGE) {
    const slice = profileIds.slice(i, i + ID_PAGE);
    let from = 0;
    for (;;) {
      const { data, error } = await admin
        .from("saved_items")
        .select("profile_id, tmdb_id, type")
        .in("profile_id", slice)
        .eq("type", "tv")
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const row of data) {
        const tmdbId = row.tmdb_id as number;
        if (typeof row.profile_id === "string" && typeof tmdbId === "number") {
          out.push({ profile_id: row.profile_id, tmdb_id: tmdbId });
        }
      }
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
  }
  return out;
}

async function fetchFollowedPersonsForProfiles(
  admin: ReturnType<typeof supabaseAdmin>,
  profileIds: string[],
): Promise<FollowedPersonRow[]> {
  if (profileIds.length === 0) return [];
  const out: FollowedPersonRow[] = [];
  for (let i = 0; i < profileIds.length; i += ID_PAGE) {
    const slice = profileIds.slice(i, i + ID_PAGE);
    let from = 0;
    for (;;) {
      const { data, error } = await admin
        .from("notification_followed_persons")
        .select("profile_id, person_id, person_name, role")
        .in("profile_id", slice)
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const row of data) {
        const role = row.role as "director" | "actor";
        const pid = row.person_id as number;
        if (
          typeof row.profile_id === "string" &&
          typeof pid === "number" &&
          (role === "director" || role === "actor")
        ) {
          out.push({
            profile_id: row.profile_id,
            person_id: pid,
            person_name: typeof row.person_name === "string" ? row.person_name : null,
            role,
          });
        }
      }
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
  }
  return out;
}

async function fetchMirrorTv(
  admin: ReturnType<typeof supabaseAdmin>,
  ids: number[],
): Promise<Map<number, MirrorTvRow>> {
  const out = new Map<number, MirrorTvRow>();
  if (ids.length === 0) return out;
  const IN_PAGE = 500;
  for (let i = 0; i < ids.length; i += IN_PAGE) {
    const slice = ids.slice(i, i + IN_PAGE);
    const { data, error } = await admin
      .from("tmdb_metadata")
      .select(
        "tmdb_id, media_type, name, poster_path, vote_average, popularity, seasons",
      )
      .eq("media_type", "tv")
      .in("tmdb_id", slice);
    if (error) {
      console.warn("[cron/new-release] mirror tv lookup failed:", error.message);
      continue;
    }
    for (const row of data ?? []) {
      out.set(row.tmdb_id as number, {
        tmdb_id: row.tmdb_id as number,
        name: (row.name as string | null) ?? null,
        poster_path: (row.poster_path as string | null) ?? null,
        vote_average: (row.vote_average as number | null) ?? null,
        popularity: (row.popularity as number | null) ?? null,
        seasons: (row.seasons as MirrorTvRow["seasons"]) ?? null,
      });
    }
  }
  return out;
}

interface DistinctPerson {
  personId: number;
  personName: string;
  role: "director" | "actor";
}

function dedupPersons(rows: FollowedPersonRow[]): DistinctPerson[] {
  const seen = new Map<string, DistinctPerson>();
  for (const r of rows) {
    const key = `${r.person_id}|${r.role}`;
    if (seen.has(key)) continue;
    seen.set(key, {
      personId: r.person_id,
      personName: r.person_name ?? "",
      role: r.role,
    });
  }
  return Array.from(seen.values());
}

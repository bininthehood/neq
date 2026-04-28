-- Onboarding V2 + 알림 시스템 데이터 레이어
--
-- 배경:
--   디자인 리빌드 산출물(claude.ai/design Phase 3)에 정의된 5단계 온보딩 +
--   4종 알림 시스템 + 광고 알림 호환을 위한 사전 구현.
--   스펙: _workspace/onboarding-v2-spec.md
--
-- 구성:
--   1. profiles.account_prefs JSONB — 계정 레벨 prefs (taste/ott/notify)
--   2. notification_followed_persons — 감독/배우 추적 (alert candidate 캐싱)
--   3. tmdb_provider_snapshots — OTT 만료 proxy (7일치 보관)
--   4. notification_log — 발송 idempotency + cooldown + tracking
--
-- 사용법:
--   Supabase Dashboard → SQL Editor에 paste → Run
--   (모든 신규 코드는 feature flag 뒤이므로 적용 후 prod 영향 0)

-- ─────────────────────────────────────────────────────────────────
-- 1. profiles.account_prefs — 계정 레벨 prefs (단일 JSONB)
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS account_prefs JSONB;

-- 저장 구조 (JSON):
-- {
--   "tasteGenres": ["thriller", "documentary", "drama"],
--   "subscribedOtt": [8, 337, 356],   // TMDB provider id
--   "notificationPrefs": {
--     "weeklyRec": false,
--     "newRelease": false,
--     "ottExpiry": false,
--     "monthlyReport": false,
--     "pushSubscription": null        // PushSubscription JSON (Web Push API)
--   }
-- }
--
-- nullable: 기존 사용자는 V1 onboarding 진행 → null 허용. 신규는 V2에서 채움.
-- 페르소나별 favorites와 독립 (Persona.favorites는 store에 별도 유지).

COMMENT ON COLUMN profiles.account_prefs IS
  'Onboarding V2 — 계정 레벨 prefs (장르 칩, 구독 OTT, 알림 토글). 페르소나 favorites와 독립.';

-- ─────────────────────────────────────────────────────────────────
-- 2. notification_followed_persons — 감독/배우 신작 알림 후보
-- ─────────────────────────────────────────────────────────────────
--
-- 사용자의 favorites 작품으로부터 추출한 감독/배우 person_id 목록.
-- 매일 cron이 person/{id}/movie_credits + tv_credits로 신작 체크.
-- 사용자 단위 (profile_id), TMDB person_id 단위 dedup.

CREATE TABLE IF NOT EXISTS notification_followed_persons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  person_id BIGINT NOT NULL,        -- TMDB person id
  person_name TEXT,                 -- cache (UI 알림 텍스트용)
  role TEXT NOT NULL,               -- 'director' | 'actor'
  source_work_id BIGINT,            -- favorites에서 추출된 작품 (디버그용)
  source_media_type TEXT,           -- 'movie' | 'tv'
  last_known_release DATE,          -- 가장 최근 작품 release_date (신작 비교 기준)
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (profile_id, person_id, role)
);

CREATE INDEX IF NOT EXISTS idx_followed_persons_profile
  ON notification_followed_persons (profile_id);

CREATE INDEX IF NOT EXISTS idx_followed_persons_id
  ON notification_followed_persons (person_id);

COMMENT ON TABLE notification_followed_persons IS
  '사용자별 추적 person_id (감독/배우). favorites에서 추출, cron이 신작 체크.';

-- ─────────────────────────────────────────────────────────────────
-- 3. tmdb_provider_snapshots — OTT 만료 proxy
-- ─────────────────────────────────────────────────────────────────
--
-- saved 작품마다 매일 watch/providers 스냅샷. 어제 vs 오늘 비교로
-- 사라진 provider = "곧 내려갈 수 있어요" 약한 톤 알림. 7일치만 보관.
-- false positive 허용 (TMDB API 일시 누락 가능).

CREATE TABLE IF NOT EXISTS tmdb_provider_snapshots (
  work_id BIGINT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  snapshot_date DATE NOT NULL,
  providers JSONB NOT NULL,        -- { "flatrate": [8, 337], "rent": [], "buy": [] }
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (work_id, media_type, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_provider_snapshots_date
  ON tmdb_provider_snapshots (snapshot_date DESC);

COMMENT ON TABLE tmdb_provider_snapshots IS
  'saved 작품의 일별 OTT provider 스냅샷. 7일치만 보관. /api/cron/tmdb-providers-snapshot이 채움.';

-- ─────────────────────────────────────────────────────────────────
-- 4. notification_log — 발송 로그 + cooldown + click tracking
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,              -- 'rec_weekly' | 'new_release' | 'ott_expiry' | 'monthly_report' | 'ad'
  payload JSONB NOT NULL,          -- { title, body, url, imageUrl?, trackingId, category? }
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered BOOLEAN,               -- push subscribe success
  clicked BOOLEAN NOT NULL DEFAULT FALSE,
  click_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notification_log_profile_type
  ON notification_log (profile_id, type, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_log_sent_at
  ON notification_log (sent_at DESC);

COMMENT ON TABLE notification_log IS
  'Push 발송 로그. cooldown 체크 (profile_id + type + sent_at) + PostHog tracking 연결.';

-- ─────────────────────────────────────────────────────────────────
-- 5. RLS — service_role만 허용 (cron + admin 호출 전용)
-- ─────────────────────────────────────────────────────────────────
--
-- account_prefs는 profiles의 컬럼이므로 기존 RLS 정책 상속.
-- 신규 3개 테이블은 service_role 전용 (Supabase에서 service_role은 RLS bypass).

ALTER TABLE notification_followed_persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE tmdb_provider_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

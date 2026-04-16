-- Onboarding 취향 수집 결과를 profiles에 JSON으로 저장
--
-- 배경:
--   현재 온보딩 픽은 localStorage(neq_favorites, neq_favorites_meta)에만 저장됨.
--   재설치/localStorage 클리어 시 소실. 크로스 디바이스 복원 불가.
--   profiles에 1회성 데이터로 추가.
--
-- 사용법:
--   Supabase Dashboard → SQL Editor에 paste → Run

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS onboarding_picks JSONB;

-- 저장 구조 (JSON):
-- [
--   { "id": 313369, "title": "라라랜드", "posterUrl": "https://.../xyz.jpg" },
--   ...
-- ]
--
-- 조회: profiles.onboarding_picks
-- 업데이트: UPDATE profiles SET onboarding_picks = ... WHERE id = ...

COMMENT ON COLUMN profiles.onboarding_picks IS
  'Onboarding에서 유저가 고른 취향 작품 (1회성, JSON 배열)';

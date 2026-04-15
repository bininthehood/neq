-- Supabase RLS 정책 (방향 A: anon 전면 허용)
--
-- 배경:
--   클라이언트가 Supabase anon key로 직접 접근하고 auth 세션이 없어서
--   auth.uid() 기반 정책이 전부 실패함. device_id는 client가 주장하는
--   값이라 RLS에서 검증 불가. MVP 단계에서는 anon 전면 허용으로 진행.
--
-- 보안 모델:
--   - device_id는 UUID(추측 불가)라 실제 데이터 유출 위험은 낮음
--   - anon key 노출 시 누구나 모든 데이터 read/write 가능 (수용)
--   - 로그인/계정 시스템 도입 시 방향 B(Supabase anonymous auth + JWT claim)로 전환
--
-- 사용법:
--   Supabase Dashboard → SQL Editor에 전체 붙여넣고 Run

-- ---------- profiles ----------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon full access on profiles" ON profiles;
CREATE POLICY "anon full access on profiles" ON profiles
  FOR ALL TO anon
  USING (true) WITH CHECK (true);

-- ---------- saved_items ----------
ALTER TABLE saved_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon full access on saved_items" ON saved_items;
CREATE POLICY "anon full access on saved_items" ON saved_items
  FOR ALL TO anon
  USING (true) WITH CHECK (true);

-- ---------- watch_reports ----------
ALTER TABLE watch_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon full access on watch_reports" ON watch_reports;
CREATE POLICY "anon full access on watch_reports" ON watch_reports
  FOR ALL TO anon
  USING (true) WITH CHECK (true);

-- ---------- seen_titles ----------
ALTER TABLE seen_titles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon full access on seen_titles" ON seen_titles;
CREATE POLICY "anon full access on seen_titles" ON seen_titles
  FOR ALL TO anon
  USING (true) WITH CHECK (true);

-- ---------- archived_items ----------
ALTER TABLE archived_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon full access on archived_items" ON archived_items;
CREATE POLICY "anon full access on archived_items" ON archived_items
  FOR ALL TO anon
  USING (true) WITH CHECK (true);

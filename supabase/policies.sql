-- Supabase RLS 정책 (방향 A+: anon/authenticated 양쪽 허용)
--
-- 배경:
--   병렬 세션에서 방향 B(supabase.auth.signInAnonymously) 구현이 시작됨.
--   sync 호출 시점에 유저가 anon → authenticated 역할로 전환됨.
--   따라서 RLS 정책이 양쪽 역할 모두 커버해야 insert가 성공함.
--
-- 현재 보안 모델 (MVP 단계):
--   - anon key + 익명 auth로 누구나 읽기/쓰기 가능 (관리 오버헤드 최소화)
--   - device_id·user_id 기반 필터링은 클라이언트 코드 책임
--   - 본격 계정 시스템 도입 시 user_id = auth.uid() 기반 정책으로 전환
--
-- 사용법:
--   Supabase Dashboard → SQL Editor에 전체 붙여넣고 Run

-- ---------- profiles ----------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon full access on profiles" ON profiles;
DROP POLICY IF EXISTS "full access on profiles" ON profiles;
CREATE POLICY "full access on profiles" ON profiles
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

-- ---------- saved_items ----------
ALTER TABLE saved_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon full access on saved_items" ON saved_items;
DROP POLICY IF EXISTS "full access on saved_items" ON saved_items;
CREATE POLICY "full access on saved_items" ON saved_items
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

-- ---------- watch_reports ----------
ALTER TABLE watch_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon full access on watch_reports" ON watch_reports;
DROP POLICY IF EXISTS "full access on watch_reports" ON watch_reports;
CREATE POLICY "full access on watch_reports" ON watch_reports
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

-- ---------- seen_titles ----------
ALTER TABLE seen_titles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon full access on seen_titles" ON seen_titles;
DROP POLICY IF EXISTS "full access on seen_titles" ON seen_titles;
CREATE POLICY "full access on seen_titles" ON seen_titles
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

-- ---------- archived_items ----------
ALTER TABLE archived_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon full access on archived_items" ON archived_items;
DROP POLICY IF EXISTS "full access on archived_items" ON archived_items;
CREATE POLICY "full access on archived_items" ON archived_items
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

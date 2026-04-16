-- Supabase Anonymous Auth 마이그레이션
-- 선행 조건: Supabase Dashboard → Authentication → Settings → Enable Anonymous Sign-Ins 활성화
--
-- 변경 사항:
-- 1. profiles 테이블에 user_id (auth.users 참조) 컬럼 추가
-- 2. 기존 anon 전면 허용 정책 삭제
-- 3. auth.uid() 기반 RLS 정책 적용 (authenticated + anon role)

-- ---------- 1. profiles 테이블 스키마 변경 ----------

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) UNIQUE;
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);

-- ---------- 2. 기존 anon 전면 허용 정책 삭제 ----------

DROP POLICY IF EXISTS "anon full access on profiles" ON profiles;
DROP POLICY IF EXISTS "anon full access on saved_items" ON saved_items;
DROP POLICY IF EXISTS "anon full access on watch_reports" ON watch_reports;
DROP POLICY IF EXISTS "anon full access on seen_titles" ON seen_titles;
DROP POLICY IF EXISTS "anon full access on archived_items" ON archived_items;

-- ---------- 3. 신규 RLS 정책: auth.uid() 기반 ----------
-- anonymous auth 사용자도 authenticated role을 받으므로 TO authenticated 사용

-- profiles: 본인 프로필만 조회/수정. 생성은 허용 (anonymous sign-up 시).
CREATE POLICY "users can manage own profile" ON profiles
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- profiles: 기존 device_id 기반 프로필 연결 시 user_id가 NULL인 행 INSERT 허용
-- (마이그레이션 중 한 번만 사용)
CREATE POLICY "users can claim unclaimed profile" ON profiles
  FOR UPDATE TO authenticated
  USING (user_id IS NULL)
  WITH CHECK (user_id = auth.uid());

-- saved_items: 본인 프로필의 아이템만
CREATE POLICY "users can manage own saved items" ON saved_items
  FOR ALL TO authenticated
  USING (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()))
  WITH CHECK (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

-- watch_reports: 본인 프로필의 리포트만
CREATE POLICY "users can manage own watch reports" ON watch_reports
  FOR ALL TO authenticated
  USING (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()))
  WITH CHECK (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

-- seen_titles: 본인 프로필의 타이틀만
CREATE POLICY "users can manage own seen titles" ON seen_titles
  FOR ALL TO authenticated
  USING (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()))
  WITH CHECK (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

-- archived_items: 본인 프로필의 아카이브만
CREATE POLICY "users can manage own archived items" ON archived_items
  FOR ALL TO authenticated
  USING (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()))
  WITH CHECK (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

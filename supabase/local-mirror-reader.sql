-- Read-only role for the public serving PostgREST (scripts/local-mirror-serve.sh).
-- Only the tables and RPC the web app reads. No writes, short statement timeout.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'mirror_reader') THEN
    CREATE ROLE mirror_reader NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public, extensions TO mirror_reader;
GRANT SELECT ON public.tmdb_metadata, public.tmdb_catalog, public.tmdb_provider_snapshots TO mirror_reader;
GRANT EXECUTE ON FUNCTION public.match_tmdb_by_embedding(vector, integer, text, integer[], text, text, text, integer[]) TO mirror_reader;
GRANT mirror_reader TO authenticator;
ALTER ROLE mirror_reader SET statement_timeout = '5s';

-- Tables have RLS on with no policies (service_role bypasses). Allow SELECT for this role only.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tmdb_metadata', 'tmdb_catalog', 'tmdb_provider_snapshots'] LOOP
    IF NOT EXISTS (SELECT FROM pg_policies WHERE tablename = t AND policyname = 'mirror_reader_select') THEN
      EXECUTE format('CREATE POLICY mirror_reader_select ON public.%I FOR SELECT TO mirror_reader USING (true)', t);
    END IF;
  END LOOP;
END $$;

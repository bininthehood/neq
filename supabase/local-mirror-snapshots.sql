CREATE TABLE IF NOT EXISTS public.tmdb_provider_snapshots (
  work_id BIGINT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  snapshot_date DATE NOT NULL,
  providers JSONB NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (work_id, media_type, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_provider_snapshots_date
  ON public.tmdb_provider_snapshots (snapshot_date DESC);

ALTER TABLE public.tmdb_provider_snapshots ENABLE ROW LEVEL SECURITY;

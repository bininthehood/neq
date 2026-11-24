CREATE INDEX IF NOT EXISTS idx_catalog_popularity_slim
  ON public.tmdb_catalog (popularity DESC, tmdb_id, media_type);

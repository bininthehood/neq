#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
container=supabase_db_neko

if ! docker ps --format '{{.Names}}' | rg -q "^${container}$"; then
  echo "Local Supabase database is not running. Start it with: npx supabase start --network-id neq-local-mirror" >&2
  exit 1
fi

schema_state=$(docker exec "$container" psql -U postgres -d postgres -Atc \
  "SELECT (to_regclass('public.tmdb_metadata') IS NOT NULL)::int::text || ':' || (to_regprocedure('public.db_size_bytes()') IS NOT NULL)::int::text")
if [[ "$schema_state" == "1:1" ]]; then
  echo "Local mirror schema already applied."
  exit 0
fi
if [[ "$schema_state" != "0:0" ]]; then
  echo "Local mirror schema is partially applied; inspect it before retrying." >&2
  exit 1
fi

files=(
  supabase/migrations/20260424_tmdb_mirror.sql
  supabase/local-mirror-snapshots.sql
  supabase/migrations/20260606_tmdb_metadata_phase_b_indexes.sql
  supabase/migrations/20260624_tmdb_embedding_column.sql
  supabase/migrations/20260624_tmdb_embed_backfill_index.sql
  supabase/migrations/20260624_tmdb_match_embedding.sql
  supabase/migrations/20260629_tmdb_metadata_title_en_index.sql
  supabase/migrations/20260715_tmdb_related_seeds.sql
  supabase/migrations/20260715_tmdb_related_seeds_idx.sql
  supabase/migrations/20260721_tmdb_director_id_idx.sql
  supabase/migrations/20260818_tmdb_catalog_slim.sql
  supabase/local-mirror-indexes.sql
  supabase/migrations/20260818_db_size_guard.sql
)

for file in "${files[@]}"; do
  echo "Applying ${file}"
  docker exec -i "$container" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < "$file"
done

echo "Local mirror schema applied. Add the vector index after importing data."

#!/usr/bin/env bash
set -euo pipefail
umask 077

container=supabase_db_neko
if ! docker ps --format '{{.Names}}' | rg -q "^${container}$"; then
  echo "Local mirror database is not running." >&2
  exit 1
fi

repo_dir=$(cd "$(dirname "$0")/.." && pwd)
backup_dir=${LOCAL_MIRROR_BACKUP_DIR:-"$repo_dir/../neko-backups"}
mkdir -p "$backup_dir"
backup_dir=$(cd "$backup_dir" && pwd)
stamp=$(date -u +%Y%m%dT%H%M%SZ)
destination="$backup_dir/neko-mirror-$stamp.dump"
temporary="$destination.partial"
trap 'rm -f "$temporary"' EXIT

docker exec "$container" pg_dump -U postgres -d postgres -Fc > "$temporary"
docker exec -i "$container" pg_restore -l < "$temporary" >/dev/null
mv "$temporary" "$destination"
echo "Local mirror backup verified: $destination"

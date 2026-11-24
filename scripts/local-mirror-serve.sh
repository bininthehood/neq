#!/usr/bin/env bash
# Start a read-only PostgREST for serving the local mirror to the deployed web app.
# Separate from the Supabase dev stack: own random JWT secret, no anonymous role,
# only `mirror_reader` grants. Bound to 127.0.0.1; expose with cloudflared only.
#   bash scripts/local-mirror-serve.sh          # start (idempotent), print token
#   cloudflared tunnel --url http://127.0.0.1:54400
set -euo pipefail
cd "$(dirname "$0")/.."

secret_file=supabase/.mirror-serve.secret   # gitignored
name=neq_mirror_serve
port=${LOCAL_MIRROR_SERVE_PORT:-54400}

if [[ ! -s $secret_file ]]; then
  (umask 077; openssl rand -hex 32 > "$secret_file")
fi
secret=$(cat "$secret_file")

docker exec -i supabase_db_neko psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < supabase/local-mirror-reader.sql

if ! docker ps --format '{{.Names}}' | grep -qx "$name"; then
  docker rm -f "$name" >/dev/null 2>&1 || true
  image=$(docker inspect supabase_rest_neko --format '{{.Config.Image}}')
  docker run -d --name "$name" --restart unless-stopped --network neq-local-mirror \
    -p "127.0.0.1:${port}:3000" \
    -e PGRST_DB_URI="postgres://authenticator:postgres@supabase_db_neko:5432/postgres" \
    -e PGRST_DB_SCHEMAS=public \
    -e PGRST_DB_EXTRA_SEARCH_PATH=public,extensions \
    -e PGRST_JWT_SECRET="$secret" \
    -e PGRST_DB_MAX_ROWS=1000 \
    -e PGRST_OPENAPI_MODE=disabled \
    "$image" >/dev/null
fi

# HS256 token with role=mirror_reader. This is MIRROR_POSTGREST_TOKEN for the web app.
SECRET="$secret" node -e '
const c=require("node:crypto"),b=o=>Buffer.from(JSON.stringify(o)).toString("base64url");
const h=b({alg:"HS256",typ:"JWT"}),p=b({role:"mirror_reader"});
const s=c.createHmac("sha256",process.env.SECRET).update(h+"."+p).digest("base64url");
console.log(h+"."+p+"."+s)'

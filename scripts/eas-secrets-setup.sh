#!/usr/bin/env bash
#
# EAS Secret 일괄 등록 — W6 진입 시 1회 실행.
#
# 전제:
#   - Apple Developer 승인 + EAS login + eas project:init 완료
#   - apps/native/.env 가 채워져 있음 (POSTHOG_KEY, SUPABASE_*)
#
# 사용:
#   bash scripts/eas-secrets-setup.sh
#
# 등록되는 secret 6종:
#   EXPO_PUBLIC_POSTHOG_KEY            — web 과 동일 PostHog project key
#   EXPO_PUBLIC_POSTHOG_HOST           — https://us.i.posthog.com
#   EXPO_PUBLIC_SUPABASE_URL           — Supabase project URL
#   EXPO_PUBLIC_SUPABASE_ANON_KEY      — Supabase anon (public) key
#   EXPO_PUBLIC_TASTE_GENRES_ENABLED   — true (default ON, 명시 등록 권장)
#   EXPO_PUBLIC_OTT_WEAK_SIGNAL        — true
#
# 본 스크립트는 idempotent — 이미 등록된 secret 은 EAS 가 conflict 에러 반환,
# 그 경우 `eas secret:delete --name <NAME>` 후 재실행.
#
set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE="apps/native/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "[error] $ENV_FILE 없음. 먼저 채워주세요." >&2
  exit 1
fi

# .env 파싱 — KEY=VALUE 줄만 추출, EXPO_PUBLIC_* 접두어 매칭
read_env() {
  local key="$1"
  grep -E "^${key}=" "$ENV_FILE" | head -1 | cut -d= -f2-
}

POSTHOG_KEY=$(read_env "EXPO_PUBLIC_POSTHOG_KEY")
POSTHOG_HOST=$(read_env "EXPO_PUBLIC_POSTHOG_HOST")
SUPABASE_URL=$(read_env "EXPO_PUBLIC_SUPABASE_URL")
SUPABASE_ANON_KEY=$(read_env "EXPO_PUBLIC_SUPABASE_ANON_KEY")
TASTE_GENRES_ENABLED=$(read_env "EXPO_PUBLIC_TASTE_GENRES_ENABLED")
OTT_WEAK_SIGNAL=$(read_env "EXPO_PUBLIC_OTT_WEAK_SIGNAL")

# fallback default
POSTHOG_HOST="${POSTHOG_HOST:-https://us.i.posthog.com}"
TASTE_GENRES_ENABLED="${TASTE_GENRES_ENABLED:-true}"
OTT_WEAK_SIGNAL="${OTT_WEAK_SIGNAL:-true}"

# 필수 값 검증
for var in POSTHOG_KEY SUPABASE_URL SUPABASE_ANON_KEY; do
  if [ -z "${!var:-}" ]; then
    echo "[error] $var 가 $ENV_FILE 에 없음" >&2
    exit 1
  fi
done

cd apps/native

register() {
  local name="$1"
  local value="$2"
  echo "[eas secret] $name 등록 시도..."
  if eas secret:create --scope project --name "$name" --value "$value" --non-interactive 2>&1 | tee /tmp/eas-secret-out; then
    echo "  ✅ $name OK"
  else
    if grep -qi "already exists" /tmp/eas-secret-out; then
      echo "  ⚠ $name 이미 존재 — 변경하려면 'eas secret:delete --name $name' 후 재실행"
    else
      echo "  ❌ $name 실패"
      cat /tmp/eas-secret-out
      exit 1
    fi
  fi
}

register EXPO_PUBLIC_POSTHOG_KEY          "$POSTHOG_KEY"
register EXPO_PUBLIC_POSTHOG_HOST         "$POSTHOG_HOST"
register EXPO_PUBLIC_SUPABASE_URL         "$SUPABASE_URL"
register EXPO_PUBLIC_SUPABASE_ANON_KEY    "$SUPABASE_ANON_KEY"
register EXPO_PUBLIC_TASTE_GENRES_ENABLED "$TASTE_GENRES_ENABLED"
register EXPO_PUBLIC_OTT_WEAK_SIGNAL      "$OTT_WEAK_SIGNAL"

echo ""
echo "=== 등록 완료 ==="
echo "확인: eas secret:list"

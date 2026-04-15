#!/bin/bash
# PostHog 이벤트 실시간 확인 스크립트
#
# 사용법:
#   1. .env.local에 POSTHOG_PAT, POSTHOG_PROJECT_ID 추가:
#      POSTHOG_PAT=phx_xxxxxxxxxxxxx
#      POSTHOG_PROJECT_ID=12345
#   2. bash scripts/watch-events.sh
#
# jq가 없으면: brew install jq

set -e

# .env.local 로드
if [ -f .env.local ]; then
  export $(grep -E '^(POSTHOG_PAT|POSTHOG_PROJECT_ID|POSTHOG_HOST)=' .env.local | xargs)
fi

POSTHOG_HOST="${POSTHOG_HOST:-https://us.i.posthog.com}"

if [ -z "$POSTHOG_PAT" ] || [ -z "$POSTHOG_PROJECT_ID" ]; then
  echo "ERROR: .env.local에 POSTHOG_PAT와 POSTHOG_PROJECT_ID 설정 필요"
  echo "  POSTHOG_PAT=phx_xxxxxxxxxxxxx"
  echo "  POSTHOG_PROJECT_ID=12345"
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq 필요. 설치: brew install jq"
  exit 1
fi

echo "🔍 최근 10개 이벤트 (5초마다 갱신, Ctrl+C로 종료)"
echo "────────────────────────────────────────────────"

LAST_ID=""
while true; do
  RESPONSE=$(curl -s -H "Authorization: Bearer $POSTHOG_PAT" \
    "$POSTHOG_HOST/api/projects/$POSTHOG_PROJECT_ID/events/?limit=10")

  echo "$RESPONSE" | jq -r '.results[] |
    "\(.timestamp | split("T")[1] | split(".")[0])  \(.event)  \(.properties | to_entries | map(select(.key | test("^(tmdb_id|reaction|direction|title|count|source|provider|kind|value)$"))) | map("\(.key)=\(.value)") | join(" "))"' \
    | tac

  echo ""
  echo "⟳ 5초 후 갱신..."
  sleep 5
  clear
done

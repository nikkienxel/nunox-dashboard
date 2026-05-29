#!/bin/bash
# Legacy helper kept for the old quick trycloudflare flow.
# The dashboard now uses a fixed Cloudflare named tunnel hostname, so this
# script only enforces the stable endpoint file when run manually.

DIR="/Users/jacai/.openclaw/workspace/nunox-dashboard"
URL_FILE="$DIR/refresh-endpoint.txt"
URL="https://sales.nunox-ai.com"

echo "[$(date)] Refresh endpoint is fixed: $URL"
echo "$URL" > "$URL_FILE"

cd "$DIR"
git add refresh-endpoint.txt
if git diff --staged --quiet; then
  echo "[$(date)] ℹ️ refresh-endpoint.txt already current"
else
  echo "[$(date)] refresh-endpoint.txt changed; commit it with the dashboard update"
fi

#!/bin/bash
# Watches the CF tunnel log and pushes the current public URL to GitHub
# so the dashboard refresh button always has the correct endpoint.

LOG="/tmp/cf-dashboard-refresh-err.log"
DIR="/Users/jacai/.openclaw/workspace/nunox-dashboard"
URL_FILE="$DIR/refresh-endpoint.txt"

echo "[$(date)] Waiting for Cloudflare tunnel URL..."

for i in $(seq 1 30); do
  URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOG" 2>/dev/null | tail -1)
  if [ -n "$URL" ]; then
    break
  fi
  sleep 2
done

if [ -z "$URL" ]; then
  echo "[$(date)] ❌ Could not find tunnel URL"
  exit 1
fi

echo "[$(date)] ✅ Tunnel URL: $URL"
echo "$URL" > "$URL_FILE"

cd "$DIR"
git add refresh-endpoint.txt
git diff --staged --quiet || git commit -m "chore: update refresh endpoint URL" && git push
echo "[$(date)] ✅ Pushed refresh-endpoint.txt to GitHub"

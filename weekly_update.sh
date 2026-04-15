#!/bin/bash
# Nunox Dashboard Weekly Auto-Update
# 每週一 8AM 台北時間由 launchd 觸發

LOG="/Users/jacai/.openclaw/workspace/nunox-dashboard/auto_update.log"
DIR="/Users/jacai/.openclaw/workspace/nunox-dashboard"

echo "[$(date)] Starting weekly dashboard update..." >> "$LOG"

cd "$DIR" || exit 1

# 產生最新 dashboard
node fetch-data.js >> "$LOG" 2>&1
if [ $? -ne 0 ]; then
    echo "[$(date)] ❌ fetch-data.js failed" >> "$LOG"
    exit 1
fi

# 重新產生 index.html (login page)
node build-index.js >> "$LOG" 2>&1
if [ $? -ne 0 ]; then
    echo "[$(date)] ❌ build-index.js failed" >> "$LOG"
    exit 1
fi

# Commit & push
git add dashboard.html index.html >> "$LOG" 2>&1
git commit -m "Auto: weekly dashboard update $(date '+%Y-%m-%d')" >> "$LOG" 2>&1
git push >> "$LOG" 2>&1

if [ $? -eq 0 ]; then
    echo "[$(date)] ✅ Dashboard updated and pushed successfully" >> "$LOG"
else
    echo "[$(date)] ❌ Git push failed" >> "$LOG"
    exit 1
fi

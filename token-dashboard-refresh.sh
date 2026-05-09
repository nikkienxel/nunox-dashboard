#!/bin/zsh
set -euo pipefail
cd /Users/jacai/.openclaw/workspace/nunox-dashboard
/opt/homebrew/bin/node scripts/token-dashboard-build.js >> token-dashboard-refresh.log 2>&1

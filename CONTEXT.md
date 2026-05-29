# CONTEXT.md — nunox-dashboard

## 這是什麼
Nunox 每週業務 Dashboard，從 Google Sheets 自動抓取資料，生成靜態 HTML 部署到 GitHub Pages。

## 架構
```
fetch-data.js       → 主要資料抓取 + dashboard.html 生成腳本
dashboard.html      → 生成的 dashboard（不要手動編輯，會被覆蓋）
index.html          → 登入頁（login guard，成功後跳轉 dashboard.html）
weekly_update.sh    → launchd 自動更新腳本
server.js           → 本地開發用（含 Basic Auth）
build-index.js      → index.html 構建腳本（已不常用）
scripts/token-dashboard-build.js → OpenClaw token dashboard 靜態生成器（不嵌 gateway token）
token-dashboard-refresh.sh → hourly launchd refresh script for token-dashboard.html
```

## 部署
- GitHub Pages: https://nikkienxel.github.io/nunox-dashboard/
- 登入帳號：Jac、Sylvia
- 認證方式：localStorage (`nx_auth`) 儲存 SHA-256 auth hash；`index.html` 登入成功後跳轉 `dashboard.html`，`dashboard.html` 未驗證會 redirect 回 `index.html`

## 資料來源
- Sales Records: `1SpwPPqoR_tfcT63xY-7QUJWKXD4-mnhL74CHlbSmzq4`
  - `Summary` tab — 年度目標
  - `Customers Satus` tab — 客戶狀態（col C=customer, col D=status）
  - `2026 Monthly Revenue` tab — 月度收入
  - `Detail Records` tab — 逐筆交易
- Sales Leads: `11bi6h7PT4kmBWtxQ2jSbu8heet8sswYq5VBPK9DC5N0`
  - `Sales Funnel(2026)` tab — col A=Status, F=Category, J=Revenue, K=%, L=Weighted

## Dashboard 功能
- KPI: Total Customers, New, Recurrent, YTD Revenue, ARR, Outstanding Balance
- Revenue Trend: 月度 bar chart
- Pipeline by Stage (excl. Closed — Closed 已計入收入)
- Pipeline by Customer Category (col F)
- Quarterly Revenue vs Goal
- 🔄 Refresh 按鈕（reload）
- 已取消 AI 週報生成（2026-05-18 起不再呼叫 OpenAI、不再顯示 Weekly Sales Review 區塊）

## Token Dashboard
- `token-dashboard.html` 由 `scripts/token-dashboard-build.js` 生成，資料來自 `openclaw sessions --all-agents --json`
- 同步輸出兩份：repo 內 `nunox-dashboard/token-dashboard.html` + Jac 常用路徑 `/Users/jacai/.openclaw/workspace/token-dashboard.html`
- 不再依賴 `agent-status-server.js` / port 18888，也不嵌入 Gateway token
- launchd: `ai.nunox.token-dashboard-refresh`
- 時間: 每小時（StartInterval 3600）+ RunAtLoad
- Log: `token-dashboard-refresh.log`
- 手動觸發: `bash token-dashboard-refresh.sh` 或 `npm run token-dashboard`

## 已知 Column Index
- Customers Satus sheet: row[2]=customer, row[3]=status, row[2]=label(Total/New/Recurrent), row[3]=value
- Detail Records sheet: col B(idx 1)=customer, col D(idx 3)=type, col E(idx 4)=date, col H(idx 7)=product, col AB(idx 27)=Total NunoX Revenue, col AD(idx 29)=Outstanding

## 更新紀錄
- **2026-05-29**: 新增 Sylvia dashboard login，將登入頁與 dashboard guard 從可解碼的 base64 token 改為 SHA-256 auth hash allowlist；同步更新本地 `build-index.js` / `fetch-data.js`，避免 weekly update 覆蓋登入設定。
- **2026-05-18**: Jac requested canceling dashboard weekly report generation. Removed the OpenAI/GPT-4o weekly sales review call from `fetch-data.js`, removed the Weekly Sales Review block from generated `dashboard.html`/`index.html`, and removed the `openai` npm dependency. Future weekly updates only refresh data and pages.
- **2026-05-18**: Weekly dashboard update pushed (`30d6080`): Customers 34, New this month 2, YTD Revenue $201.7K (20.2% of $1.00M goal), ARR $90.8K, Outstanding $181.9K, Pipeline $896.5K total / $333.6K weighted, Est. 2026 Revenue $535.3K. AI review call returned OpenAI quota 429, but dashboard HTML still generated and deployed.
- **2026-05-11**: Weekly dashboard update pushed (`508c9db`): Customers 34, New this month 2, YTD Revenue $202.9K (20.3% of $1.00M goal), ARR $91.0K, Outstanding $211.6K, Pipeline $921.5K total / $341.1K weighted, Est. 2026 Revenue $544.1K. AI review call returned OpenAI quota 429, but dashboard HTML still generated and deployed.

## 已知問題修復紀錄
- **2026-05-24**: 修復 `dashboard.html` 直連不會回登入頁、`index.html` 用 blob iframe 顯示 dashboard 的不穩定登入流程
  - 根本原因：登入頁與文件描述不一致；`dashboard.html` 沒有 auth guard，使用者若直接開 Jac 常用的 `dashboard.html` URL，不會走登入流程
  - 修復：`build-index.js` 改為登入成功後導向 `dashboard.html`；`fetch-data.js` 生成的 `dashboard.html` 加上 `localStorage nx_auth` 檢查，未登入自動回 `index.html`
- **2026-05-24**: 修復 dashboard Refresh 按鈕顯示 `Unexpected token 'o', "not fou..."`
  - 根本原因：`refresh-server.js` 用 `req.url === '/refresh'` 判斷 route；前端呼叫 `/refresh?s=nunox-refresh-2026` 時 `req.url` 含 query string，server 回純文字 404 `not found`，前端再直接 `r.json()` 導致 JSON parse error
  - 修復：refresh server 改用 `new URL(req.url, ...)` 判斷 `pathname` 並讀 query secret；`dashboard.html` refresh client 改成先讀 text、再安全 parse JSON，非 JSON response 會顯示可讀 HTTP 錯誤
  - 已重啟本機 3099 refresh server；Cloudflare tunnel `/refresh?s=bad-secret` 已驗證回 JSON 403 而非 404 純文字
- **2026-05-24**: 修復 Refresh 成功 push 但 GitHub Pages 短時間仍顯示舊 dashboard
  - 根本原因：GitHub Pages/Fastly 對 `dashboard.html` 回 `cache-control: max-age=600`，refresh 背景 push 已成功，但 direct URL 仍可能被 CDN 快取約 10 分鐘
  - 修復：refresh client 在 API 回 OK 後用 GitHub Contents API raw response 輪詢 `main/dashboard.html`，偵測到 `Generated` 時間更新後直接用最新 HTML 替換目前頁面，避免使用者看到 Pages 舊快取
- **2026-04-15**: 第三次 login 失敗
  - 根本原因：`build-index.js` 用 `sessionStorage`（應為 `localStorage`），且未 escape `</script>` in template literal → HTML parser 在第一個 `</script>` 就截斷外層 script block，導致 `doLogin` 變成 `undefined`
  - 修復：`build-index.js` 改 `localStorage` + 用 `<\x2fscript>` escape；`weekly_update.sh` 加入 `node build-index.js` step 確保每次更新同步修復 `index.html`

## 自動排程
- launchd: `com.nunox.dashboard-weekly-update`
- 時間: 每週一 8:00 AM 台北時間
- Log: `auto_update.log`
- 手動觸發: `bash weekly_update.sh`

### Token Dashboard 自動刷新
- launchd: `ai.nunox.token-dashboard-refresh`
- 時間: 每小時
- Log: `token-dashboard-refresh.log`
- 手動觸發: `bash token-dashboard-refresh.sh`

## 更新 dashboard 步驟
```bash
cd /Users/jacai/.openclaw/workspace/nunox-dashboard
node fetch-data.js    # 重新抓資料、生成 dashboard.html
git add dashboard.html && git commit -m "Update" && git push
```

## GitHub
`https://github.com/nikkienxel/nunox-dashboard` (private)

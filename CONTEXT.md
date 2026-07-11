# CONTEXT.md — nunox-dashboard

## 這是什麼
Nunox 每週業務 Dashboard，從 Google Sheets 自動抓取資料，生成靜態 HTML 部署到 GitHub Pages。

## 架構
```
fetch-data.js       → 主要資料抓取 + dashboard.html 生成腳本
dashboard.html      → 生成的 dashboard（不要手動編輯，會被覆蓋）
index.html          → 登入頁（login guard，成功後跳轉 dashboard.html）
weekly_update.sh    → launchd 自動更新腳本
scripts/send-weekly-dashboard-email.js → weekly update 成功 push 後寄 Gmail 通知 sales@nunox.io
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
- Customers Satus sheet: row[0]=category, row[2]=customer, row[3]=status, row[2]=label(Total/New/Recurrent), row[3]=value
- Detail Records sheet: col B(idx 1)=customer, col D(idx 3)=type, col E(idx 4)=date, col H(idx 7)=product, col AB(idx 27)=Total NunoX Revenue, col AD(idx 29)=Outstanding

## 更新紀錄
- **2026-07-11**: 更新 Customer Revenue Threshold 為 active-only 口徑：從 `Customers Satus` 讀取 category/customer/status（range 擴為 `A1:H500` 避免漏掉新列），非 `Active` customer 不列入門檻統計與 customer transaction table。本次 active Detail Records customers 為 `35`，超過 `$25,000` 的客戶 `5`，比例 `14.3%`。同區塊新增 Average Deal Value by Customer Type，依 active Detail Records transactions 分為 `T2 Suppliers`、`T1 Suppliers`、`Acadamic`、`Others`，本次平均成交單價分別為 `$8.7K`、`$5.3K`、`$3.0K`、`$2.6K`；`T1 & T2` 類別歸入 `T2 Suppliers`，避免重複計算。
- **2026-07-11**: 修復 login 失敗時缺少可讀錯誤與 HTTP→HTTPS 過渡期 `crypto.subtle` 不可用的風險。`index.html` 現在會在 insecure context 重新導向 HTTPS，並在 Web Crypto 不可用時顯示明確錯誤，不再讓登入按鈕看起來無反應。新增 Detail Records 客戶交易總額統計：依 unique customer 彙總 `Total NunoX Revenue`（all years），以 `$25,000` 為門檻顯示超標客戶數、比例與全客戶交易總額表；本次資料為 `7 / 56 = 12.5%`。
- **2026-07-01**: 修復 Sales Pipeline summary weighted 口徑不一致。Google Sheet `Sales Funnel(2026)` row 1 `Total Deals (Active)` 的 revenue/weighted 都是 Active-only；dashboard 之前 `Active Leads Revenue` 用 Active-only，但 `Weighted Pipeline` 用所有 non-Closed（Active + Pending + Dead）加總，導致 weighted 顯示 `$144.6K` 而 Sheet Active weighted 是 `$120.9K`。改為 summary KPI `Weighted Deals (Active)` 使用 Active-only，Estimated Revenue 同步改為 YTD + active weighted deals；stage/category/probability breakdown 仍保留 Pending/Dead 可視化。新增 `calculateLeadTotals` regression test。
- **2026-06-15**: 修復 Refresh API port collision。`sales-api.nunox-ai.com` tunnel 原本指向 `localhost:3099`，但 3099 被 `com.nunox.3d-converter` 佔用，dashboard refresh server 起不來並在 log 顯示 `EADDRINUSE`，前端 Refresh 因此打到 3D converter 的 Express server，回 `Cannot POST /refresh`。`refresh-server.js` 預設 port 改為 `3101`（可用 `REFRESH_PORT` 覆蓋），本機 launchd 與 Cloudflare tunnel 需同步指向 `localhost:3101`。
- **2026-06-08**: 修復 Outstanding Balance 計算錯誤。Google Sheet `Detail Records` 欄位已位移，舊版 `fetch-data.js` 仍用固定 index，誤把 `Total Received Amount in USD` 當成 `Outstanding Balance`，導致 dashboard 顯示 `$351.5K`。改成依 header 名稱定位 `Type`、`Date`、`Purchased Product`、`Total NunoX Revenue`、`Outstanding Balance` 欄位，重新生成 `dashboard.html` 後 Outstanding 為 `$139.0K`（sheet 總和 `138,954.7`）。同時 ARR 因 `Purchased Product` 欄位定位修正，從 `$0` 回到 `$105.6K`。
- **2026-06-01**: 每週 dashboard 自動更新成功 push 後，`weekly_update.sh` 會呼叫 `scripts/send-weekly-dashboard-email.js`，透過 `nikkienxel@gmail.com` 寄給 `sales@nunox.io`。Subject 格式：`NunoX Weekly Business Dashboard - YYYY-MM-DD`，日期使用台北時區；信件內含 dashboard 連結 `https://sales.nunox-ai.com/dashboard.html`。`tests/auth-flow.test.js` 已加入 weekly email static validation，不會寄測試信。
- **2026-06-01**: 修復 GitHub Pages CNAME redirect 造成 login 失敗。`https://nikkienxel.github.io/nunox-dashboard/dashboard.html` 會 301 到 `http://sales.nunox-ai.com/dashboard.html`；HTTP 不是 secure context，瀏覽器不提供 `crypto.subtle`，登入頁無法計算 SHA-256 auth hash。`index.html` 與 `dashboard.html` 先自動升級到 HTTPS，再執行 login/auth guard；本機 ignored generator `build-index.js` / `fetch-data.js` 也同步更新，避免 weekly update 覆蓋修復。
- **2026-05-29**: 將固定網域拆分為 Dashboard web 與 Refresh API：`sales.nunox-ai.com` 作為 dashboard 網頁 hostname，repo 新增 `CNAME`；`sales-api.nunox-ai.com` 作為 refresh API hostname，Cloudflare tunnel DNS route 指到同一條 named tunnel。`~/.cloudflared/nunox-sales-dashboard.yml` ingress 已改成 `sales-api.nunox-ai.com` → 本機 refresh server `localhost:3099`，`sales.nunox-ai.com` → 本機靜態 dashboard web server `localhost:3100`。本機 web server 由 launchd `com.nunox.dashboard-web` 常駐，服務 repo 目錄；Refresh button endpoint 改為 `https://sales-api.nunox-ai.com/refresh`。
- **2026-05-29**: 新增 Sylvia dashboard login，將登入頁與 dashboard guard 從可解碼的 base64 token 改為 SHA-256 auth hash allowlist；同步更新本地 `build-index.js` / `fetch-data.js`，避免 weekly update 覆蓋登入設定。
- **2026-05-29**: 將 Refresh button 改為固定 endpoint `https://sales.nunox-ai.com/refresh`，不再從 GitHub 讀 quick trycloudflare URL；`refresh-endpoint.txt` 保留同一個固定 hostname 供追蹤。停用本機 `com.nunox.dashboard-update-refresh-url` 的 5 分鐘 launchd interval，`update-refresh-url.sh` 改成 legacy/no-op helper，不再自動 commit/push 隨機 tunnel URL。固定 Cloudflare named tunnel `nunox-sales-dashboard` 透過 `sales.nunox-ai.com` 指向本機 refresh server port 3099。
- **2026-05-29**: 修復 Refresh button 再次失效。根本原因：quick trycloudflare tunnel URL 已失效，`refresh-endpoint.txt` 仍指向舊 URL；本機 `refresh-server.js` 仍健康。重啟 `com.nunox.cf-dashboard-refresh` 取得新 tunnel URL，更新並 push `refresh-endpoint.txt`，實測 `/refresh` 成功產生並 push dashboard commit `9f85c43`。另外將 `com.nunox.dashboard-update-refresh-url` launchd 加上 `StartInterval=300`，每 5 分鐘檢查 tunnel log 並在 URL 改變時更新 GitHub，降低 quick tunnel 換 URL 後按鈕再次失效的機率。
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

### Dashboard Web / Refresh Tunnel
- Cloudflare named tunnel: `nunox-sales-dashboard`
- launchd: `com.nunox.cf-dashboard-refresh`
- Config: `~/.cloudflared/nunox-sales-dashboard.yml`
- Dashboard web: `https://sales.nunox-ai.com` → `localhost:3100`
- Dashboard web launchd: `com.nunox.dashboard-web`
- Refresh API: `https://sales-api.nunox-ai.com/refresh` → `localhost:3101`

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

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
```

## 部署
- GitHub Pages: https://nikkienxel.github.io/nunox-dashboard/
- 登入帳密：jac@nunox.io / nunoX93623642
- 認證方式：sessionStorage（index.html → dashboard.html redirect）

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
- 📊 AI 週報：GPT-4o 繁體中文，分析動能/優劣/達標可能性/pipeline 目標

## 已知 Column Index
- Customers Satus sheet: row[2]=customer, row[3]=status, row[2]=label(Total/New/Recurrent), row[3]=value
- Detail Records sheet: col B(idx 1)=customer, col D(idx 3)=type, col E(idx 4)=date, col H(idx 7)=product, col AB(idx 27)=Total NunoX Revenue, col AD(idx 29)=Outstanding

## 自動排程
- launchd: `com.nunox.dashboard-weekly-update`
- 時間: 每週一 8:00 AM 台北時間
- Log: `auto_update.log`
- 手動觸發: `bash weekly_update.sh`

## 更新 dashboard 步驟
```bash
cd /Users/jacai/.openclaw/workspace/nunox-dashboard
node fetch-data.js    # 重新抓資料、生成 dashboard.html
git add dashboard.html && git commit -m "Update" && git push
```

## GitHub
`https://github.com/nikkienxel/nunox-dashboard` (private)

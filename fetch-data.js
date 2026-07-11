#!/usr/bin/env node
/**
 * Nunox Business Dashboard — Data Fetcher
 * Reads Sales Records + Sales Leads from Google Sheets, generates dashboard HTML
 */

const { google } = (() => { try { return require('/Users/jacai/.openclaw/workspace/node_modules/googleapis'); } catch(e) { return require('googleapis'); } })();
const fs = require('fs');
const path = require('path');

const CLIENT_PATH = path.join(process.env.HOME, '.openclaw/secrets/google-oauth-client.json');
const TOKEN_PATH  = path.join(process.env.HOME, '.openclaw/secrets/google-oauth-tokens.json');
const OUTPUT_HTML = path.join(__dirname, 'dashboard.html');
const DASHBOARD_AUTH_HASHES = [
  'e8dedae91ed0505719be1566f72a84542bdbb731062fbb36462b8daab767149f',
  '8d6a1a27345582135057aa7143fac3377143235699c4b316f6ae2cae4d72e93a'
];

const SALES_RECORDS_ID = '1SpwPPqoR_tfcT63xY-7QUJWKXD4-mnhL74CHlbSmzq4';
const SALES_LEADS_ID   = '11bi6h7PT4kmBWtxQ2jSbu8heet8sswYq5VBPK9DC5N0';
const CUSTOMER_REVENUE_THRESHOLD = 25000;
const AVG_DEAL_GROUPS = [
  'T2 Suppliers',
  'T1 Suppliers',
  'Acadamic',
  'Others',
];

// ─── Auth ──────────────────────────────────────────────────────────────────
function getAuth() {
  // Support env vars for CI / GitHub Actions
  const credentials = process.env.GOOGLE_OAUTH_CLIENT
    ? JSON.parse(process.env.GOOGLE_OAUTH_CLIENT)
    : JSON.parse(fs.readFileSync(CLIENT_PATH));
  const tokens = process.env.GOOGLE_OAUTH_TOKENS
    ? JSON.parse(process.env.GOOGLE_OAUTH_TOKENS)
    : JSON.parse(fs.readFileSync(TOKEN_PATH));
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  auth.setCredentials(tokens);
  return auth;
}

function toNum(v) {
  if (v === undefined || v === null || v === '') return 0;
  const n = parseFloat(String(v).replace(/[$,\s]/g, ''));
  return isNaN(n) ? 0 : n;
}

function fmt(n, currency = 'USD') {
  if (n >= 1000000) return '$' + (n / 1000000).toFixed(2) + 'M';
  if (n >= 1000)    return '$' + (n / 1000).toFixed(1) + 'K';
  return '$' + n.toFixed(0);
}

function calculateLeadTotals(stageMap) {
  const activeEntries = Object.entries(stageMap)
    .filter(([stage]) => stage.toLowerCase() === 'active');
  const totalLeadRevenue = activeEntries
    .reduce((sum, [, v]) => sum + v.totalValue, 0);
  const totalWeightedRevenue = activeEntries
    .reduce((sum, [, v]) => sum + v.totalWeighted, 0);

  return { totalLeadRevenue, totalWeightedRevenue };
}

function normalizeCustomerName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function customerKeysMatch(left, right) {
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function buildCustomerProfiles(rows, {
  categoryIndex = 0,
  customerIndex = 2,
  statusIndex = 3,
} = {}) {
  const profiles = new Map();

  rows.forEach(row => {
    const name = String(row[customerIndex] || '').trim();
    if (!name) return;

    const key = normalizeCustomerName(name);
    const existing = profiles.get(key) || { name, category: '', status: '' };
    const category = String(row[categoryIndex] || '').trim();
    const status = String(row[statusIndex] || '').trim();

    profiles.set(key, {
      name: existing.name || name,
      category: category || existing.category,
      status: status || existing.status,
    });
  });

  return profiles;
}

function findCustomerProfile(customerName, profiles) {
  const key = normalizeCustomerName(customerName);
  return profiles.get(key) ||
    [...profiles.entries()].find(([profileKey]) => customerKeysMatch(key, profileKey))?.[1] ||
    null;
}

function isActiveCustomer(customerName, profiles) {
  const profile = findCustomerProfile(customerName, profiles);
  return profile?.status.toLowerCase() === 'active';
}

function classifyCustomerCategory(category) {
  const normalized = String(category || '').toLowerCase();
  if (normalized.includes('t2')) return 'T2 Suppliers';
  if (normalized.includes('t1')) return 'T1 Suppliers';
  if (normalized.includes('academic') || normalized.includes('acadamic')) return 'Acadamic';
  return 'Others';
}

function aggregateCustomerRevenue(rows, { customerIndex, revenueIndex, includeCustomer }) {
  const customerMap = new Map();

  rows.forEach(row => {
    const customerName = String(row[customerIndex] || '').trim();
    if (!customerName || customerName === 'undefined') return;
    if (includeCustomer && !includeCustomer(customerName, row)) return;

    const customerKey = normalizeCustomerName(customerName);
    const existing = customerMap.get(customerKey) || { name: customerName, totalRevenue: 0 };
    existing.totalRevenue += toNum(row[revenueIndex]);
    customerMap.set(customerKey, existing);
  });

  return [...customerMap.values()].sort((a, b) => b.totalRevenue - a.totalRevenue);
}

function calculateAverageDealValueByCategory(rows, { customerIndex, revenueIndex, customerProfiles }) {
  const groups = Object.fromEntries(AVG_DEAL_GROUPS.map(group => [
    group,
    { revenue: 0, dealCount: 0, customerKeys: new Set() },
  ]));

  rows.forEach(row => {
    const customerName = String(row[customerIndex] || '').trim();
    if (!customerName || customerName === 'undefined') return;
    if (!isActiveCustomer(customerName, customerProfiles)) return;

    const revenue = toNum(row[revenueIndex]);
    if (revenue <= 0) return;

    const profile = findCustomerProfile(customerName, customerProfiles);
    const group = classifyCustomerCategory(profile?.category);
    groups[group].revenue += revenue;
    groups[group].dealCount += 1;
    groups[group].customerKeys.add(normalizeCustomerName(customerName));
  });

  return AVG_DEAL_GROUPS.map(group => {
    const data = groups[group];
    const averageDealValue = data.dealCount > 0 ? data.revenue / data.dealCount : 0;
    return {
      group,
      revenue: data.revenue,
      dealCount: data.dealCount,
      customerCount: data.customerKeys.size,
      averageDealValue,
    };
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeHeader(header) {
  return String(header || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function requireHeaderIndex(headers, terms) {
  const normalizedTerms = terms.map(normalizeHeader);
  const index = headers.findIndex(header => {
    const normalizedHeader = normalizeHeader(header);
    return normalizedTerms.every(term => normalizedHeader.includes(term));
  });
  if (index === -1) {
    throw new Error(`Missing Detail Records column: ${terms.join(' + ')}`);
  }
  return index;
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  // ── 1. Summary tab (quick numbers) ──────────────────────────────────────
  const summaryRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SALES_RECORDS_ID,
    range: 'A1:Z20',
  });
  const summaryRows = summaryRes.data.values || [];

  let yearGoal = 0;
  summaryRows.forEach(row => {
    if (row[0] === '2026 Goal') yearGoal = toNum(row[1]);
    // Note: accRevYear is now calculated directly from Detail Records (more reliable)
  });

  // ── 2. Customers Status ──────────────────────────────────────────────────
  const custRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SALES_RECORDS_ID,
    range: "'Customers Satus'!A1:D20",
  });
  const custRows = custRes.data.values || [];

  let totalCustomers = 0, newCustomers = 0, recurrentCustomers = 0;
  custRows.forEach(row => {
    // Sheet layout: col C (idx 2) = label, col D (idx 3) = value
    if (String(row[2] || '').includes('Total Customers')) totalCustomers = toNum(row[3]);
    if (String(row[2] || '').trim() === 'New')       newCustomers = toNum(row[3]);
    if (String(row[2] || '').trim() === 'Recurrent') recurrentCustomers = toNum(row[3]);
  });

  // ── 3. Monthly Revenue — calculated directly from Detail Records ──────────
  // (no longer reading the '2026 Monthly Revenue' tab; Detail Records is authoritative)
  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthlyRevenue = new Array(12).fill(0);
  let revenueThisMonth = 0;
  const now = new Date();
  const curYear  = now.getFullYear();
  const curMonth = now.getMonth(); // 0-based
  // monthlyRevenue[] is populated in the Detail Records loop below

  // Read Detail Records — col A:AH (authoritative source for all revenue numbers)
  const detailRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SALES_RECORDS_ID,
    range: "'Detail Records'!A1:AH500",
  });
  const detailRows = detailRes.data.values || [];
  const detailHeaders = detailRows[0] || [];

  // Column indices (0-based)
  const colType        = requireHeaderIndex(detailHeaders, ['type']);
  const colDate        = requireHeaderIndex(detailHeaders, ['date', 'mm/dd/yyyy']);
  const colCustomer    = 1; // col B
  const colProduct     = requireHeaderIndex(detailHeaders, ['purchased product']);
  const colTotalNunoX  = requireHeaderIndex(detailHeaders, ['total nunox', 'revenue']);
  const colOutstanding = requireHeaderIndex(detailHeaders, ['outstanding balance']);

  // Software products
  const SW_PRODUCTS = ['studio_service','nunox_suite','dmktz_studio','nunox_service','nunox_lite','nunox service','nunox suite','studio service'];
  function isSoftware(product) {
    const p = String(product || '').toLowerCase().trim().replace(/[_\s]/g,'');
    return SW_PRODUCTS.some(sw => p === sw.replace(/[_\s]/g,''));
  }

  // ── Read Customers Status to get Active customer list ──
  const custStatusRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SALES_RECORDS_ID,
    range: "'Customers Satus'!A1:H500",
  });
  const custStatusRows = custStatusRes.data.values || [];
  const customerProfiles = buildCustomerProfiles(custStatusRows.slice(6));

  // ── Parse all Detail Records ──
  // For ARR: per-customer, track software fees by year
  // Map: customerKey → { sw2025: number, sw2026: number }
  const custSWByYear = {}; // key = customer name lowercase

  let accRevYear = 0;       // YTD revenue — summed from Detail Records
  let recurrentRevenue = 0;
  let outstandingBalance = 0;
  const newCustomersThisMonth = new Set();
  const existingCustomers = new Set();
  const customerRevenueTotals = aggregateCustomerRevenue(detailRows.slice(1), {
    customerIndex: colCustomer,
    revenueIndex: colTotalNunoX,
    includeCustomer: customerName => isActiveCustomer(customerName, customerProfiles),
  });
  const customersOverThreshold = customerRevenueTotals.filter(customer =>
    customer.totalRevenue > CUSTOMER_REVENUE_THRESHOLD
  );
  const customerRevenueRatio = customerRevenueTotals.length > 0
    ? (customersOverThreshold.length / customerRevenueTotals.length * 100)
    : 0;
  const averageDealValueByCategory = calculateAverageDealValueByCategory(detailRows.slice(1), {
    customerIndex: colCustomer,
    revenueIndex: colTotalNunoX,
    customerProfiles,
  });

  detailRows.slice(1).forEach(row => {
    const custName = String(row[colCustomer] || '').trim();
    if (!custName || custName === 'undefined') return;
    const custKey   = custName.toLowerCase();
    const type      = String(row[colType] || '').trim();
    const dateStr   = String(row[colDate] || '').trim();
    const product   = String(row[colProduct] || '').trim();
    const nunoXRev  = toNum(row[colTotalNunoX]);
    const outstanding = toNum(row[colOutstanding]);

    const dm = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!dm) return;
    const d = new Date(`${dm[3]}-${dm[1].padStart(2,'0')}-${dm[2].padStart(2,'0')}`);
    const yr = d.getFullYear();

    // Software fee tracking per customer per year (Active customers only)
    if (isSoftware(product) && nunoXRev > 0) {
      if (isActiveCustomer(custName, customerProfiles)) {
        if (!custSWByYear[custKey]) custSWByYear[custKey] = { sw2025: 0, sw2026: 0 };
        if (yr === curYear - 1) custSWByYear[custKey].sw2025 += nunoXRev;
        if (yr === curYear)     custSWByYear[custKey].sw2026 += nunoXRev;
      }
    }

    // YTD revenue — sum all 2026 transactions from Detail Records
    if (yr === curYear && nunoXRev > 0) {
      accRevYear += nunoXRev;
      monthlyRevenue[d.getMonth()] += nunoXRev;
    }

    // Recurring revenue (current year, Repeat type only)
    if (yr === curYear && /repeat/i.test(type)) {
      recurrentRevenue += nunoXRev;
    }

    // New customers this month vs existing
    if (yr === curYear) {
      if (d.getMonth() === curMonth) newCustomersThisMonth.add(custName);
      else existingCustomers.add(custName);
    }

    // Outstanding balance
    outstandingBalance += outstanding;
  });

  const newCustCount = [...newCustomersThisMonth].filter(c => !existingCustomers.has(c)).length;

  // ── ARR calculation ──
  // For each active customer:
  //   - If they have 2026 software fee → use 2026 value (already renewed)
  //   - If only 2025 software fee → use 2025 value (still active, not yet renewed)
  //   Sum all of these
  let arr = 0;
  Object.values(custSWByYear).forEach(({ sw2025, sw2026 }) => {
    if (sw2026 > 0) {
      arr += sw2026; // renewed in 2026 — use 2026 fee
    } else {
      arr += sw2025; // not yet renewed — use 2025 fee as proxy
    }
  });

  // Outstanding balance: summed directly from Detail Records (col AD)
  // (no longer overriding from Monthly Revenue Grand Total)

  // Set revenueThisMonth from the monthly breakdown built in the Detail Records loop
  revenueThisMonth = monthlyRevenue[curMonth];

  // ── 4. Sales Leads — Sales Funnel(2026) ──────────────────────────────────
  let leadsRows = [];
  let leadsPermissionError = false;
  try {
    const leadsRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SALES_LEADS_ID,
      range: "'Sales Funnel(2026)'!A1:O200",
    });
    leadsRows = leadsRes.data.values || [];
  } catch (leadsErr) {
    console.warn('⚠️ Sales Leads spreadsheet unavailable:', leadsErr.message);
    leadsPermissionError = true;
  }

  // Row 1 = totals, Row 2 = headers
  const leadsHeaders = leadsRows[1] || [];
  // Cols (0-indexed): A=Status, D=Customer, I=Revenue, J=%, K=Weighted Revenue, L=Date Created, M=Closing Date
  const lColStatus   = 0;
  const lColCustomer = 4;
  const lColRevenue  = 9;
  const lColProb     = 10;
  const lColWeighted = 11;

  // Col F (index 5) = Category
  const lColCategory = 5;

  // Stage grouping — Closed leads are tracked but excluded from pipeline totals
  const stageMap = {};
  const categoryMap = {};
  // Probability tier map: high (>80%), mid (50-80%), low (<50%)
  const probTierMap = {};
  leadsRows.slice(2).forEach(row => {
    if (!row[lColCustomer]) return;
    const status   = String(row[lColStatus] || 'Unknown').trim();
    const val      = toNum(row[lColRevenue]);
    const prob     = toNum(String(row[lColProb] || '0').replace('%',''));
    const weighted = toNum(row[lColWeighted]);
    const category = String(row[lColCategory] || 'Uncategorized').trim() || 'Uncategorized';
    const isClosed = status.toLowerCase() === 'closed';

    // Stage breakdown (includes Closed for visibility)
    if (!stageMap[status]) stageMap[status] = { count: 0, totalValue: 0, totalWeighted: 0, probability: prob, isClosed };
    stageMap[status].count++;
    stageMap[status].totalValue += val;
    stageMap[status].totalWeighted += weighted;

    // Category breakdown — exclude Closed (already in revenue records)
    if (!isClosed) {
      if (!categoryMap[category]) categoryMap[category] = { count: 0, totalValue: 0, totalWeighted: 0 };
      categoryMap[category].count++;
      categoryMap[category].totalValue += val;
      categoryMap[category].totalWeighted += weighted;
    }

    // Probability tier breakdown — exclude Closed and Dead leads
    if (!isClosed && status.toLowerCase() !== 'dead') {
      const tier = prob >= 80 ? 'high' : prob >= 50 ? 'mid' : 'low';
      if (!probTierMap[tier]) probTierMap[tier] = { count: 0, totalValue: 0, totalWeighted: 0 };
      probTierMap[tier].count++;
      probTierMap[tier].totalValue += val;
      probTierMap[tier].totalWeighted += weighted;
    }
  });

  // Sheet "Total Deals (Active)" uses Active-only totals for both revenue and weighted revenue.
  const { totalLeadRevenue, totalWeightedRevenue } = calculateLeadTotals(stageMap);
  const estimatedRevenue     = accRevYear + totalWeightedRevenue;

  // ── 5. Quarterly revenue ──────────────────────────────────────────────────
  const quarterlyRevenue = [0,1,2,3].map(q =>
    monthlyRevenue.slice(q*3, q*3+3).reduce((s,v) => s+v, 0)
  );
  // Quarterly goals (hardcoded from annual $1M goal breakdown)
  const quarterlyGoals = [75000, 225000, 410000, 1000000 - 75000 - 225000 - 410000]; // Q4 = remainder

  // ── 6. Build HTML ─────────────────────────────────────────────────────────
  const monthLabels = MONTHS_SHORT.map(m => `'${m}'`).join(',');
  const monthData   = monthlyRevenue.join(',');
  const goalLine    = new Array(12).fill(yearGoal / 12).join(',');
  const quarterLabels = "'Q1','Q2','Q3','Q4'";
  const quarterData   = quarterlyRevenue.join(',');
  const quarterGoalData = quarterlyGoals.join(',');

  const stageTableRows = Object.entries(stageMap)
    .sort((a, b) => b[1].totalValue - a[1].totalValue)
    .map(([stage, v]) => `
    <tr${v.isClosed ? ' style="opacity:0.55"' : ''}>
      <td><span class="badge badge-${stage.toLowerCase()}">${stage}</span>${v.isClosed ? ' <small style="color:#8b949e">(已計入收入)</small>' : ''}</td>
      <td>${v.count}</td>
      <td>${fmt(v.totalValue)}</td>
      <td>${v.probability ? v.probability + '%' : '-'}</td>
      <td class="highlight-text">${v.isClosed ? '-' : fmt(v.totalWeighted)}</td>
    </tr>`).join('');

  const categoryTableRows = Object.entries(categoryMap)
    .sort((a, b) => b[1].totalWeighted - a[1].totalWeighted)
    .map(([cat, v]) => `
    <tr>
      <td>${cat}</td>
      <td>${v.count}</td>
      <td>${fmt(v.totalValue)}</td>
      <td class="highlight-text">${fmt(v.totalWeighted)}</td>
    </tr>`).join('');

  const customerRevenueTableRows = customerRevenueTotals.map(customer => {
    const isOverThreshold = customer.totalRevenue > CUSTOMER_REVENUE_THRESHOLD;
    return `
    <tr${isOverThreshold ? ' class="threshold-hit"' : ''}>
      <td>${escapeHtml(customer.name)}</td>
      <td class="highlight-text">${fmt(customer.totalRevenue)}</td>
      <td><span class="badge ${isOverThreshold ? 'badge-active' : 'badge-unknown'}">${isOverThreshold ? 'Over $25K' : 'Below $25K'}</span></td>
    </tr>`;
  }).join('').trim();

  const averageDealValueTableRows = averageDealValueByCategory.map(category => `
    <tr>
      <td>${category.group}</td>
      <td>${category.customerCount}</td>
      <td>${category.dealCount}</td>
      <td>${fmt(category.revenue)}</td>
      <td class="highlight-text">${fmt(category.averageDealValue)}</td>
    </tr>`).join('').trim();

  const stagePieLabels = Object.keys(stageMap).map(s => `'${s}'`).join(',');
  const stagePieData   = Object.values(stageMap).map(v => v.count).join(',');
  const stageValueData = Object.values(stageMap).map(v => v.totalValue).join(',');

  // Probability tier KPI cards
  const probTiers = [
    { key: 'high', label: '>80% (High)',   color: '#3fb950', bg: '#1a4e2e', minProb: 80 },
    { key: 'mid',  label: '50~80% (Mid)',  color: '#e3b341', bg: '#2d2a14', minProb: 50 },
    { key: 'low',  label: '<50% (Low)',    color: '#f85149', bg: '#3d1f23', minProb: 0  },
  ];
  const probTierCards = probTiers.map(({ key, label, color, bg }) => {
    const d = probTierMap[key] || { count: 0, totalValue: 0, totalWeighted: 0 };
    return `
    <div class="kpi" style="border-color:${color};">
      <div class="label" style="color:${color};">${label}</div>
      <div class="value" style="color:${color};font-size:22px;">${fmt(d.totalValue)}</div>
      <div class="sub" style="color:#8b949e;margin-top:4px;">${d.count} leads</div>
      <div class="sub" style="margin-top:4px;">Weighted: <span style="color:${color};font-weight:600;">${fmt(d.totalWeighted)}</span></div>
      <div class="progress-bar" style="margin-top:10px;background:#21262d;"><div class="progress-fill" style="width:${d.totalValue > 0 ? Math.min(100,(d.totalWeighted/d.totalValue*100)).toFixed(1) : 0}%;background:${color};"></div></div>
    </div>`;
  }).join('');

  const achieveRate = yearGoal > 0 ? ((accRevYear / yearGoal) * 100).toFixed(1) : 0;
  const generatedAt = now.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }) + ' (Taipei)';

  const html = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <script>
    const shouldUpgradeProtocol = window.location.protocol === 'http:' &&
      !['localhost', '127.0.0.1'].includes(window.location.hostname);
    if (shouldUpgradeProtocol) {
      window.location.replace(window.location.href.replace(/^http:/, 'https:'));
    } else {
    const NX_AUTH_HASHES = ${JSON.stringify(DASHBOARD_AUTH_HASHES, null, 6)};
    if (!NX_AUTH_HASHES.includes(localStorage.getItem('nx_auth'))) {
      window.location.replace('index.html');
    }
    }
  <\/script>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nunox Business Dashboard ${curYear}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif; background: #0d1117; color: #c9d1d9; min-height: 100vh; }

    header {
      background: linear-gradient(135deg, #161b22 0%, #0d1117 100%);
      padding: 20px 40px;
      border-bottom: 1px solid #21262d;
      display: flex; justify-content: space-between; align-items: center;
    }
    .logo { font-size: 26px; font-weight: 900; letter-spacing: -1px; }
    .logo span { background: linear-gradient(135deg, #58a6ff, #bc8cff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    header .meta { text-align: right; }
    header .meta h1 { font-size: 15px; font-weight: 600; color: #e6edf3; }
    header .meta .gen { font-size: 11px; color: #484f58; margin-top: 3px; }

    .container { max-width: 1440px; margin: 0 auto; padding: 32px 40px; }

    .section-title {
      font-size: 11px; font-weight: 600; color: #484f58;
      text-transform: uppercase; letter-spacing: 1.5px;
      margin: 36px 0 16px;
      display: flex; align-items: center; gap: 8px;
    }
    .section-title::after { content: ''; flex: 1; height: 1px; background: #21262d; }

    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
    .kpi {
      background: #161b22; border: 1px solid #21262d; border-radius: 10px;
      padding: 18px 20px; position: relative; overflow: hidden;
      transition: border-color 0.2s, transform 0.15s;
    }
    .kpi:hover { border-color: #30363d; transform: translateY(-1px); }
    .kpi.accent { border-color: #1f6feb; }
    .kpi.accent::before { content:''; position:absolute; top:0; left:0; right:0; height:2px; background: linear-gradient(90deg, #58a6ff, #bc8cff); }
    .kpi .label { font-size: 11px; color: #484f58; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; }
    .kpi .value { font-size: 26px; font-weight: 700; color: #e6edf3; line-height: 1; }
    .kpi.accent .value { background: linear-gradient(135deg, #58a6ff, #bc8cff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .kpi .sub { font-size: 11px; color: #484f58; margin-top: 6px; }

    .progress-bar { height: 4px; background: #21262d; border-radius: 2px; margin-top: 10px; overflow: hidden; }
    .progress-fill { height: 100%; background: linear-gradient(90deg, #58a6ff, #bc8cff); border-radius: 2px; transition: width 0.6s ease; }

    .charts-grid { display: grid; grid-template-columns: 3fr 2fr; gap: 16px; }
    .chart-card {
      background: #161b22; border: 1px solid #21262d; border-radius: 10px;
      padding: 20px 24px;
    }
    .chart-card h3 { font-size: 11px; font-weight: 600; color: #484f58; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 16px; }
    .chart-card canvas { max-height: 260px; }

    .table-card { background: #161b22; border: 1px solid #21262d; border-radius: 10px; overflow: hidden; margin-top: 16px; }
    .table-card h3 { font-size: 11px; font-weight: 600; color: #484f58; text-transform: uppercase; letter-spacing: 1px; padding: 16px 20px; border-bottom: 1px solid #21262d; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #0d1117; color: #484f58; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; padding: 10px 20px; text-align: left; border-bottom: 1px solid #21262d; }
    td { padding: 11px 20px; border-bottom: 1px solid #161b22; color: #c9d1d9; }
    tr:hover td { background: #1c2128; }
    tr:last-child td { border-bottom: none; }
    .highlight-text { color: #58a6ff; font-weight: 600; }

    .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
    .badge-active { background: #1a4e2e; color: #3fb950; }
    .badge-dead   { background: #3d1f23; color: #f85149; }
    .badge-pending { background: #2d2a14; color: #e3b341; }
    .badge-unknown { background: #21262d; color: #8b949e; }
    tr.threshold-hit td { background: rgba(63, 185, 80, 0.04); }

    footer { text-align: center; padding: 40px; color: #21262d; font-size: 11px; }
  </style>
</head>
<body>

<header>
  <div class="logo"><span>Nunox</span></div>
  <div class="meta">
    <h1>Business Dashboard · ${curYear}</h1>
    <div class="gen" style="display:flex;align-items:center;gap:8px;">
      <span>Generated ${generatedAt}</span>
      <button id="refreshBtn" onclick="triggerRefresh()" title="Pull latest data from Google Sheets" style="background:none;border:1px solid #30363d;color:#8b949e;border-radius:4px;padding:2px 8px;cursor:pointer;font-size:11px;line-height:1.4;">🔄 Refresh</button>
      <script>
      async function triggerRefresh() {
        const btn = document.getElementById('refreshBtn');
        const currentGenerated = document.querySelector('.gen span')?.textContent || '';
        btn.disabled = true; btn.textContent = '⏳ Refreshing...'; btn.style.color='#58a6ff';
        try {
          const refreshEndpoint = 'https://sales-api.nunox-ai.com/refresh?s=nunox-refresh-2026';
          const r = await fetch(refreshEndpoint, { method: 'POST' });
          const text = await r.text();
          let data;
          try {
            data = JSON.parse(text);
          } catch (_) {
            throw new Error(\`Refresh endpoint returned \${r.status}: \${text.slice(0, 40)}\`);
          }
          if (!r.ok) throw new Error(data.error || \`Refresh endpoint returned \${r.status}\`);
          if (data.ok) {
            btn.textContent = '⏳ Publishing...';
            const latestUrl = 'https://api.github.com/repos/nikkienxel/nunox-dashboard/contents/dashboard.html?ref=main&t=';
            for (let attempt = 0; attempt < 24; attempt += 1) {
              await new Promise(resolve => setTimeout(resolve, attempt === 0 ? 15000 : 10000));
              const latestResp = await fetch(latestUrl + Date.now(), {
                cache: 'no-store',
                headers: { Accept: 'application/vnd.github.raw' }
              });
              if (!latestResp.ok) continue;
              const latestHtml = await latestResp.text();
              if (latestHtml.includes('Generated ') && !latestHtml.includes(currentGenerated)) {
                btn.textContent = '✅ Loading latest';
                document.open();
                document.write(latestHtml);
                document.close();
                return;
              }
            }
            throw new Error('Published, waiting for GitHub Pages cache');
          } else {
            throw new Error(data.error || 'Unknown error');
          }
        } catch(e) {
          btn.textContent = '❌ ' + e.message.substring(0, 30); btn.style.color='#f85149';
          setTimeout(() => { btn.textContent = '🔄 Refresh'; btn.disabled = false; btn.style.color='#8b949e'; }, 6000);
        }
      }
      <\/script>
    </div>
  </div>
</header>

<div class="container">

  <!-- Customers -->
  <div class="section-title">Customers</div>
  <div class="kpi-grid" style="grid-template-columns: repeat(4, 1fr); max-width: 800px;">
    <div class="kpi accent">
      <div class="label">Total Existing Customers</div>
      <div class="value">${totalCustomers}</div>
    </div>
    <div class="kpi accent">
      <div class="label">New (${curYear})</div>
      <div class="value">${newCustomers}</div>
    </div>
    <div class="kpi">
      <div class="label">New (${MONTHS_SHORT[curMonth]})</div>
      <div class="value">${newCustCount}</div>
    </div>
    <div class="kpi">
      <div class="label">Recurrent</div>
      <div class="value">${recurrentCustomers}</div>
    </div>
  </div>

  <!-- Revenue -->
  <div class="section-title">Revenue</div>
  <div class="kpi-grid">
    <div class="kpi accent">
      <div class="label">YTD Revenue ${curYear}</div>
      <div class="value">${fmt(accRevYear)}</div>
      <div class="sub">Goal: ${fmt(yearGoal)} · ${achieveRate}% achieved</div>
      <div class="progress-bar"><div class="progress-fill" style="width:${Math.min(achieveRate, 100)}%"></div></div>
    </div>
    <div class="kpi">
      <div class="label">Revenue This Month</div>
      <div class="value">${fmt(revenueThisMonth)}</div>
      <div class="sub">${MONTHS_SHORT[curMonth]} ${curYear}</div>
    </div>
    <div class="kpi">
      <div class="label">Recurring Revenue (${curYear} YTD)</div>
      <div class="value">${fmt(recurrentRevenue)}</div>
      <div class="sub">Repeating transactions · ${curYear}</div>
    </div>
    <div class="kpi accent">
      <div class="label">ARR</div>
      <div class="value">${fmt(arr)}</div>
      <div class="sub">Software revenue ${curYear-1}+${curYear} YTD</div>
    </div>
    <div class="kpi" style="border-color:#f85149;">
      <div class="label" style="color:#f85149;">Outstanding Balance</div>
      <div class="value" style="color:#f85149;">${fmt(outstandingBalance)}</div>
      <div class="sub" style="color:#6e2020;">Unpaid invoices</div>
    </div>
  </div>

  <!-- Charts -->
  <div class="section-title">Revenue Trend</div>
  <div class="charts-grid">
    <div class="chart-card">
      <h3>Monthly Revenue ${curYear}</h3>
      <canvas id="revenueBar"></canvas>
    </div>
    <div class="chart-card">
      <h3>Pipeline by Stage (Deal Count)</h3>
      <canvas id="pipelinePie"></canvas>
    </div>
  </div>

  <!-- Quarterly Chart -->
  <div class="section-title">Quarterly Revenue</div>
  <div class="charts-grid" style="grid-template-columns: 1fr 1fr;">
    <div class="chart-card">
      <h3>Quarterly Revenue vs Goal ${curYear}</h3>
      <canvas id="quarterBar"></canvas>
    </div>
    <div class="kpi-grid" style="grid-template-columns: 1fr 1fr; align-content: start; gap: 12px;">
      ${[0,1,2,3].map(q => `
      <div class="kpi ${quarterlyRevenue[q] > 0 ? 'accent' : ''}">
        <div class="label">Q${q+1} ${curYear}</div>
        <div class="value">${fmt(quarterlyRevenue[q])}</div>
        <div class="sub">Goal: ${fmt(quarterlyGoals[q])}</div>
        ${quarterlyGoals[q] > 0 ? `<div class="progress-bar"><div class="progress-fill" style="width:${Math.min((quarterlyRevenue[q]/quarterlyGoals[q]*100),100).toFixed(1)}%"></div></div>` : ''}
      </div>`).join('')}
    </div>
  </div>

  <!-- Customer Revenue Concentration -->
  <div class="section-title">Customer Revenue Threshold</div>
  <div class="kpi-grid" style="max-width: 900px;">
    <div class="kpi accent">
      <div class="label">Customers Over $25K</div>
      <div class="value">${customersOverThreshold.length}</div>
      <div class="sub">Threshold: ${fmt(CUSTOMER_REVENUE_THRESHOLD)}</div>
    </div>
    <div class="kpi">
      <div class="label">Share of Active Customers</div>
      <div class="value">${customerRevenueRatio.toFixed(1)}%</div>
      <div class="sub">${customersOverThreshold.length} / ${customerRevenueTotals.length} active Detail Records customers</div>
      <div class="progress-bar"><div class="progress-fill" style="width:${Math.min(customerRevenueRatio, 100).toFixed(1)}%"></div></div>
    </div>
    <div class="kpi">
      <div class="label">Active Customers Counted</div>
      <div class="value">${customerRevenueTotals.length}</div>
      <div class="sub">Unique active customers in Detail Records</div>
    </div>
  </div>

  <div class="table-card">
    <h3>Average Deal Value by Customer Type <small style="color:#8b949e;font-weight:400">(Active Detail Records customers, all years)</small></h3>
    <table>
      <thead><tr>
        <th>Customer Type</th>
        <th>Customers</th>
        <th>Deals</th>
        <th>Total NunoX Revenue</th>
        <th>Average Deal Value</th>
      </tr></thead>
      <tbody>
${averageDealValueTableRows}
      </tbody>
    </table>
  </div>

  <div class="table-card">
    <h3>Customer Transaction Totals <small style="color:#8b949e;font-weight:400">(Active Detail Records customers, all years)</small></h3>
    <table>
      <thead><tr>
        <th>Customer</th>
        <th>Total NunoX Revenue</th>
        <th>$25K Benchmark</th>
      </tr></thead>
      <tbody>
${customerRevenueTableRows}
      </tbody>
    </table>
  </div>

  <!-- Sales Pipeline -->
  <div class="section-title">Sales Pipeline</div>
  ${leadsPermissionError ? '<div style="background:#3d1f23;border:1px solid #f85149;border-radius:8px;padding:12px 16px;margin-bottom:16px;color:#f85149;font-size:13px;">⚠️ Sales Leads spreadsheet is currently inaccessible (permission error). Pipeline data may be stale. Please check sharing settings for the Sales Leads sheet.</div>' : ''}
  <div class="kpi-grid" style="max-width: 800px;">
    <div class="kpi">
      <div class="label">Active Leads Revenue</div>
      <div class="value">${fmt(totalLeadRevenue)}</div>
      <div class="sub">Active pipeline only</div>
    </div>
    <div class="kpi accent">
      <div class="label">Weighted Deals (Active)</div>
      <div class="value">${fmt(totalWeightedRevenue)}</div>
      <div class="sub">Probability-adjusted active deals</div>
    </div>
    <div class="kpi accent">
      <div class="label">Est. Revenue ${curYear}</div>
      <div class="value">${fmt(estimatedRevenue)}</div>
      <div class="sub">YTD + active weighted deals</div>
    </div>
  </div>

  <div class="table-card">
    <h3>Pipeline Breakdown by Stage</h3>
    <table>
      <thead>
        <tr>
          <th>Stage</th>
          <th>Leads</th>
          <th>Total Value</th>
          <th>Probability</th>
          <th>Weighted Value</th>
        </tr>
      </thead>
      <tbody>
        ${stageTableRows}
      </tbody>
    </table>
  </div>

  <!-- Probability Tier Breakdown -->
  <div class="section-title" style="margin-top:36px;">Pipeline by Probability</div>
  <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);max-width:900px;">
    ${probTierCards}
  </div>

  <!-- Category Breakdown -->
  <div class="table-card">
    <h3>Pipeline by Customer Category <small style="color:#8b949e;font-weight:400">(excl. Closed)</small></h3>
    <table>
      <thead><tr>
        <th>Category</th>
        <th>Leads</th>
        <th>Total Value</th>
        <th>Weighted Value</th>
      </tr></thead>
      <tbody>
        ${categoryTableRows}
      </tbody>
    </table>
  </div>

</div>

<footer>Nunox Business Dashboard · Auto-generated weekly · ${generatedAt}</footer>

<script>
const chartDefaults = {
  responsive: true,
  plugins: { legend: { display: false } },
  scales: {
    x: { ticks: { color: '#484f58', font: { size: 11 } }, grid: { color: '#21262d' } },
    y: { ticks: { color: '#484f58', font: { size: 11 }, callback: v => v>=1000? '$'+(v/1000).toFixed(0)+'K' : '$'+v }, grid: { color: '#21262d' } }
  }
};

// Revenue Bar
new Chart(document.getElementById('revenueBar'), {
  type: 'bar',
  data: {
    labels: [${monthLabels}],
    datasets: [
      {
        label: 'Revenue',
        data: [${monthData}],
        backgroundColor: ctx => {
          const i = ctx.dataIndex;
          return i === ${curMonth} ? 'rgba(88,166,255,0.85)' : 'rgba(88,166,255,0.3)';
        },
        borderColor: '#58a6ff',
        borderWidth: 1,
        borderRadius: 4,
      },
      {
        label: 'Monthly Goal',
        data: [${goalLine}],
        type: 'line',
        borderColor: 'rgba(188,140,255,0.5)',
        borderWidth: 1.5,
        borderDash: [4,4],
        pointRadius: 0,
        fill: false,
      }
    ]
  },
  options: { ...chartDefaults, plugins: { legend: { display: true, labels: { color: '#484f58', font: { size: 11 }, boxWidth: 12 } } } }
});

// Quarterly Bar
new Chart(document.getElementById('quarterBar'), {
  type: 'bar',
  data: {
    labels: [${quarterLabels}],
    datasets: [
      {
        label: 'Actual',
        data: [${quarterData}],
        backgroundColor: ['rgba(88,166,255,0.8)','rgba(88,166,255,0.4)','rgba(88,166,255,0.2)','rgba(88,166,255,0.1)'],
        borderColor: '#58a6ff',
        borderWidth: 1,
        borderRadius: 4,
      },
      {
        label: 'Goal',
        data: [${quarterGoalData}],
        backgroundColor: 'transparent',
        borderColor: 'rgba(188,140,255,0.5)',
        borderWidth: 2,
        borderRadius: 4,
        type: 'bar',
      }
    ]
  },
  options: {
    responsive: true,
    plugins: { legend: { display: true, labels: { color: '#484f58', font: { size: 11 }, boxWidth: 12 } } },
    scales: {
      x: { ticks: { color: '#484f58', font: { size: 12 } }, grid: { color: '#21262d' } },
      y: { ticks: { color: '#484f58', font: { size: 11 }, callback: v => v>=1000? '$'+(v/1000).toFixed(0)+'K' : '$'+v }, grid: { color: '#21262d' } }
    }
  }
});

// Pipeline Pie
new Chart(document.getElementById('pipelinePie'), {
  type: 'doughnut',
  data: {
    labels: [${stagePieLabels}],
    datasets: [{
      data: [${stagePieData}],
      backgroundColor: ['#3fb950','#f85149','#e3b341','#58a6ff','#bc8cff','#79c0ff','#d2a8ff'],
      borderColor: '#161b22',
      borderWidth: 3,
    }]
  },
  options: {
    responsive: true,
    cutout: '65%',
    plugins: {
      legend: { position: 'bottom', labels: { color: '#8b949e', padding: 14, font: { size: 11 }, boxWidth: 12 } }
    }
  }
});
</script>
</body>
</html>`;

  fs.writeFileSync(OUTPUT_HTML, html);
  console.log('✅ Dashboard written to:', OUTPUT_HTML);
  console.log(`   Customers: ${totalCustomers} total, ${newCustCount} new this month`);
  console.log(`   YTD Revenue: ${fmt(accRevYear)} / ${fmt(yearGoal)} goal (${achieveRate}%)`);
  console.log(`   This Month: ${fmt(revenueThisMonth)} | Recurrent YTD: ${fmt(recurrentRevenue)}`);
  console.log(`   ARR: ${fmt(arr)} | Outstanding: ${fmt(outstandingBalance)}`);
  console.log(`   Active customers over $25K: ${customersOverThreshold.length}/${customerRevenueTotals.length} (${customerRevenueRatio.toFixed(1)}%)`);
  averageDealValueByCategory.forEach(category => {
    console.log(`   Avg deal value ${category.group}: ${fmt(category.averageDealValue)} (${category.dealCount} deals)`);
  });
  console.log(`   Pipeline: ${fmt(totalLeadRevenue)} total | ${fmt(totalWeightedRevenue)} weighted`);
  console.log(`   Est. ${curYear} Revenue: ${fmt(estimatedRevenue)}`);
}

if (require.main === module) {
  main().catch(e => { console.error('❌', e.message); process.exit(1); });
}

module.exports = {
  normalizeHeader,
  requireHeaderIndex,
  toNum,
  fmt,
  calculateLeadTotals,
  normalizeCustomerName,
  buildCustomerProfiles,
  findCustomerProfile,
  isActiveCustomer,
  classifyCustomerCategory,
  aggregateCustomerRevenue,
  calculateAverageDealValueByCategory,
};

#!/usr/bin/env node
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_FILE = path.join(ROOT, 'token-dashboard.html');
const WORKSPACE_COPY = path.resolve(ROOT, '..', 'token-dashboard.html');
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || '/opt/homebrew/bin/openclaw';
const TZ = 'Asia/Taipei';

function number(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function fmtInt(value) {
  return Math.round(number(value)).toLocaleString('en-US');
}

function fmtCompact(value) {
  const n = number(value);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(Math.round(n));
}

function fmtDate(ms) {
  if (!ms) return '—';
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: TZ, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(ms));
}

function fmtAge(ms) {
  const n = number(ms);
  if (!n) return '—';
  const m = Math.round(n / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

function pct(part, whole) {
  const w = number(whole);
  if (!w) return 0;
  return Math.max(0, Math.min(100, (number(part) / w) * 100));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[c]));
}

function readSessions() {
  const stdout = execFileSync(OPENCLAW_BIN, ['sessions', '--all-agents', '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 20_000,
    env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH || ''}` },
  });
  return JSON.parse(stdout);
}

function summarize(raw, now = Date.now()) {
  const sessions = (raw.sessions || []).map((s) => {
    const input = number(s.inputTokens);
    const output = number(s.outputTokens);
    const context = number(s.totalTokens);
    const window = number(s.contextTokens);
    const cacheSaved = Math.max(0, input - context);
    const contextPct = pct(context, window);
    const ageMs = s.updatedAt ? now - s.updatedAt : number(s.ageMs);
    const status = !s.systemSent ? 'offline' : ageMs <= 45_000 ? 'working' : ageMs >= 86_400_000 ? 'stale' : 'online';
    return { ...s, input, output, context, window, cacheSaved, contextPct, ageMs, status };
  }).sort((a, b) => number(b.updatedAt) - number(a.updatedAt));

  const totals = sessions.reduce((acc, s) => {
    acc.input += s.input;
    acc.output += s.output;
    acc.context += s.context;
    acc.cacheSaved += s.cacheSaved;
    if (s.contextPct >= 70) acc.highContext += 1;
    if (s.status === 'stale' || s.status === 'offline') acc.stale += 1;
    return acc;
  }, { input: 0, output: 0, context: 0, cacheSaved: 0, highContext: 0, stale: 0 });

  const byAgent = new Map();
  const byModel = new Map();
  for (const s of sessions) {
    const a = byAgent.get(s.agentId) || { agent: s.agentId || 'unknown', sessions: 0, context: 0, input: 0, output: 0, latest: 0 };
    a.sessions += 1; a.context += s.context; a.input += s.input; a.output += s.output; a.latest = Math.max(a.latest, number(s.updatedAt));
    byAgent.set(a.agent, a);
    const model = s.model || 'unknown';
    byModel.set(model, (byModel.get(model) || 0) + 1);
  }

  return {
    generatedAt: now,
    sessions,
    totals,
    byAgent: [...byAgent.values()].sort((a, b) => b.context - a.context),
    byModel: [...byModel.entries()].sort((a, b) => b[1] - a[1]),
  };
}

function render(summary) {
  const rows = summary.sessions.slice(0, 80).map((s) => `
    <tr>
      <td><span class="badge ${s.status}">${escapeHtml(s.status)}</span></td>
      <td>${escapeHtml(s.agentId || '—')}</td>
      <td title="${escapeHtml(s.key)}">${escapeHtml((s.key || '').replace(/^agent:/, '').slice(0, 56))}</td>
      <td>${escapeHtml(s.kind || '—')}</td>
      <td>${escapeHtml(s.model || '—')}</td>
      <td class="num">${fmtCompact(s.context)} / ${fmtCompact(s.window)}</td>
      <td><div class="bar"><i style="width:${s.contextPct.toFixed(1)}%"></i></div><small>${s.contextPct.toFixed(1)}%</small></td>
      <td class="num">${fmtCompact(s.cacheSaved)}</td>
      <td>${fmtAge(s.ageMs)}</td>
      <td>${fmtDate(s.updatedAt)}</td>
    </tr>`).join('');

  const agentCards = summary.byAgent.map((a) => `
    <div class="mini"><b>${escapeHtml(a.agent)}</b><span>${a.sessions} sessions</span><strong>${fmtCompact(a.context)}</strong><small>latest ${fmtDate(a.latest)}</small></div>`).join('');
  const models = summary.byModel.map(([m, c]) => `<span class="pill">${escapeHtml(m)} · ${c}</span>`).join('');

  return `<!doctype html>
<html lang="zh-TW">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>OpenClaw Token Dashboard</title>
<style>
:root{color-scheme:dark;--bg:#0f1117;--panel:#171b26;--muted:#8b95a7;--line:#2b3345;--text:#e7edf7;--green:#68d391;--purple:#a78bfa;--yellow:#f6d365;--red:#fc8181;--blue:#63b3ed}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif}.wrap{max-width:1280px;margin:auto;padding:28px}.hero{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:22px}h1{margin:0;color:var(--purple);font-size:26px}p{color:var(--muted);margin:6px 0}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.card,.panel,.mini{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px}.label{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}.value{font-size:30px;font-weight:800;margin-top:6px}.green{color:var(--green)}.purple{color:var(--purple)}.yellow{color:var(--yellow)}.red{color:var(--red)}.section{margin-top:22px}.agentgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}.mini{display:flex;flex-direction:column;gap:5px}.mini span,.mini small{color:var(--muted)}.mini strong{font-size:24px}.pill{display:inline-block;background:#222a3a;border:1px solid var(--line);border-radius:999px;padding:6px 10px;margin:4px;color:#cbd5e1;font-size:12px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:10px;border-bottom:1px solid #202736;text-align:left;vertical-align:middle}th{color:var(--muted);font-size:11px;text-transform:uppercase;background:#131722;position:sticky;top:0}.num{text-align:right;font-variant-numeric:tabular-nums}.badge{border-radius:999px;padding:3px 8px;font-weight:700;font-size:10px}.working{background:#3a2d13;color:var(--yellow)}.online{background:#153120;color:var(--green)}.stale,.offline{background:#351818;color:var(--red)}.bar{height:7px;background:#2d3748;border-radius:999px;overflow:hidden;min-width:90px}.bar i{display:block;height:100%;background:linear-gradient(90deg,var(--blue),var(--purple));border-radius:999px}small{color:var(--muted)}.note{border-left:3px solid var(--purple);padding-left:12px}.tablewrap{overflow:auto;max-height:680px}.actions code{background:#151a24;border:1px solid var(--line);padding:2px 6px;border-radius:6px;color:#cbd5e1}@media(max-width:800px){.grid{grid-template-columns:1fr 1fr}.hero{display:block}.wrap{padding:18px}}@media(max-width:520px){.grid{grid-template-columns:1fr}}
</style>
</head>
<body><main class="wrap">
  <div class="hero"><div><h1>OpenClaw Token Dashboard</h1><p>Generated ${fmtDate(summary.generatedAt)} · static hourly refresh · no embedded gateway token</p></div><p class="actions"><code>bash token-dashboard-refresh.sh</code></p></div>
  <section class="grid">
    <div class="card"><div class="label">Active Sessions</div><div class="value purple">${summary.sessions.length}</div><p>All agents</p></div>
    <div class="card"><div class="label">Current Context</div><div class="value green">${fmtCompact(summary.totals.context)}</div><p>${fmtInt(summary.totals.context)} tokens</p></div>
    <div class="card"><div class="label">Estimated Cache Saved</div><div class="value yellow">${fmtCompact(summary.totals.cacheSaved)}</div><p>input - current context</p></div>
    <div class="card"><div class="label">Needs Attention</div><div class="value ${summary.totals.highContext ? 'red' : 'green'}">${summary.totals.highContext}</div><p>sessions above 70% context</p></div>
  </section>
  <section class="section panel note"><b>Optimization status:</b> regular automatic context/token compaction is handled by OpenClaw runtime. This dashboard now audits session pressure hourly without calling the LLM, so monitoring itself does not burn tokens.</section>
  <section class="section"><h2>Agents</h2><div class="agentgrid">${agentCards}</div></section>
  <section class="section panel"><h2>Models</h2>${models || '<p>No model data</p>'}</section>
  <section class="section panel"><h2>Sessions</h2><div class="tablewrap"><table><thead><tr><th>Status</th><th>Agent</th><th>Session</th><th>Kind</th><th>Model</th><th class="num">Context</th><th>Usage</th><th class="num">Cache Saved</th><th>Age</th><th>Updated</th></tr></thead><tbody>${rows}</tbody></table></div></section>
</main></body></html>`;
}

function main() {
  const summary = summarize(readSessions());
  const html = render(summary);
  fs.writeFileSync(OUT_FILE, html);
  fs.writeFileSync(WORKSPACE_COPY, html);
  console.log(`Wrote ${OUT_FILE}`);
  console.log(`Wrote ${WORKSPACE_COPY}`);
}

if (require.main === module) main();
module.exports = { summarize, render, fmtCompact, escapeHtml };

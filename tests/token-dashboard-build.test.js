'use strict';
const assert = require('assert');
const { summarize, render, escapeHtml } = require('../scripts/token-dashboard-build');

const now = Date.parse('2026-05-09T10:00:00Z');
const raw = { sessions: [
  { key: 'agent:main:test', agentId: 'main', kind: 'direct', model: 'gpt-5.5', systemSent: true, updatedAt: now - 30_000, inputTokens: 100000, outputTokens: 500, totalTokens: 40000, contextTokens: 200000 },
  { key: 'agent:nora:test', agentId: 'nora', kind: 'group', model: 'claude', systemSent: true, updatedAt: now - 90_000_000, inputTokens: 1000, outputTokens: 50, totalTokens: 800, contextTokens: 1000 },
] };
const summary = summarize(raw, now);
assert.equal(summary.sessions.length, 2);
assert.equal(summary.totals.context, 40800);
assert.equal(summary.totals.cacheSaved, 60200);
assert.equal(summary.totals.highContext, 1);
assert.equal(summary.sessions[0].status, 'working');
assert.equal(summary.sessions[1].status, 'stale');
assert.equal(escapeHtml('<x>'), '&lt;x&gt;');
const html = render(summary);
assert(html.includes('OpenClaw Token Dashboard'));
assert(!html.includes('<script'));
console.log('token-dashboard-build tests passed');

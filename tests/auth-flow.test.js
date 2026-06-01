'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const dashboardHtml = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
const refreshServer = fs.readFileSync(path.join(root, 'refresh-server.js'), 'utf8');
const weeklyUpdate = fs.readFileSync(path.join(root, 'weekly_update.sh'), 'utf8');
const { buildEmail, taipeiDate } = require('../scripts/send-weekly-dashboard-email');

assert(indexHtml.includes("window.location.href = 'dashboard.html'"));
assert(indexHtml.includes("window.location.replace('dashboard.html')"));
assert(indexHtml.includes("window.location.href.replace(/^http:/, 'https:')"));
assert(indexHtml.includes('sha256Hex'));
assert(indexHtml.includes('8d6a1a27345582135057aa7143fac3377143235699c4b316f6ae2cae4d72e93a'));
assert(!indexHtml.includes('btoa(u +'));
assert(!indexHtml.includes('new Blob([getDashboard()]'));
assert(!indexHtml.includes('function getDashboard()'));

assert(dashboardHtml.includes('const NX_AUTH_HASHES'));
assert(dashboardHtml.includes('8d6a1a27345582135057aa7143fac3377143235699c4b316f6ae2cae4d72e93a'));
assert(dashboardHtml.includes("window.location.href.replace(/^http:/, 'https:')"));
assert(dashboardHtml.includes("window.location.replace('index.html')"));
assert(dashboardHtml.includes('Refresh endpoint returned'));
assert(dashboardHtml.includes('https://sales-api.nunox-ai.com/refresh?s=nunox-refresh-2026'));
assert(!dashboardHtml.includes('raw.githubusercontent.com/nikkienxel/nunox-dashboard/main/refresh-endpoint.txt'));
assert(dashboardHtml.includes('api.github.com/repos/nikkienxel/nunox-dashboard/contents/dashboard.html'));
assert(dashboardHtml.includes('application/vnd.github.raw'));
assert(dashboardHtml.includes('document.write(latestHtml)'));
assert(!dashboardHtml.includes('window.location.reload(), 65000'));
assert(!dashboardHtml.includes('const data = await r.json();'));

assert(refreshServer.includes('const requestUrl = new URL(req.url'));
assert(refreshServer.includes("requestUrl.pathname === '/refresh'"));
assert(refreshServer.includes("requestUrl.searchParams.get('s')"));
assert(!refreshServer.includes("req.url === '/refresh'"));

const weeklyEmail = buildEmail({ date: '2026-06-01' });
assert.strictEqual(weeklyEmail.to, 'sales@nunox.io');
assert.strictEqual(weeklyEmail.subject, 'NunoX Weekly Business Dashboard - 2026-06-01');
assert(weeklyEmail.text.includes('https://sales.nunox-ai.com/dashboard.html'));
assert.strictEqual(taipeiDate(new Date('2026-05-31T16:30:00.000Z')), '2026-06-01');
assert(weeklyUpdate.includes('node scripts/send-weekly-dashboard-email.js'));
assert(weeklyUpdate.indexOf('git push') < weeklyUpdate.indexOf('node scripts/send-weekly-dashboard-email.js'));

console.log('auth-flow tests passed');

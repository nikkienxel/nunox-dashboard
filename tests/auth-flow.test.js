'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const dashboardHtml = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
const refreshServer = fs.readFileSync(path.join(root, 'refresh-server.js'), 'utf8');

assert(indexHtml.includes("window.location.href = 'dashboard.html'"));
assert(indexHtml.includes("window.location.replace('dashboard.html')"));
assert(!indexHtml.includes('new Blob([getDashboard()]'));
assert(!indexHtml.includes('function getDashboard()'));

assert(dashboardHtml.includes('const NX_AUTH_TOKEN'));
assert(dashboardHtml.includes("window.location.replace('index.html')"));
assert(dashboardHtml.includes('Refresh endpoint returned'));
assert(dashboardHtml.includes('api.github.com/repos/nikkienxel/nunox-dashboard/contents/dashboard.html'));
assert(dashboardHtml.includes('application/vnd.github.raw'));
assert(dashboardHtml.includes('document.write(latestHtml)'));
assert(!dashboardHtml.includes('window.location.reload(), 65000'));
assert(!dashboardHtml.includes('const data = await r.json();'));

assert(refreshServer.includes('const requestUrl = new URL(req.url'));
assert(refreshServer.includes("requestUrl.pathname === '/refresh'"));
assert(refreshServer.includes("requestUrl.searchParams.get('s')"));
assert(!refreshServer.includes("req.url === '/refresh'"));

console.log('auth-flow tests passed');

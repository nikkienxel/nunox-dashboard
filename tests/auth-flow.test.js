'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const dashboardHtml = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');

assert(indexHtml.includes("window.location.href = 'dashboard.html'"));
assert(indexHtml.includes("window.location.replace('dashboard.html')"));
assert(!indexHtml.includes('new Blob([getDashboard()]'));
assert(!indexHtml.includes('function getDashboard()'));

assert(dashboardHtml.includes('const NX_AUTH_TOKEN'));
assert(dashboardHtml.includes("window.location.replace('index.html')"));

console.log('auth-flow tests passed');

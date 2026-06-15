#!/usr/bin/env node
/**
 * Nunox Dashboard Refresh Server
 * Runs on port 3101 by default. Called by the dashboard's Refresh button via Cloudflare tunnel.
 * Executes fetch-data.js + build-index.js + git push on demand.
 */

const http  = require('http');
const path  = require('path');
const { execFile } = require('child_process');

const PORT   = Number(process.env.REFRESH_PORT || 3101);
const DIR    = __dirname;
const SECRET = process.env.REFRESH_SECRET || 'nunox-refresh-2026';

function run(script, args, env) {
  return new Promise((resolve, reject) => {
    execFile('node', [path.join(DIR, script), ...args], { cwd: DIR, env: { ...process.env, ...env }, timeout: 120000 },
      (err, stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message));
        else resolve(stdout);
      }
    );
  });
}

function runGit(...args) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd: DIR, timeout: 30000 },
      (err, stdout, stderr) => err ? reject(new Error(stderr || err.message)) : resolve(stdout)
    );
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Refresh-Secret');

  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const requestUrl = new URL(req.url, 'http://localhost');

  if (requestUrl.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, time: new Date().toISOString() }));
  }

  if (requestUrl.pathname === '/refresh' && (req.method === 'POST' || req.method === 'GET')) {
    const secret = req.headers['x-refresh-secret'] || requestUrl.searchParams.get('s');
    if (secret !== SECRET) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'unauthorized' }));
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, message: 'Refresh started — dashboard will update in ~60s' }));

    // Run async after responding
    (async () => {
      const log = msg => console.log(`[${new Date().toISOString()}] ${msg}`);
      try {
        log('▶ fetch-data.js...');
        await run('fetch-data.js', [], {});
        log('▶ build-index.js...');
        await run('build-index.js', []);
        log('▶ git add + commit + push...');
        await runGit('add', 'dashboard.html', 'index.html');
        try {
          await runGit('commit', '-m', `Refresh: ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })} (Taipei)`);
          await runGit('push');
          log('✅ Done — dashboard updated');
        } catch (e) {
          if (e.message.includes('nothing to commit')) log('ℹ️ No changes to commit');
          else throw e;
        }
      } catch (err) {
        log('❌ Error: ' + err.message);
      }
    })();
    return;
  }

  res.writeHead(404); res.end('not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[${new Date().toISOString()}] Nunox refresh server running on port ${PORT}`);
});

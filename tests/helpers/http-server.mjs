// Server HTTP lokal që ekzekuton funksionet reale të /api mbi PGlite dhe shërben /public (për teste dhe zhvillim).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const rewrites = { '/api/login': 'auth?a=login', '/api/logout': 'auth?a=logout', '/api/whoami': 'auth?a=whoami', '/api/password': 'auth?a=password' };
const mime = { '.mjs': 'text/javascript; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css' };
const cache = {};

export function setTestEnv(extra = {}) {
  Object.assign(process.env, {
    DATABASE_URL: 'pglite://memory',
    AUTH_SECRET: 'x'.repeat(48),
    DATA_KEY: Buffer.alloc(32, 7).toString('base64'),
    ADMIN_EMAIL: 'admin@test.al',
    ADMIN_PASSWORD: 'AdminPass12345',
    CRON_SECRET: 'cron-secret',
  }, extra);
}

export function startServer(port = 0) {
  setTestEnv();
  const server = http.createServer(async (req, res) => {
    // Vetëm për jsdom: XHR sinkron nuk dërgon cookie, ndaj lejohet kokë ekuivalente në testim
    if (req.headers['x-test-cookie']) req.headers.cookie = req.headers['x-test-cookie'];
    const url = new URL(req.url, 'http://x');
    let pathname = url.pathname, search = url.search;
    if (pathname.startsWith('/api/v2/')) { search = '?p=' + encodeURIComponent(pathname.slice(8)).replace(/%2F/g, '/') + (search ? '&' + search.slice(1) : ''); pathname = '/api/v2'; }
    if (rewrites[pathname]) { const [f, q] = rewrites[pathname].split('?'); pathname = '/api/' + f; search = '?' + q; }
    if (pathname.startsWith('/api/')) {
      const name = pathname.slice(5), file = path.join(root, 'api', name + '.js');
      if (name.startsWith('_') || !fs.existsSync(file)) { res.statusCode = 404; return res.end(); }
      const chunks = []; for await (const c of req) chunks.push(c);
      const raw = Buffer.concat(chunks).toString();
      try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = {}; }
      req.query = Object.fromEntries(new URLSearchParams(search)); req.url = pathname + search;
      res.status = (c) => { res.statusCode = c; return res; };
      res.send = (b) => res.end(b);
      res.json = (o) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
      const mod = cache[file] || (cache[file] = await import(pathToFileURL(file).href));
      return mod.default(req, res);
    }
    const f = path.join(root, 'public', pathname === '/' ? 'index.html' : pathname.endsWith('/') ? pathname + 'index.html' : pathname);
    if (!f.startsWith(path.join(root, 'public')) || !fs.existsSync(f)) { res.statusCode = 404; return res.end('nf'); }
    res.setHeader('Content-Type', mime[path.extname(f)] || 'text/plain'); res.end(fs.readFileSync(f));
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, port: server.address().port, base: 'http://127.0.0.1:' + server.address().port })));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { port } = await startServer(Number(process.argv[2]) || 3000);
  console.log('CRM lokal (PGlite): http://127.0.0.1:' + port);
}

// Server në proces të veçantë (nevojitet kur testi përdor jsdom: XHR sinkron e bllokon procesin e vet).
export async function startServerProcess() {
  const { spawn } = await import('node:child_process');
  const port = 41000 + Math.floor(Math.random() * 15000);
  const child = spawn(process.execPath, ['--import', path.join(root, 'tests', 'helpers', 'register.mjs'), fileURLToPath(import.meta.url), String(port)], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve, reject) => {
    child.stdout.on('data', (d) => { if (String(d).includes('CRM lokal')) resolve(); });
    child.on('exit', (code) => reject(new Error('serveri doli: ' + code)));
  });
  const base = 'http://127.0.0.1:' + port;
  for (let i = 0; i < 60; i += 1) { try { if ((await fetch(base + '/api/health')).ok) break; } catch { /* pritje */ } await new Promise((r) => setTimeout(r, 500)); }
  return { base, port, server: { close: () => child.kill() } };
}

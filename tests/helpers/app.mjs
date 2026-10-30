// Ngarkon aplikacionin e ri (public/app) në jsdom dhe e drejton me ngjarje të vërteta DOM, kundrejt serverit lokal.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function waitFor(fn, { timeout = 6000, label = 'kusht' } = {}) {
  const t0 = Date.now(); let last;
  while (Date.now() - t0 < timeout) { try { const v = fn(); if (v) return v; } catch (e) { last = e; } await sleep(25); }
  throw new Error(`Timeout duke pritur: ${label}${last ? ' (' + last.message + ')' : ''}`);
}

export async function bootApp(base, cookie, { hash = '#/tasks' } = {}) {
  const page = fs.readFileSync(path.join(root, 'public', 'app', 'index.html'), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
  const dom = new JSDOM(page, { url: `${base}/app/${hash}`, pretendToBeVisual: true });
  const w = dom.window, g = globalThis;
  const define = (k, v) => Object.defineProperty(g, k, { value: v, configurable: true, writable: true });
  for (const k of ['window', 'document', 'location', 'localStorage', 'FormData', 'Event', 'HTMLElement', 'Node', 'FileReader', 'File', 'Blob', 'history']) define(k, w[k] ?? w);
  define('window', w); define('document', w.document); define('location', w.location);
  define('addEventListener', w.addEventListener.bind(w)); define('removeEventListener', w.removeEventListener.bind(w)); define('dispatchEvent', w.dispatchEvent.bind(w));
  const nodeFetch = globalThis.__nodeFetch || (globalThis.__nodeFetch = globalThis.fetch);
  define('fetch', (u, o = {}) => nodeFetch(new URL(u, base), { ...o, headers: { ...(o.headers || {}), cookie } }));
  define('__TEST__', true);
  w.HTMLElement.prototype.scrollIntoView = () => {}; w.scrollTo = () => {};
  const { start } = await import(pathToFileURL(path.join(root, 'public', 'app', 'main.js')).href + '?t=' + Math.random());
  const app = await start({ poll: false });
  const $ = (s) => w.document.querySelector(s), $$ = (s) => [...w.document.querySelectorAll(s)];
  const api = {
    w, d: w.document, $, $$, app, text: (s) => ($(s) ? $(s).textContent : ''),
    go: async (h) => { w.location.hash = h; await sleep(30); },
    click: (el) => { (typeof el === 'string' ? $(el) : el).click(); },
    type: (sel, v) => { const el = $(sel); el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); },
    choose: (sel, v) => { const el = $(sel); el.value = v; el.dispatchEvent(new w.Event('change', { bubbles: true })); },
    view: () => $('#view').textContent,
    attach: (target, name = 'dokument.pdf', text = 'prove') => { const el = typeof target === 'string' ? $(target) : target; const file = new w.File([`%PDF-1.4\n${text}\n%%EOF\n`], name, { type: 'application/pdf' }); Object.defineProperty(el, 'files', { value: [file], configurable: true }); return file; },
    banner: () => $('#banner-root .banner'),
    toasts: () => $$('#toast-root .toast').map((t) => t.textContent),
    close: () => w.close(),
  };
  return api;
}

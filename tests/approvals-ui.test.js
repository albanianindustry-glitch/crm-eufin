import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code = fs.readFileSync(new URL('../public/approvals.js', import.meta.url), 'utf8');
function mk(role, reqs, clients, k) {
  const el = () => ({ style: {}, classList: { contains: () => false }, innerHTML: '', insertAdjacentElement() {}, appendChild() {}, querySelector: () => null }), store = { crmReq: JSON.stringify(reqs) }, calls = [], decisions = new Set(), X = { k };
  const ctx = {
    window: { XAPI: { X, E: (x) => String(x), sec: (a, b) => b, TODAY: '2026-10-18', sv() { calls.push('sv'); } }, CRM_ME: { name: 'Ana', role }, switchTab() {}, addEventListener() {}, xFd: (s) => s, xHist: (cid, t) => calls.push('hist:' + t), xKAttach: (kk, pd) => calls.push('attach:' + pd.name) },
    document: { getElementById: el, createElement: el, querySelectorAll: () => [] }, localStorage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; } },
    clients, saveData() { calls.push('saveData'); }, setInterval() {}, confirm: () => true, prompt: () => 'arsye', alert: (m) => calls.push('alert:' + m), JSON, Object, Array, String, Date,
    fetch: async (url, options) => {
      const body = JSON.parse(options.body); calls.push({ url, body });
      if (decisions.has(body.action.id)) return { ok: false, status: 409, json: async () => ({ error: 'Kërkesa është vendosur më parë.' }) };
      decisions.add(body.action.id);
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    },
  };
  ctx.window.window = ctx.window; vm.createContext(ctx);
  vm.runInContext(code.replace(/^\(function \(\) \{/, '(function () { var window = this.window;').replace(/\}\)\(\);\s*$/, '}).call(this);'), ctx);
  return { win: ctx.window, store, calls, X, clients };
}
const R = (x) => ({ id: 'r1', by: 'Laura', at: '2026-10-18T10:00:00Z', st: 'pending', label: 'ABE', cid: 1, changes: [], ...x });

test('miratimi/refuzimi i klientit dërgon vendimin në API; UI nuk e aplikon patch-in lokalisht', async () => {
  const cl = [{ id: 1, emriKompanise: 'ABE', tarifaMujore: '100' }], s = mk('admin', [R({ kind: 'client', patch: { tarifaMujore: '200' }, changes: [{ k: 'tarifaMujore', from: '100', to: '200' }] })], cl, []);
  s.win.xReqOk('r1'); await new Promise((resolve) => setImmediate(resolve));
  assert.equal(cl[0].tarifaMujore, '100');
  assert.ok(s.calls.some((call) => call.url === '/api/store' && call.body.action.decision === 'approved'));
  const cl2 = [{ id: 1, emriKompanise: 'ABE', tarifaMujore: '100' }], t = mk('admin', [R({ kind: 'client', patch: { tarifaMujore: '200' } })], cl2, []);
  t.win.xReqNo('r1'); await new Promise((resolve) => setImmediate(resolve));
  assert.equal(cl2[0].tarifaMujore, '100');
  assert.ok(t.calls.some((call) => call.url === '/api/store' && call.body.action.decision === 'rejected' && call.body.action.reason === 'arsye'));
});
test('vendimet për kontratën dërgohen te endpoint-i server-side; UI nuk ndryshon kontratën lokalisht', async () => {
  const cl = [{ id: 1, docs: [{ id: 'd1', kid: 'k1' }] }], k = [{ id: 'k1', cid: 1, doc: 'd1', type: 'qera', lb: 'Zyra', end: '2027-01-01' }];
  const s = mk('admin', [R({ kind: 'contract', op: 'del', kid: 'k1' })], cl, k); s.win.xReqOk('r1'); await new Promise((resolve) => setImmediate(resolve));
  assert.equal(s.X.k.length, 1); assert.equal(cl[0].docs[0].archived, undefined);
  assert.ok(s.calls.some((call) => call.url === '/api/store' && call.body.action.id === 'r1'));
  const k2 = [{ id: 'k1', cid: 1, doc: 'd1', type: 'qera', end: '2027-01-01' }], t = mk('admin', [R({ kind: 'contract', op: 'edit', kid: 'k1', patch: { end: '2028-01-01', pendingDoc: { name: 'e-re.pdf', data: 'u' } } })], [{ id: 1 }], k2);
  t.win.xReqOk('r1'); await new Promise((resolve) => setImmediate(resolve));
  assert.equal(k2[0].end, '2027-01-01');
  assert.ok(t.calls.some((call) => call.url === '/api/store' && call.body.action.decision === 'approved'));
});
test('UI nuk aplikon lokalisht vendime të përsëritura; serveri kthen conflict; përdoruesi i zakonshëm nuk ka akses', async () => {
  const cl = [{ id: 1, tarifaMujore: '100' }], s = mk('admin', [R({ kind: 'client', patch: { tarifaMujore: '200' } })], cl, []);
  s.win.xReqOk('r1'); await new Promise((resolve) => setImmediate(resolve));
  cl[0].tarifaMujore = '300'; s.win.xReqOk('r1'); await new Promise((resolve) => setImmediate(resolve));
  assert.equal(cl[0].tarifaMujore, '300');
  assert.equal(s.calls.filter((call) => call.url === '/api/store').length, 2);
  assert.ok(s.calls.some((call) => typeof call === 'string' && call.includes('vendosur më parë')));
  assert.equal(mk('user', [], [], []).win.xReqOk, undefined);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code = fs.readFileSync(new URL('../public/approvals.js', import.meta.url), 'utf8');
function mk(role, reqs, clients, k) {
  const el = () => ({ style: {}, classList: { contains: () => false }, innerHTML: '', insertAdjacentElement() {}, appendChild() {}, querySelector: () => null }), store = { crmReq: JSON.stringify(reqs) }, calls = [], X = { k };
  const ctx = {
    window: { XAPI: { X, E: (x) => String(x), sec: (a, b) => b, TODAY: '2026-10-18', sv() { calls.push('sv'); } }, CRM_ME: { name: 'Ana', role }, switchTab() {}, addEventListener() {}, xFd: (s) => s, xHist: (cid, t) => calls.push('hist:' + t), xKAttach: (kk, pd) => calls.push('attach:' + pd.name) },
    document: { getElementById: el, createElement: el, querySelectorAll: () => [] }, localStorage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; } },
    clients, saveData() { calls.push('saveData'); }, re() {}, setInterval() {}, confirm: () => true, prompt: () => 'arsye', alert: (m) => calls.push('alert:' + m), JSON, Object, Array, String, Date,
  };
  ctx.window.window = ctx.window; vm.createContext(ctx);
  vm.runInContext(code.replace(/^\(function \(\) \{/, '(function () { var window = this.window;').replace(/\}\)\(\);\s*$/, '}).call(this);'), ctx);
  return { win: ctx.window, store, calls, X, clients };
}
const R = (x) => ({ id: 'r1', by: 'Laura', at: '2026-10-18T10:00:00Z', st: 'pending', label: 'ABE', cid: 1, changes: [], ...x });

test('miratimi i klientit zbaton ndryshimin dhe e shënon të miratuar; refuzimi e lë të pandryshuar', () => {
  const cl = [{ id: 1, emriKompanise: 'ABE', tarifaMujore: '100' }], s = mk('admin', [R({ kind: 'client', patch: { tarifaMujore: '200' }, changes: [{ k: 'tarifaMujore', from: '100', to: '200' }] })], cl, []);
  s.win.xReqOk('r1'); assert.equal(cl[0].tarifaMujore, '200'); const saved = JSON.parse(s.store.crmReq)[0]; assert.equal(saved.st, 'approved'); assert.equal(saved.dec, 'Ana');
  const cl2 = [{ id: 1, emriKompanise: 'ABE', tarifaMujore: '100' }], t = mk('admin', [R({ kind: 'client', patch: { tarifaMujore: '200' } })], cl2, []);
  t.win.xReqNo('r1'); assert.equal(cl2[0].tarifaMujore, '100'); const rj = JSON.parse(t.store.crmReq)[0]; assert.equal(rj.st, 'rejected'); assert.equal(rj.why, 'arsye');
});
test('miratimi i fshirjes së kontratës e arkivon PDF-në dhe heq kontratën; modifikimi me PDF të re e bashkon dokumentin', () => {
  const cl = [{ id: 1, docs: [{ id: 'd1', kid: 'k1' }] }], k = [{ id: 'k1', cid: 1, doc: 'd1', type: 'qera', lb: 'Zyra', end: '2027-01-01' }];
  const s = mk('admin', [R({ kind: 'contract', op: 'del', kid: 'k1' })], cl, k); s.win.xReqOk('r1');
  assert.equal(s.X.k.length, 0); assert.equal(cl[0].docs[0].archived, true); assert.ok(s.calls.some((c) => c.startsWith('hist:Kontratë e fshirë (miratuar nga Ana)')));
  const k2 = [{ id: 'k1', cid: 1, doc: 'd1', type: 'qera', end: '2027-01-01' }], t = mk('admin', [R({ kind: 'contract', op: 'edit', kid: 'k1', patch: { end: '2028-01-01', pendingDoc: { name: 'e-re.pdf', data: 'u' } } })], [{ id: 1 }], k2);
  t.win.xReqOk('r1'); assert.equal(k2[0].end, '2028-01-01'); assert.ok(t.calls.includes('attach:e-re.pdf')); assert.equal(k2[0].pendingDoc, undefined);
});
test('kërkesa e zbatuar dy herë nuk zbatohet përsëri; përdoruesi i zakonshëm nuk ka akses', () => {
  const cl = [{ id: 1, tarifaMujore: '100' }], s = mk('admin', [R({ kind: 'client', patch: { tarifaMujore: '200' } })], cl, []);
  s.win.xReqOk('r1'); cl[0].tarifaMujore = '300'; s.win.xReqOk('r1'); assert.equal(cl[0].tarifaMujore, '300');
  assert.equal(mk('user', [], [], []).win.xReqOk, undefined);
});

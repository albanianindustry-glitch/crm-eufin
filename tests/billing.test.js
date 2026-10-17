import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const MN = ['Janar', 'Shkurt', 'Mars', 'Prill', 'Maj', 'Qershor', 'Korrik', 'Gusht', 'Shtator', 'Tetor', 'Nëntor', 'Dhjetor'];
const load = (f) => fs.readFileSync(new URL('../public/' + f, import.meta.url), 'utf8');
function mk(file, extra = {}) {
  const els = {}, el = (id) => (els[id] = els[id] || { value: '', style: {}, classList: { contains: () => false }, innerHTML: '', insertAdjacentElement() {}, addEventListener() {}, appendChild() {}, querySelector: () => null });
  const X = { mt: [], sv: [], users: ['Ana', 'Besa'], ...extra.X }, calls = [];
  const ctx = {
    window: { XAPI: { X, E: (x) => String(x), sec: (a, b) => b, TODAY: '2026-10-15', MN, sv() { calls.push('sv'); } }, CRM_ME: { name: extra.me || 'Ana', role: 'admin' }, switchTab() {}, addEventListener() {}, xFd: (s) => s, xToast() {} },
    document: { querySelector: () => el('tabs'), querySelectorAll: () => [], createElement: () => el('new'), getElementById: el, body: { appendChild() {} } },
    clients: extra.clients || [], act: () => extra.clients || [], stM: () => '2026-01', prompt: () => 'NR1', confirm: () => true, alert() {}, saveData() {},
    Date, JSON, Object, Array, String, Math, Set, Number, setInterval() {}, localStorage: { getItem: () => null, setItem() {} }, fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve([]) }), ...extra.g,
  };
  ctx.window.window = ctx.window; vm.createContext(ctx);
  vm.runInContext(load(file).replace(/^\(function \(\) \{/, '(function () { var window = this.window;').replace(/\}\)\(\);\s*$/, '}).call(this);'), ctx);
  return { ctx, X, els, calls };
}
const CL = [{ id: 1, nipt: 'L1', emriKompanise: 'ABE', tarifaMujore: '15000', payMode: 'pf_bank' }, { id: 2, nipt: 'L2', emriKompanise: 'Pa tarifë', tarifaMujore: '0' }];

test('gjenerimi: tarifa + shërbimet pa faturuar, pa dublikime', () => {
  const s = mk('billing.js', { clients: CL, X: { sv: [{ id: 's1', cid: 1, type: 'PASH', bill: 'inv', amt: '5000', invd: false }, { id: 's2', cid: 1, type: 'Tjetër', bill: 'fee', amt: '', invd: false }] } });
  s.els.fat_per = { value: '2026-10' }; s.ctx.window.xFatGen();
  assert.equal(s.X.fat.length, 1);
  const f = s.X.fat[0];
  assert.equal(f.lines.length, 2); assert.equal(f.lines.reduce((a, l) => a + l.a, 0), 20000); assert.equal(f.mode, 'pf_bank');
  s.ctx.window.xFatGen(); assert.equal(s.X.fat.length, 1); assert.equal(s.X.fat[0].lines.length, 2);
});
test('proformë + bankë: 3 hapa, mbyllja e fiskales shënon shërbimin e faturuar; zhbërja e kthen', () => {
  const s = mk('billing.js', { clients: CL, X: { sv: [{ id: 's1', cid: 1, type: 'PASH', bill: 'inv', amt: '5000', invd: false }] } });
  s.els.fat_per = { value: '2026-10' }; s.ctx.window.xFatGen(); const f = s.X.fat[0], next = () => s.ctx.window.xFatNext(f.id);
  next(); assert.ok(f.proAt && !f.paidAt && f.proNo === 'NR1');
  next(); assert.ok(f.paidAt && !f.fisAt);
  next(); assert.ok(f.fisAt && f.fisNo === 'NR1'); assert.equal(s.X.sv[0].invd, true);
  s.ctx.window.xFatUndo(f.id); assert.equal(f.fisAt, ''); assert.equal(s.X.sv[0].invd, false);
});
test('fiskale me bankë: fillon me fiskalen, pastaj pagesa', () => {
  const s = mk('billing.js', { clients: [{ ...CL[0], payMode: 'fi_bank' }] });
  s.els.fat_per = { value: '2026-10' }; s.ctx.window.xFatGen(); const f = s.X.fat[0];
  s.ctx.window.xFatNext(f.id); assert.ok(f.fisAt && !f.paidAt && !f.proAt);
  s.ctx.window.xFatNext(f.id); assert.ok(f.paidAt);
});
test('proformë + cash dhe ndryshimi i mënyrës ruhet te klienti', () => {
  const s = mk('billing.js', { clients: [{ ...CL[0] }] });
  s.els.fat_per = { value: '2026-10' }; s.ctx.window.xFatGen(); const f = s.X.fat[0];
  s.ctx.window.xFatMode(f.id, 'pf_cash'); assert.equal(f.mode, 'pf_cash'); assert.equal(s.ctx.clients[0].payMode, 'pf_cash');
});
test('paneli i menaxherit: ngarkesa, koha dhe Lekë/orë për klient', () => {
  const T = [
    { id: 1, st: 'done', doneAt: '2026-10-10', doneBy: 'Ana', us: ['Ana'], cid: 1, mins: 120 },
    { id: 2, st: 'done', doneAt: '2026-10-11', doneBy: 'Ana', us: ['Ana'], cid: 1, mins: 60 },
    { id: 3, st: 'todo', due: '2026-10-01', us: ['Besa'], u: 'Besa' },
    { id: 4, st: 'done', doneAt: '2026-09-02', doneBy: 'Besa', us: ['Besa'], cid: 1, mins: 600 },
  ];
  const s = mk('billing.js', { clients: CL, X: { mt: T, fat: [{ id: 'f', cid: 1, per: '2026-10', lines: [{ a: 15000 }], paidAt: 'x', fisAt: 'x' }] } });
  const d = s.ctx.window.xMgrData(), ana = d.users.find((u) => u.name === 'Ana'), besa = d.users.find((u) => u.name === 'Besa');
  assert.deepEqual([ana.done, ana.mins, ana.open], [2, 180, 0]); assert.deepEqual([besa.open, besa.late, besa.done], [1, 1, 0]);
  const c = d.clients.find((x) => x.name === 'ABE'); assert.deepEqual([c.mins, c.rate], [180, 5000]);
  assert.equal(JSON.stringify(d.bill), JSON.stringify({ total: 15000, issued: 15000, paid: 15000, n: 1 }));
});
test('chat: mesazhet e palexuara numërohen sipas bisedës; të miat nuk numërohen', async () => {
  const M = [
    { id: 1, from_name: 'Besa', to_name: null, text: 'Mirëmëngjes ekip', at: '2026-10-15T08:00:00Z' },
    { id: 2, from_name: 'Besa', to_name: 'Ana', text: 'A e mbylle PASH?', at: '2026-10-15T08:01:00Z' },
    { id: 3, from_name: 'Ana', to_name: 'Besa', text: 'Po, sapo', at: '2026-10-15T08:02:00Z' },
    { id: 4, from_name: 'Gent', to_name: 'Ana', text: 'Ke një minutë?', at: '2026-10-15T08:03:00Z' },
  ];
  const s = mk('chat.js', { me: 'Ana', X: { users: ['Ana', 'Besa', 'Gent'] }, g: { fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve(M) }) } });
  const pushes = []; s.ctx.window.xChatCards = (c) => pushes.push(c);
  await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r));
  const st = s.ctx.window.xChatState();
  assert.equal(st.msgs.length, 4);
  assert.equal(st.unread(''), 1); assert.equal(st.unread('Besa'), 1); assert.equal(st.unread('Gent'), 1);
  assert.equal(st.totalUnread(), 3);
  const last = pushes[pushes.length - 1];
  assert.equal(last.length, 3); assert.equal(last.find((c) => c.convo === 'Besa').text, 'A e mbylle PASH?'); assert.ok(last.find((c) => c.convo === '').from.includes('Ekipi'));
  s.ctx.window.xChatAck('Besa'); assert.equal(st.unread('Besa'), 0); assert.equal(pushes[pushes.length - 1].length, 2);
});
